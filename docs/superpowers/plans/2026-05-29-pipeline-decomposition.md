# Pipeline Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the single monolithic dossier and score Opus calls into focused sub-step calls with parallelism, shorter context windows, and early-exit capability.

**Architecture:** Each pipeline step (dossier, score) is split into phases of sub-step calls. Each sub-step gets only the template/rubric sections relevant to its task. Independent sub-steps run in parallel via `Promise.all`. The frontend is unchanged -- all sub-steps emit under the parent step name (`'dossier'` or `'score'`). The public API (`runDossier`, `runScore`) keeps the same signature.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, Fastify SSE (unchanged)

---

## File Structure

```
server/src/pipeline/
  prompts/
    loader.ts              # MODIFY: add extractBlock() utility
  steps/
    dossier/
      index.ts             # CREATE: dossier orchestrator (replaces old dossier.ts)
      sub-steps.ts         # CREATE: all dossier sub-step functions
    score/
      index.ts             # CREATE: score orchestrator (replaces old score.ts)
      sub-steps.ts         # CREATE: all score sub-step functions
    ingest.ts              # UNCHANGED
    template.ts            # UNCHANGED
    dossier.ts             # DELETE (replaced by dossier/)
    score.ts               # DELETE (replaced by score/)
  orchestrator.ts          # MODIFY: update import paths
  types.ts                 # MODIFY: add sub-step type
  claude/
    client.ts              # UNCHANGED
```

---

## Dependency Graphs

### Dossier Sub-Steps

```
R0 (plan, no tools)
 |
 +---> R1 (entity ID, web_search) ---+
 |                                    |
 +---> R2 (capital, web_search) ------+---> R3 (disqualifiers, web_search)
 |                                    |       |
 +---> R4a (founders, web_search) ----+       |
                                              |
        +-------------------------------------+
        |
        +---> C1 (team, no tools — uses R4a) --------+
        +---> C2 (market, web_search) -------+-------+
        +---> C3 (product, web_search) ------+-------+
        +---> C4 (capital eff, web_search) ---+------+
        +---> C5 (cap table, web_search) -----+-----+
        +---> C7 (exit, web_search) ----------+----+
                                              |    |
        C6 (moat, web_search — needs C2) <----+    |
                                                   |
        R5 (cross-validation, web_search) <--------+
                  |
        R6-R8 (assembly, no tools) <--- all above
```

### Score Sub-Steps

```
Routing + Disqualifier (Blocks 0-2)
        |
        +--- if TRIGGERED: produce abbreviated output, done
        |
        +--- if CLEAR:
              |
              +---> Score A1/B1 (parallel) ---+
              +---> Score A2/B2 (parallel) ---+
              +---> Score A3/B3 (parallel) ---+
              +---> Score A4/B4 (parallel) ---+---> Assembly (Blocks 4-6)
              +---> Score A5/B5 (parallel) ---+
              +---> Score A6/B6 (parallel) ---+
              +---> Score A7/B7 (parallel) ---+
```

---

### Task 1: Prompt extraction utility

**Files:**
- Modify: `server/src/pipeline/prompts/loader.ts`

This utility extracts XML-like sections from the template and rubric files by tag name and ID. The template uses `<section>`, `<output_block>`, `<sub_block>`, and `<criterion>` tags that don't self-nest, so a simple indexOf approach works.

- [ ] **Step 1: Add `extractBlock` function to `loader.ts`**

Add this function after the existing exports in `server/src/pipeline/prompts/loader.ts`:

```typescript
/**
 * Extracts a block of content from an XML-like template by tag name and id attribute.
 * Works for <section>, <output_block>, <sub_block>, <criterion>, <block> tags.
 * These tags do not self-nest, so a simple indexOf search for the closing tag works.
 */
export function extractBlock(source: string, tagName: string, id: string): string {
  const openPattern = new RegExp(`<${tagName}[^>]*\\bid="${id}"[^>]*>`);
  const openMatch = source.match(openPattern);
  if (!openMatch || openMatch.index === undefined) return '';

  const start = openMatch.index;
  const closeTag = `</${tagName}>`;
  const closeIndex = source.indexOf(closeTag, start + openMatch[0].length);
  if (closeIndex === -1) return '';

  return source.slice(start, closeIndex + closeTag.length);
}

/**
 * Extracts multiple contiguous blocks. Useful for pulling e.g. Sections 1-5
 * from a template as a single string.
 */
export function extractSections(source: string, sectionIds: string[]): string {
  return sectionIds.map(id => extractBlock(source, 'section', id)).join('\n\n');
}

/**
 * Extracts the dossier template preamble (Sections 1-5: role, classification,
 * info scarcity, routing ambiguity, mandatory first action).
 */
export function getDossierPreamble(): string {
  const template = getResearchDossierTemplate();
  return extractSections(template, ['1', '2', '3', '4', '5']);
}

/**
 * Extracts a specific output block (R0-R8) from the dossier template.
 */
export function getDossierOutputBlock(blockId: string): string {
  const template = getResearchDossierTemplate();
  return extractBlock(template, 'output_block', blockId);
}

/**
 * Extracts a specific sub_block (e.g., C1-C7) from the dossier template.
 */
export function getDossierSubBlock(subBlockId: string): string {
  const template = getResearchDossierTemplate();
  return extractBlock(template, 'sub_block', subBlockId);
}

/**
 * Extracts the disqualifier schema (Section 7) from the dossier template.
 */
export function getDossierDisqualifierSchema(): string {
  const template = getResearchDossierTemplate();
  return extractBlock(template, 'section', '7');
}

/**
 * Extracts sections from the rubric by section ID.
 */
export function getRubricSection(rubric: RubricType, sectionId: string): string {
  const rubricText = getRubricPrompt(rubric);
  return extractBlock(rubricText, 'section', sectionId);
}

/**
 * Extracts a specific criterion definition from the rubric.
 */
export function getRubricCriterion(rubric: RubricType, criterionId: string): string {
  const rubricText = getRubricPrompt(rubric);
  return extractBlock(rubricText, 'criterion', criterionId);
}

/**
 * Extracts a specific output block from the rubric (Section 5).
 */
export function getRubricOutputBlock(rubric: RubricType, blockId: string): string {
  const rubricText = getRubricPrompt(rubric);
  return extractBlock(rubricText, 'block', blockId);
}
```

- [ ] **Step 2: Verify extraction works**

Create a temporary test script `server/test-extract.ts`:

```typescript
import { getDossierPreamble, getDossierOutputBlock, getDossierSubBlock, getDossierDisqualifierSchema, getRubricCriterion, getRubricSection } from './src/pipeline/prompts/loader.js';

// Dossier template extraction
const preamble = getDossierPreamble();
console.log('Preamble length:', preamble.length, 'chars');
console.log('Preamble starts with:', preamble.slice(0, 80));

const r0 = getDossierOutputBlock('R0');
console.log('\nR0 length:', r0.length);
console.log('R0 starts with:', r0.slice(0, 80));

const r4a = getDossierOutputBlock('R4a');
console.log('\nR4a length:', r4a.length);

const c2 = getDossierSubBlock('C2');
console.log('\nC2 length:', c2.length);
console.log('C2 starts with:', c2.slice(0, 80));

const dqSchema = getDossierDisqualifierSchema();
console.log('\nDQ Schema length:', dqSchema.length);

// Rubric extraction
const a1 = getRubricCriterion('technology', 'A1');
console.log('\nA1 criterion length:', a1.length);
console.log('A1 starts with:', a1.slice(0, 80));

const routingSection = getRubricSection('technology', '2');
console.log('\nRouting section length:', routingSection.length);

console.log('\nAll extractions successful!');
```

Run: `cd server && npx tsx test-extract.ts`

Expected: All lengths > 0, correct starting text. Delete the test file after verification.

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/prompts/loader.ts
git commit -m "feat: add prompt section extraction utilities for pipeline decomposition"
```

---

### Task 2: Dossier sub-step functions

**Files:**
- Create: `server/src/pipeline/steps/dossier/sub-steps.ts`

Each function makes one focused Opus call for a specific dossier block. All functions share the same signature pattern: they take operator inputs + any prior block outputs they depend on, plus the emitter, and return the block's text output.

- [ ] **Step 1: Create `server/src/pipeline/steps/dossier/sub-steps.ts`**

```typescript
import type { PipelineEmitter } from '../../types.js';
import { callOpus } from '../../claude/client.js';
import {
  getDossierPreamble,
  getDossierOutputBlock,
  getDossierSubBlock,
  getDossierDisqualifierSchema,
} from '../../prompts/loader.js';
import type Anthropic from '@anthropic-ai/sdk';

const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search',
  max_uses: 20,
} as unknown as Anthropic.Tool;

function makeWebSearchTool(maxUses: number): Anthropic.Tool {
  return {
    type: 'web_search_20250305' as const,
    name: 'web_search',
    max_uses: maxUses,
  } as unknown as Anthropic.Tool;
}

const PREAMBLE = getDossierPreamble();

// --- R0: Research Plan (no tools) ---

export async function runR0(
  filledTemplate: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R0');
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R0 (Research Plan and Floor Commitments) of the research dossier.

${blockDef}

Produce R0 in full. Do NOT use any tools — R0 must be published before any tool invocation. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nProduce Block R0 (Research Plan and Floor Commitments) only.`,
    emitter,
    step: 'dossier',
    maxTokens: 4096,
  });
}

// --- R1: Entity Identification (web search) ---

export async function runR1(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R1');
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R1 (Entity Identification) of the research dossier. Use web_search to verify entity details (state corporate registry, WHOIS, SEC EDGAR).

${blockDef}

Produce R1 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the research plan (R0) for reference:\n\n${r0}\n\nProduce Block R1 (Entity Identification) only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(10)],
    maxTokens: 4096,
  });
}

// --- R2: Capital Position and Routing Inputs (web search) ---

export async function runR2(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R2');
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R2 (Capital Position and Routing Inputs) of the research dossier. Use web_search to verify raise amounts, prior rounds, investor details, and development stage.

${blockDef}

Produce R2 in full with all six sub-blocks (R2.1 through R2.6). Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the research plan (R0) for reference:\n\n${r0}\n\nProduce Block R2 (Capital Position and Routing Inputs) only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// --- R4a: Per-Founder Profiles (web search, heavy) ---

export async function runR4a(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R4a');
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R4a (Per-Founder Profiles) of the research dossier. This is the most research-intensive block. You MUST perform at minimum 3 non-batchable search passes per named founder. Verify every credential claim, employment history, prior exit, and founder-market fit artifact independently.

${blockDef}

Produce R4a in full including per-founder sub-blocks, Team Configuration Summary, and Aggregate Credential Check. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the research plan (R0) for reference:\n\n${r0}\n\nProduce Block R4a (Per-Founder Profiles) only. Minimum 3 search passes per founder.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(30)],
    maxTokens: 16384,
  });
}

// --- R3: Disqualifier Screen (web search, needs R4a) ---

export async function runR3(
  filledTemplate: string,
  r0: string,
  r4a: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R3');
  const dqSchema = getDossierDisqualifierSchema();
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R3 (Disqualifier Screen) of the research dossier. Screen all 12 disqualifiers (DQ-a through DQ-l) using the schema below. Use web_search for verification. Use the R4a founder profiles for identity-dependent disqualifiers (DQ-f, DQ-g, DQ-h).

${dqSchema}

${blockDef}

Produce R3 in full including the applicability pre-assessment (R3.0) and all 12 DQ sub-blocks. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the research plan (R0):\n\n${r0}\n\nHere are the completed founder profiles (R4a) for identity-dependent disqualifiers:\n\n${r4a}\n\nProduce Block R3 (Disqualifier Screen) only. Minimum 12 search passes.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(20)],
    maxTokens: 8192,
  });
}

// --- C1-C7: Criterion-Indexed Evidence ---

async function runCriterionBlock(
  criterionId: string,
  filledTemplate: string,
  priorBlocks: string,
  emitter: PipelineEmitter,
  maxSearchUses: number,
  extraInstructions: string = '',
): Promise<string> {
  const blockDef = getDossierSubBlock(criterionId);
  const systemPrompt = `${PREAMBLE}

You are producing ONLY sub-block ${criterionId} of Block R4b (Criterion-Indexed Evidence) of the research dossier.

${blockDef}

${extraInstructions}

Produce the ${criterionId} evidence sub-block in full. Do NOT produce any other blocks or sub-blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the relevant prior research for context:\n\n${priorBlocks}\n\nProduce sub-block ${criterionId} only.`,
    emitter,
    step: 'dossier',
    tools: maxSearchUses > 0 ? [makeWebSearchTool(maxSearchUses)] : undefined,
    maxTokens: 8192,
  });
}

export async function runC1(
  filledTemplate: string,
  r4a: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C1', filledTemplate, `R4a (Per-Founder Profiles):\n\n${r4a}`, emitter, 0,
    'C1 draws entirely from R4a founder profiles. No additional web search is needed. Cross-reference R4a FMF assessments, halo-employer summaries, solo-founder status, and consolidated NCSP contradictions.');
}

export async function runC2(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C2', filledTemplate, `R0 (Research Plan):\n\n${r0}`, emitter, 15,
    'Run all five force tests (FT-1 through FT-5). Research sector M&A activity, capital deployment trends, and market size claims. Minimum 6 search passes.');
}

export async function runC3(
  filledTemplate: string,
  r3: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C3', filledTemplate, `R3 (Disqualifier Screen):\n\n${r3}`, emitter, 10,
    'Verify product claims, customer evidence, press coverage. Minimum 3 search passes.');
}

export async function runC4(
  filledTemplate: string,
  r2: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C4', filledTemplate, `R2 (Capital Position):\n\n${r2}`, emitter, 10,
    'Research burn rate, runway, milestone mapping. Minimum 3 search passes.');
}

export async function runC5(
  filledTemplate: string,
  r2: string,
  r3: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C5', filledTemplate, `R2 (Capital Position):\n\n${r2}\n\nR3 (Disqualifier Screen — for DQ-d IP status):\n\n${r3}`, emitter, 10,
    'Research cap table structure, SAFE terms, lead investor quality. Cross-reference DQ-d for IP status. Minimum 3 search passes.');
}

export async function runC6(
  filledTemplate: string,
  r4a: string,
  c2: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C6', filledTemplate, `R4a (Per-Founder Profiles):\n\n${r4a}\n\nC2 (Market Opportunity — contains force test results to cross-reference):\n\n${c2}`, emitter, 15,
    'Cross-reference C2 force test results (do NOT re-run them). Research Helmer Powers inventory, moat-buildability signals. Minimum 10 search passes (3 for Helmer, 2 for moat-buildability/hand-wave).');
}

export async function runC7(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock('C7', filledTemplate, `R0 (Research Plan):\n\n${r0}`, emitter, 10,
    'Research acquirer universe, comparable M&A transactions, exit timeline. Minimum 4 search passes.');
}

// --- R5: Cross-Validation (web search) ---

export async function runR5(
  filledTemplate: string,
  r3: string,
  r4a: string,
  r4b: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R5');
  const systemPrompt = `${PREAMBLE}

You are producing ONLY Block R5 (Cross-Validation) of the research dossier. Re-verify high-stakes COMPANY-CLAIMED items from R3 and R4. Produce the NCSP Full Review with MINOR/MATERIAL pre-classifications.

${blockDef}

Produce R5 in full. Minimum 5 search passes. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is R3 (Disqualifier Screen):\n\n${r3}\n\nHere is R4a (Per-Founder Profiles):\n\n${r4a}\n\nHere is R4b (Criterion-Indexed Evidence):\n\n${r4b}\n\nProduce Block R5 (Cross-Validation) only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// --- R6-R8: Assembly (no tools) ---

export async function runR6R7R8(
  filledTemplate: string,
  allPriorBlocks: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const r6Def = getDossierOutputBlock('R6');
  const r7Def = getDossierOutputBlock('R7');
  const r8Def = getDossierOutputBlock('R8');
  const systemPrompt = `${PREAMBLE}

You are producing Blocks R6 (Dossier Assembly), R7 (Completion Gate), and R8 (Dossier Status and Handoff) of the research dossier. These are assembly and validation blocks — no web search is needed.

${r6Def}

${r7Def}

${r8Def}

Produce R6, R7, and R8 in full. Do NOT use any tools.`;

  return callOpus({
    systemPrompt,
    userContent: `Here are the operator inputs:\n\n${filledTemplate}\n\nHere is the complete dossier produced so far (R0 through R5):\n\n${allPriorBlocks}\n\nProduce Blocks R6, R7, and R8.`,
    emitter,
    step: 'dossier',
    maxTokens: 16384,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/dossier/sub-steps.ts
git commit -m "feat: add dossier sub-step functions for decomposed pipeline"
```

---

### Task 3: Dossier orchestrator

**Files:**
- Create: `server/src/pipeline/steps/dossier/index.ts`
- Delete: `server/src/pipeline/steps/dossier.ts`

The orchestrator sequences the sub-steps according to the dependency graph: R0 first, then R1+R2+R4a in parallel, then R3, then C1-C7 (with C6 after C2), then R5, then R6-R8. It emits sub-step boundary markers as text deltas for the live feed.

- [ ] **Step 1: Create `server/src/pipeline/steps/dossier/index.ts`**

```typescript
import type { PipelineEmitter, DossierInput, DossierOutput } from '../../types.js';
import { emitTextDelta } from '../../types.js';
import {
  runR0, runR1, runR2, runR4a, runR3,
  runC1, runC2, runC3, runC4, runC5, runC6, runC7,
  runR5, runR6R7R8,
} from './sub-steps.js';

function emitPhase(emitter: PipelineEmitter, label: string): void {
  emitTextDelta(emitter, 'dossier', `\n\n========== ${label} ==========\n\n`);
}

export async function runDossier(input: DossierInput, emitter: PipelineEmitter): Promise<DossierOutput> {
  const { filledTemplate } = input;

  // Phase 1: R0 — Research Plan (no tools, must come first)
  emitPhase(emitter, 'Phase 1: Research Plan (R0)');
  const r0 = await runR0(filledTemplate, emitter);

  // Phase 2: R1 + R2 + R4a in parallel (all need web search, independent)
  emitPhase(emitter, 'Phase 2: Entity ID (R1) + Capital Position (R2) + Founder Profiles (R4a) — parallel');
  const [r1, r2, r4a] = await Promise.all([
    runR1(filledTemplate, r0, emitter),
    runR2(filledTemplate, r0, emitter),
    runR4a(filledTemplate, r0, emitter),
  ]);

  // Phase 3: R3 — Disqualifier Screen (needs R4a for identity-dependent DQs)
  emitPhase(emitter, 'Phase 3: Disqualifier Screen (R3)');
  const r3 = await runR3(filledTemplate, r0, r4a, emitter);

  // Phase 4: C1-C7 Criterion-Indexed Evidence
  // C1, C2, C3, C4, C5, C7 can run in parallel
  // C6 needs C2's force test results
  emitPhase(emitter, 'Phase 4: Criterion Evidence (C1-C7) — parallel with C6 after C2');

  const [c1, c2, c3, c4, c5, c7] = await Promise.all([
    runC1(filledTemplate, r4a, emitter),
    runC2(filledTemplate, r0, emitter),
    runC3(filledTemplate, r3, emitter),
    runC4(filledTemplate, r2, emitter),
    runC5(filledTemplate, r2, r3, emitter),
    runC7(filledTemplate, r0, emitter),
  ]);

  // C6 runs after C2 completes (needs force test cross-reference)
  const c6 = await runC6(filledTemplate, r4a, c2, emitter);

  const r4b = [c1, c2, c3, c4, c5, c6, c7].join('\n\n');

  // Phase 5: R5 — Cross-Validation
  emitPhase(emitter, 'Phase 5: Cross-Validation (R5)');
  const r5 = await runR5(filledTemplate, r3, r4a, r4b, emitter);

  // Phase 6: R6-R8 — Assembly, Completion Gate, Handoff
  emitPhase(emitter, 'Phase 6: Assembly and Handoff (R6-R8)');
  const allPriorBlocks = [r0, r1, r2, r3, r4a, r4b, r5].join('\n\n');
  const r6r7r8 = await runR6R7R8(filledTemplate, allPriorBlocks, emitter);

  // Assemble complete dossier
  const dossier = [r0, r1, r2, r3, r4a, r4b, r5, r6r7r8].join('\n\n');

  return { dossier };
}
```

- [ ] **Step 2: Delete old `server/src/pipeline/steps/dossier.ts`**

```bash
rm server/src/pipeline/steps/dossier.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/steps/dossier/ && git rm server/src/pipeline/steps/dossier.ts
git commit -m "feat: replace monolithic dossier step with phased sub-step orchestrator"
```

---

### Task 4: Score sub-step functions

**Files:**
- Create: `server/src/pipeline/steps/score/sub-steps.ts`

The scoring step decomposes into: (1) routing + disqualifier check, (2) per-criterion scoring (7 parallel calls), (3) assembly of totals, tier, and qualitative assessment.

- [ ] **Step 1: Create `server/src/pipeline/steps/score/sub-steps.ts`**

```typescript
import type { PipelineEmitter } from '../../types.js';
import type { RubricType } from '@shared/types/pipeline.js';
import { callOpus } from '../../claude/client.js';
import {
  getRubricSection,
  getRubricCriterion,
  getRubricOutputBlock,
  getRubricPrompt,
} from '../../prompts/loader.js';

/**
 * Extracts the evaluation context preamble (Section 1) from the rubric.
 * This provides the role definition, objective, info scarcity protocol, etc.
 */
function getRubricPreamble(rubric: RubricType): string {
  return getRubricSection(rubric, '1');
}

// --- Routing + Disqualifier Screen (Blocks 0-2) ---

export interface RoutingResult {
  text: string;
  profile: 'A' | 'B';
  disqualified: boolean;
}

export async function runRouting(
  dossier: string,
  rubric: RubricType,
  emitter: PipelineEmitter,
): Promise<RoutingResult> {
  const preamble = getRubricPreamble(rubric);
  const routingLogic = getRubricSection(rubric, '2');
  const block0 = getRubricOutputBlock(rubric, '0');
  const block1 = getRubricOutputBlock(rubric, '1');
  const block2 = getRubricOutputBlock(rubric, '2');

  const systemPrompt = `${preamble}

${routingLogic}

You are producing ONLY Blocks 0 (Evaluation Header), 1 (Routing Determination), and 2 (Disqualifier Screen) of the scoring output.

${block0}

${block1}

${block2}

Produce Blocks 0, 1, and 2 in full. At the very end of your output, on its own line, output exactly one of these tags:
<routing_result profile="A" disqualified="false"/>
<routing_result profile="B" disqualified="false"/>
<routing_result profile="A" disqualified="true"/>
<routing_result profile="B" disqualified="true"/>`;

  const response = await callOpus({
    systemPrompt,
    userContent: `Here is the completed research dossier to evaluate:\n\n${dossier}\n\nProduce Blocks 0, 1, and 2 (Evaluation Header, Routing Determination, and Disqualifier Screen).`,
    emitter,
    step: 'score',
    maxTokens: 4096,
  });

  // Parse the routing result tag
  const routingMatch = response.match(/<routing_result\s+profile="([AB])"\s+disqualified="(true|false)"\/>/);
  const profile = (routingMatch?.[1] ?? 'B') as 'A' | 'B';
  const disqualified = routingMatch?.[2] === 'true';

  // Remove the routing tag from the output text
  const text = response.replace(/<routing_result[^/]*\/>\s*$/, '').trim();

  return { text, profile, disqualified };
}

// --- Per-Criterion Scoring ---

export async function runCriterionScore(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  criterionNumber: number,
  emitter: PipelineEmitter,
): Promise<string> {
  const preamble = getRubricPreamble(rubric);
  const criterionId = `${profile}${criterionNumber}`;

  // Get the criterion definition from the appropriate profile section
  const profileSection = profile === 'A' ? '3' : '4';
  const criterionDef = getRubricCriterion(rubric, criterionId);

  // Get the scoring output template
  const rubricText = getRubricPrompt(rubric);
  // Extract the criterion_score_template from Block 3 of Section 5
  const block3 = getRubricOutputBlock(rubric, '3');

  const systemPrompt = `${preamble}

You are scoring ONLY criterion ${criterionId} of the evaluation. Use the criterion definition and band structure below to assign a score.

${criterionDef}

Use this output format for your score:

${block3}

Produce the score entry for ${criterionId} only. Do NOT score other criteria.`;

  return callOpus({
    systemPrompt,
    userContent: `Here is the completed research dossier:\n\n${dossier}\n\nScore criterion ${criterionId} only. Follow the band definitions exactly. Include the Justification and Data Confidence Flag fields.`,
    emitter,
    step: 'score',
    maxTokens: 4096,
  });
}

// --- Assembly (Blocks 4-6) ---

export async function runScoreAssembly(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  routingText: string,
  criterionScores: string[],
  emitter: PipelineEmitter,
): Promise<string> {
  const preamble = getRubricPreamble(rubric);
  const block4 = getRubricOutputBlock(rubric, '4');
  const block5 = getRubricOutputBlock(rubric, '5');
  const block6 = getRubricOutputBlock(rubric, '6');

  const allScores = criterionScores.join('\n\n');

  const systemPrompt = `${preamble}

You are producing Blocks 4 (Total Score and Tier Determination), 5 (Qualitative Assessment), and 6 (Evaluation Footer) of the scoring output. The routing determination (Blocks 0-2) and all criterion scores (Block 3) have already been produced.

${block4}

${block5}

${block6}

Produce Blocks 4, 5, and 6 in full. Sum the criterion scores, run the consistency check, assign the tier, produce the qualitative assessment, and complete the footer.`;

  return callOpus({
    systemPrompt,
    userContent: `Here is the research dossier:\n\n${dossier}\n\nHere are the completed Blocks 0-2 (Routing and Disqualifiers):\n\n${routingText}\n\nHere are the individual criterion scores (Block 3):\n\n${allScores}\n\nProduce Blocks 4, 5, and 6.`,
    emitter,
    step: 'score',
    maxTokens: 8192,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/score/sub-steps.ts
git commit -m "feat: add score sub-step functions for decomposed pipeline"
```

---

### Task 5: Score orchestrator

**Files:**
- Create: `server/src/pipeline/steps/score/index.ts`
- Delete: `server/src/pipeline/steps/score.ts`

The score orchestrator: (1) runs routing + disqualifier check, (2) if disqualified produces abbreviated output, (3) otherwise scores all 7 criteria in parallel, (4) assembles final output.

- [ ] **Step 1: Create `server/src/pipeline/steps/score/index.ts`**

```typescript
import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../../types.js';
import { emitTextDelta } from '../../types.js';
import { runRouting, runCriterionScore, runScoreAssembly } from './sub-steps.js';

function emitPhase(emitter: PipelineEmitter, label: string): void {
  emitTextDelta(emitter, 'score', `\n\n========== ${label} ==========\n\n`);
}

export async function runScore(input: ScoreInput, emitter: PipelineEmitter): Promise<ScoreOutput> {
  const { dossier, rubric } = input;

  // Phase 1: Routing + Disqualifier Screen (Blocks 0-2)
  emitPhase(emitter, 'Phase 1: Routing and Disqualifier Screen');
  const routing = await runRouting(dossier, rubric, emitter);

  if (routing.disqualified) {
    // Early exit: produce abbreviated output
    emitPhase(emitter, 'Disqualifier TRIGGERED — producing abbreviated output');
    const abbreviated = `${routing.text}\n\nBlock 3: N/A — Disqualified\nBlock 4: N/A — Disqualified\nBlock 5: N/A — Disqualified`;

    // Still need Block 6 (footer) even when disqualified
    const assembly = await runScoreAssembly(dossier, rubric, routing.profile, routing.text, [], emitter);
    return { score: `${abbreviated}\n\n${assembly}` };
  }

  // Phase 2: Score all 7 criteria in parallel
  emitPhase(emitter, `Phase 2: Scoring criteria ${routing.profile}1-${routing.profile}7 — parallel`);
  const criterionScores = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7].map(n =>
      runCriterionScore(dossier, rubric, routing.profile, n, emitter)
    ),
  );

  // Phase 3: Assembly (Blocks 4-6)
  emitPhase(emitter, 'Phase 3: Score Assembly (Blocks 4-6)');
  const assembly = await runScoreAssembly(
    dossier, rubric, routing.profile, routing.text, criterionScores, emitter,
  );

  // Combine all blocks
  const score = [routing.text, ...criterionScores, assembly].join('\n\n');

  return { score };
}
```

- [ ] **Step 2: Delete old `server/src/pipeline/steps/score.ts`**

```bash
rm server/src/pipeline/steps/score.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/steps/score/ && git rm server/src/pipeline/steps/score.ts
git commit -m "feat: replace monolithic score step with phased sub-step orchestrator"
```

---

### Task 6: Update orchestrator imports

**Files:**
- Modify: `server/src/pipeline/orchestrator.ts`

The import paths change from `./steps/dossier.js` to `./steps/dossier/index.js` (and same for score). The function signatures are unchanged so nothing else needs updating.

- [ ] **Step 1: Update imports in `orchestrator.ts`**

Change line 6:
```typescript
// Before:
import { runDossier } from './steps/dossier.js';
// After:
import { runDossier } from './steps/dossier/index.js';
```

Change line 7:
```typescript
// Before:
import { runScore } from './steps/score.js';
// After:
import { runScore } from './steps/score/index.js';
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd server && npx tsc --noEmit`

Expected: No errors. The `runDossier` and `runScore` function signatures are unchanged (same input/output types), so the orchestrator should compile without changes beyond the imports.

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/orchestrator.ts
git commit -m "chore: update orchestrator imports for decomposed dossier and score steps"
```

---

### Task 7: Add `RubricType` import to prompt loader

**Files:**
- Modify: `server/src/pipeline/prompts/loader.ts`

The new extraction functions added in Task 1 use `RubricType` as a parameter type, which needs to be imported.

- [ ] **Step 1: Add RubricType import**

The existing `loader.ts` already imports `RubricType` on line 2:
```typescript
import type { RubricType } from '@shared/types/pipeline.js';
```

If this import is not already present, add it. Verify the existing imports cover `RubricType`.

- [ ] **Step 2: Verify full build**

Run: `cd server && npx tsc --noEmit`

Expected: Clean compilation with no errors.

- [ ] **Step 3: Manual smoke test**

Start the server and run a pipeline to verify the decomposed steps work:

```bash
cd server && npm run dev
```

Then trigger a pipeline run from the frontend. Watch the live feed for the phase markers (`========== Phase 1: ... ==========`) confirming sub-steps execute in the expected order.

- [ ] **Step 4: Commit (if any fixes needed)**

```bash
git add -A && git commit -m "fix: resolve compilation issues from pipeline decomposition"
```

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Dossier API calls | 1 Opus call (~38K token system prompt, unbounded context growth) | 12-13 focused calls (4-16K system prompts, fresh context each) |
| Dossier parallelism | None | R1+R2+R4a parallel; C1+C2+C3+C4+C5+C7 parallel |
| Score API calls | 1 Opus call | 9 focused calls |
| Score parallelism | None | 7 criterion scores in parallel |
| Early exit (score) | None | Disqualifier triggers skip criterion scoring |
| Frontend changes | N/A | None needed |
| Public API changes | N/A | None — `runDossier` and `runScore` signatures unchanged |
