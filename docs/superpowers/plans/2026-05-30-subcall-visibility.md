# Subcall Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-subcall visibility to the pipeline client so users can see individual subcall status in the sidebar and filter the LiveFeed to a specific subcall's output.

**Architecture:** Thread a `subcall` identifier through the server's event emission chain (emit helpers -> Claude client -> sub-steps). Add `subcall:start`/`subcall:complete` SSE events. On the client, track subcall states, make the sidebar interactive, and filter the LiveFeed based on step/subcall selection.

**Tech Stack:** TypeScript, React 18, Fastify SSE, Tailwind CSS

---

### Task 1: Add subcall fields to shared types

**Files:**
- Modify: `shared/types/pipeline.ts`

- [ ] **Step 1: Add `subcall` field to existing event interfaces**

In `shared/types/pipeline.ts`, add `subcall?: string` to `TextDeltaEvent`, `ToolCallEvent`, and `ToolResultEvent`:

```ts
export interface TextDeltaEvent {
  type: 'text:delta';
  step: PipelineStepName;
  subcall?: string;
  content: string;
  timestamp: string;
}

export interface ToolCallEvent {
  type: 'tool:call';
  step: PipelineStepName;
  subcall?: string;
  tool: string;
  input: string;
  timestamp: string;
}

export interface ToolResultEvent {
  type: 'tool:result';
  step: PipelineStepName;
  subcall?: string;
  tool: string;
  summary: string;
  timestamp: string;
}
```

- [ ] **Step 2: Add new subcall event interfaces**

In the same file, add these two interfaces after `TextDeltaEvent`:

```ts
export interface SubcallStartEvent {
  type: 'subcall:start';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}

export interface SubcallCompleteEvent {
  type: 'subcall:complete';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}
```

- [ ] **Step 3: Add new types to `PipelineEvent` union**

Update the union type to include the two new event types:

```ts
export type PipelineEvent =
  | StepStartEvent
  | StepCompleteEvent
  | SubcallStartEvent
  | SubcallCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | TextDeltaEvent
  | ResultDossierEvent
  | ResultScoreEvent
  | PipelineCompleteEvent
  | PipelineErrorEvent;
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add shared/types/pipeline.ts
git commit -m "feat: add subcall fields to shared pipeline event types"
```

---

### Task 2: Update server emit helpers

**Files:**
- Modify: `server/src/pipeline/types.ts`

- [ ] **Step 1: Update `emitTextDelta` to accept optional `subcall`**

Change the signature and body:

```ts
export function emitTextDelta(emitter: PipelineEmitter, step: PipelineStepName, content: string, subcall?: string): void {
  emitEvent(emitter, { type: 'text:delta', step, ...(subcall ? { subcall } : {}), content, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 2: Update `emitToolCall` to accept optional `subcall`**

```ts
export function emitToolCall(emitter: PipelineEmitter, step: PipelineStepName, tool: string, input: string, subcall?: string): void {
  emitEvent(emitter, { type: 'tool:call', step, ...(subcall ? { subcall } : {}), tool, input, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 3: Update `emitToolResult` to accept optional `subcall`**

```ts
export function emitToolResult(emitter: PipelineEmitter, step: PipelineStepName, tool: string, summary: string, subcall?: string): void {
  emitEvent(emitter, { type: 'tool:result', step, ...(subcall ? { subcall } : {}), tool, summary, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 4: Add `emitSubcallStart` and `emitSubcallComplete` helpers**

Add after the existing helpers:

```ts
export function emitSubcallStart(emitter: PipelineEmitter, step: PipelineStepName, subcall: string): void {
  emitEvent(emitter, { type: 'subcall:start', step, subcall, timestamp: new Date().toISOString() });
}

export function emitSubcallComplete(emitter: PipelineEmitter, step: PipelineStepName, subcall: string): void {
  emitEvent(emitter, { type: 'subcall:complete', step, subcall, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 5: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/src/pipeline/types.ts
git commit -m "feat: add subcall param to emit helpers"
```

---

### Task 3: Thread subcall through Claude client

**Files:**
- Modify: `server/src/pipeline/claude/client.ts`

- [ ] **Step 1: Add `subcall` to `ClaudeCallOptions`**

Add the field to the interface at line 28:

```ts
export interface ClaudeCallOptions {
  systemPrompt?: string;
  systemParts?: SystemPart[];
  userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  emitter: PipelineEmitter;
  step: PipelineStepName;
  subcall?: string;
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}
```

- [ ] **Step 2: Thread `subcall` through `callModel()`**

In the `callModel` function, destructure `subcall` from options and pass it to all emit calls:

```ts
async function callModel(model: string, options: ClaudeCallOptions): Promise<string> {
  const { userContent, emitter, step, subcall, tools, maxTokens = 16384 } = options;
```

Update the three emit call sites inside `callModel`:

Line 80 (`emitTextDelta`):
```ts
          emitTextDelta(emitter, step, event.delta.text, subcall);
```

Line 114 (`emitToolCall`):
```ts
      emitToolCall(emitter, step, toolBlock.name, inputStr, subcall);
```

Line 120 (`emitToolResult`):
```ts
      emitToolResult(emitter, step, toolBlock.name, resultContent, subcall);
```

- [ ] **Step 3: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/pipeline/claude/client.ts
git commit -m "feat: thread subcall identifier through Claude client"
```

---

### Task 4: Tag dossier sub-steps with subcall names

**Files:**
- Modify: `server/src/pipeline/steps/dossier/sub-steps.ts`

- [ ] **Step 1: Add `subcall` to `runCriterionBlock` and pass it through**

Add `subcall` to the options type and pass it to `callOpus`:

```ts
async function runCriterionBlock(options: {
  subBlockId: string;
  label: string;
  filledTemplate: string;
  priorContext: string;
  emitter: PipelineEmitter;
  tools?: Anthropic.Tool[];
  maxTokens: number;
}): Promise<string> {
  const { subBlockId, label, filledTemplate, priorContext, emitter, tools, maxTokens } = options;
```

Change the `callOpus` call at the end of `runCriterionBlock` to include `subcall: subBlockId`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate, instructions),
    userContent,
    emitter,
    step: 'dossier',
    subcall: subBlockId,
    ...(tools && tools.length > 0 ? { tools } : {}),
    maxTokens,
  });
```

- [ ] **Step 2: Add `subcall` to `runR0`**

In the `callOpus` call inside `runR0`, add `subcall: 'R0'`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_MINIMAL, filledTemplate,
      `You are producing ONLY Block R0 (Research Plan) of the research dossier.

${blockDef}

Produce R0 in full. Do NOT produce any other blocks.`),
    userContent: 'Produce Block R0 only.',
    emitter,
    step: 'dossier',
    subcall: 'R0',
    maxTokens: 4096,
  });
```

- [ ] **Step 3: Add `subcall` to `runR1`**

Add `subcall: 'R1'` to the `callOpus` call in `runR1`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R1 (Entity Identification) of the research dossier.

${blockDef}

Produce R1 in full. Do NOT produce any other blocks.`),
    userContent: `Prior research context:\n\n${r0}\n\nProduce Block R1 only.`,
    emitter,
    step: 'dossier',
    subcall: 'R1',
    tools: [makeWebSearchTool(10)],
    maxTokens: 4096,
  });
```

- [ ] **Step 4: Add `subcall` to `runR2`**

Add `subcall: 'R2'` to the `callOpus` call in `runR2`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_ROUTING, filledTemplate,
      `You are producing ONLY Block R2 (Capital Position) of the research dossier.

${blockDef}

Produce R2 in full. Do NOT produce any other blocks.`),
    userContent: `Prior research context:\n\n${r0}\n\nProduce Block R2 only.`,
    emitter,
    step: 'dossier',
    subcall: 'R2',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
```

- [ ] **Step 5: Add `subcall` to `runR4a`**

Add `subcall: 'R4a'` to the `callOpus` call in `runR4a`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R4a (Per-Founder Profiles) of the research dossier.

${blockDef}

Produce R4a in full. Do NOT produce any other blocks.`),
    userContent: `Prior research context:\n\n${r0}\n\nProduce Block R4a only.`,
    emitter,
    step: 'dossier',
    subcall: 'R4a',
    tools: [makeWebSearchTool(30)],
    maxTokens: 16384,
  });
```

- [ ] **Step 6: Add `subcall` to `runR3`**

Add `subcall: 'R3'` to the `callOpus` call in `runR3`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R3 (Disqualifier Screen) of the research dossier.

${blockDef}

Reference the disqualifier schema below when evaluating disqualifiers:

${disqualifierSchema}

Produce R3 in full. Do NOT produce any other blocks.`),
    userContent: `Prior research context:\n\n${r0}\n\n${r4a}\n\nProduce Block R3 only.`,
    emitter,
    step: 'dossier',
    subcall: 'R3',
    tools: [makeWebSearchTool(20)],
    maxTokens: 8192,
  });
```

- [ ] **Step 7: Add `subcall` to `runR5`**

Add `subcall: 'R5'` to the `callOpus` call in `runR5`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R5 (Cross-Validation) of the research dossier.

${blockDef}

Produce R5 in full. Do NOT produce any other blocks.`),
    userContent: `Prior research context:\n\n${r3}\n\n${r4a}\n\n${r4b}\n\nProduce Block R5 only.`,
    emitter,
    step: 'dossier',
    subcall: 'R5',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
```

- [ ] **Step 8: Add `subcall` to `runR6R7R8`**

Add `subcall: 'R6-R8'` to the `callOpus` call in `runR6R7R8`:

```ts
  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_MINIMAL, filledTemplate,
      `You are producing Blocks R6 (Assembly), R7 (Completion Gate), and R8 (Handoff) of the research dossier.

${r6Def}

${r7Def}

${r8Def}

Produce R6, R7, and R8 in full. Do NOT produce any other blocks.`),
    userContent: `All prior dossier blocks:\n\n${allPriorBlocks}\n\nProduce Blocks R6, R7, and R8.`,
    emitter,
    step: 'dossier',
    subcall: 'R6-R8',
    maxTokens: 16384,
  });
```

- [ ] **Step 9: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add server/src/pipeline/steps/dossier/sub-steps.ts
git commit -m "feat: tag dossier sub-steps with subcall names"
```

---

### Task 5: Tag score sub-steps with subcall names

**Files:**
- Modify: `server/src/pipeline/steps/score/sub-steps.ts`

- [ ] **Step 1: Add `subcall` to `runRouting`**

Add `subcall: 'Routing'` to the `callOpus` call in `runRouting` (around line 46):

```ts
  const response = await callOpus({
    systemParts,
    userContent: 'Produce Blocks 0-2 (Evaluation Header, Routing Determination, Disqualifier Screen) according to the rubric. End with the <routing_result .../> tag.',
    emitter,
    step: 'score',
    subcall: 'Routing',
    maxTokens: 4096,
  });
```

- [ ] **Step 2: Add `subcall` to `runCriterionScore`**

Add a dynamic `subcall` value using the existing `criterionId` variable. In the `callOpus` call (around line 91):

```ts
  return callOpus({
    systemParts,
    userContent: `Score criterion ${criterionId} according to the rubric. Produce the Block 3 output for this single criterion only.`,
    emitter,
    step: 'score',
    subcall: criterionId,
    maxTokens: 4096,
  });
```

- [ ] **Step 3: Add `subcall` to `runScoreAssembly`**

Add `subcall: 'Assembly'` to the `callOpus` call in `runScoreAssembly` (around line 131):

```ts
  return callOpus({
    systemParts,
    userContent,
    emitter,
    step: 'score',
    subcall: 'Assembly',
    maxTokens: 8192,
  });
```

- [ ] **Step 4: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/pipeline/steps/score/sub-steps.ts
git commit -m "feat: tag score sub-steps with subcall names"
```

---

### Task 6: Emit subcall lifecycle events from dossier orchestrator

**Files:**
- Modify: `server/src/pipeline/steps/dossier/index.ts`

- [ ] **Step 1: Import subcall emit helpers**

Update the import from `../../types.js`:

```ts
import type { PipelineEmitter, DossierInput, DossierOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
```

- [ ] **Step 2: Remove `emitPhase` helper and `emitTextDelta` import**

Delete the `emitPhase` function (lines 24-26) and remove `emitTextDelta` from the import.

- [ ] **Step 3: Wrap Phase 1 (R0) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 1: Research Plan (R0)');
  const r0 = await timed('R0', () => runR0(filledTemplate, emitter));
```

With:
```ts
  emitSubcallStart(emitter, 'dossier', 'R0');
  const r0 = await timed('R0', () => runR0(filledTemplate, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R0');
```

- [ ] **Step 4: Wrap Phase 2 (R1 + R2 + R4a parallel) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 2: R1 + R2 + R4a (parallel)');
  const [r1, r2, r4a] = await Promise.all([
    timed('R1', () => runR1(filledTemplate, r0, emitter)),
    timed('R2', () => runR2(filledTemplate, r0, emitter)),
    timed('R4a', () => runR4a(filledTemplate, r0, emitter)),
  ]);
```

With:
```ts
  emitSubcallStart(emitter, 'dossier', 'R1');
  emitSubcallStart(emitter, 'dossier', 'R2');
  emitSubcallStart(emitter, 'dossier', 'R4a');
  const [r1, r2, r4a] = await Promise.all([
    timed('R1', () => runR1(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R1'); return r; }),
    timed('R2', () => runR2(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R2'); return r; }),
    timed('R4a', () => runR4a(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'R4a'); return r; }),
  ]);
```

- [ ] **Step 5: Wrap Phase 3 (R3) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 3: Disqualifier Screen (R3)');
  const r3 = await timed('R3', () => runR3(filledTemplate, r0, r4a, emitter));
```

With:
```ts
  emitSubcallStart(emitter, 'dossier', 'R3');
  const r3 = await timed('R3', () => runR3(filledTemplate, r0, r4a, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R3');
```

- [ ] **Step 6: Wrap Phase 4 (C1-C7) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 4: Criterion Blocks (C1-C7)');
  const [c1, c2, c3, c4, c5, c7] = await Promise.all([
    timed('C1', () => runC1(filledTemplate, r4a, emitter)),
    timed('C2', () => runC2(filledTemplate, r0, emitter)),
    timed('C3', () => runC3(filledTemplate, r3, emitter)),
    timed('C4', () => runC4(filledTemplate, r2, emitter)),
    timed('C5', () => runC5(filledTemplate, r2, r3, emitter)),
    timed('C7', () => runC7(filledTemplate, r0, emitter)),
  ]);

  const c6 = await timed('C6', () => runC6(filledTemplate, r4a, c2, emitter));
```

With:
```ts
  emitSubcallStart(emitter, 'dossier', 'C1');
  emitSubcallStart(emitter, 'dossier', 'C2');
  emitSubcallStart(emitter, 'dossier', 'C3');
  emitSubcallStart(emitter, 'dossier', 'C4');
  emitSubcallStart(emitter, 'dossier', 'C5');
  emitSubcallStart(emitter, 'dossier', 'C7');
  const [c1, c2, c3, c4, c5, c7] = await Promise.all([
    timed('C1', () => runC1(filledTemplate, r4a, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C1'); return r; }),
    timed('C2', () => runC2(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C2'); return r; }),
    timed('C3', () => runC3(filledTemplate, r3, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C3'); return r; }),
    timed('C4', () => runC4(filledTemplate, r2, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C4'); return r; }),
    timed('C5', () => runC5(filledTemplate, r2, r3, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C5'); return r; }),
    timed('C7', () => runC7(filledTemplate, r0, emitter)).then(r => { emitSubcallComplete(emitter, 'dossier', 'C7'); return r; }),
  ]);

  emitSubcallStart(emitter, 'dossier', 'C6');
  const c6 = await timed('C6', () => runC6(filledTemplate, r4a, c2, emitter));
  emitSubcallComplete(emitter, 'dossier', 'C6');
```

- [ ] **Step 7: Wrap Phase 5 (R5) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 5: Cross-Validation (R5)');
  const r5 = await timed('R5', () => runR5(filledTemplate, r3, r4a, r4b, emitter));
```

With:
```ts
  emitSubcallStart(emitter, 'dossier', 'R5');
  const r5 = await timed('R5', () => runR5(filledTemplate, r3, r4a, r4b, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R5');
```

- [ ] **Step 8: Wrap Phase 6 (R6-R8) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 6: Assembly & Handoff (R6-R8)');
  const allPriorBlocks = [r0, r1, r2, r3, r4a, r4b, r5].join('\n\n');
  const r6r7r8 = await timed('R6-R8', () => runR6R7R8(filledTemplate, allPriorBlocks, emitter));
```

With:
```ts
  const allPriorBlocks = [r0, r1, r2, r3, r4a, r4b, r5].join('\n\n');
  emitSubcallStart(emitter, 'dossier', 'R6-R8');
  const r6r7r8 = await timed('R6-R8', () => runR6R7R8(filledTemplate, allPriorBlocks, emitter));
  emitSubcallComplete(emitter, 'dossier', 'R6-R8');
```

- [ ] **Step 9: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add server/src/pipeline/steps/dossier/index.ts
git commit -m "feat: emit subcall lifecycle events from dossier orchestrator"
```

---

### Task 7: Emit subcall lifecycle events from score orchestrator

**Files:**
- Modify: `server/src/pipeline/steps/score/index.ts`

- [ ] **Step 1: Import subcall emit helpers and remove emitTextDelta**

Update imports:

```ts
import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
```

- [ ] **Step 2: Remove `emitPhase` helper**

Delete the `emitPhase` function (lines 9-11).

- [ ] **Step 3: Wrap Phase 1 (Routing) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 1: Routing + Disqualifier Screen');
  const routing = await timed('Routing', () => runRouting(dossier, rubric, emitter));
```

With:
```ts
  emitSubcallStart(emitter, 'score', 'Routing');
  const routing = await timed('Routing', () => runRouting(dossier, rubric, emitter));
  emitSubcallComplete(emitter, 'score', 'Routing');
```

- [ ] **Step 4: Update disqualified early-exit path**

Replace:
```ts
  if (routing.disqualified) {
    emitPhase(emitter, 'Disqualified — Skipping Criteria');
```

With:
```ts
  if (routing.disqualified) {
```

Also wrap the `runScoreAssembly` call inside the disqualified block:

Replace:
```ts
    const assembly = await runScoreAssembly(
      dossier,
      rubric,
      routing.profile,
      routing.text,
      [],
      emitter,
    );
```

With:
```ts
    emitSubcallStart(emitter, 'score', 'Assembly');
    const assembly = await runScoreAssembly(
      dossier,
      rubric,
      routing.profile,
      routing.text,
      [],
      emitter,
    );
    emitSubcallComplete(emitter, 'score', 'Assembly');
```

- [ ] **Step 5: Wrap Phase 2 (parallel criterion scoring) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 2: Scoring Criteria 1-7');
  const criterionScores = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7].map((n) =>
      timed(`${routing.profile}${n}`, () => runCriterionScore(dossier, rubric, routing.profile, n, emitter)),
    ),
  );
```

With:
```ts
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => emitSubcallStart(emitter, 'score', `${routing.profile}${n}`));
  const criterionScores = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7].map((n) =>
      timed(`${routing.profile}${n}`, () => runCriterionScore(dossier, rubric, routing.profile, n, emitter))
        .then(r => { emitSubcallComplete(emitter, 'score', `${routing.profile}${n}`); return r; }),
    ),
  );
```

- [ ] **Step 6: Wrap Phase 3 (Assembly) with subcall events**

Replace:
```ts
  emitPhase(emitter, 'Phase 3: Assembly');
  const assembly = await timed('Assembly', () => runScoreAssembly(
```

With:
```ts
  emitSubcallStart(emitter, 'score', 'Assembly');
  const assembly = await timed('Assembly', () => runScoreAssembly(
```

And after the assembly `await` completes (after the closing `));`), add:

```ts
  emitSubcallComplete(emitter, 'score', 'Assembly');
```

- [ ] **Step 7: Verify types compile**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add server/src/pipeline/steps/score/index.ts
git commit -m "feat: emit subcall lifecycle events from score orchestrator"
```

---

### Task 8: Add subcall state and selection to usePipeline hook

**Files:**
- Modify: `client/src/hooks/usePipeline.ts`

- [ ] **Step 1: Add new types and state**

Add new state type after the existing `StepState` type:

```ts
export interface SubcallInfo {
  step: PipelineStepName;
  state: StepState;
}
```

Update `FeedEvent` to include `subcall`:

```ts
export interface FeedEvent {
  id: number;
  type: string;
  step?: string;
  subcall?: string;
  message: string;
  timestamp: string;
}
```

- [ ] **Step 2: Add new state variables inside `usePipeline`**

After the existing state declarations (around line 37), add:

```ts
  const [subcallStates, setSubcallStates] = useState<Record<string, SubcallInfo>>({});
  const [selectedStep, setSelectedStep] = useState<PipelineStepName | null>(null);
  const [selectedSubcall, setSelectedSubcall] = useState<string | null>(null);
```

- [ ] **Step 3: Add subcall:start handler to `handleEvent`**

Add these two cases in the `handleEvent` switch before the `result:dossier` case:

```ts
      case 'subcall:start':
        setSubcallStates((prev) => ({
          ...prev,
          [event.subcall]: { step: event.step, state: 'running' },
        }));
        addFeedEvent(event.type, `${event.subcall} started`, event.step);
        break;

      case 'subcall:complete':
        setSubcallStates((prev) => ({
          ...prev,
          [event.subcall]: { step: event.step, state: 'done' },
        }));
        addFeedEvent(event.type, `${event.subcall} complete`, event.step);
        break;
```

- [ ] **Step 4: Update existing handlers to preserve `subcall` field**

Update `tool:call` handler to include subcall:

```ts
      case 'tool:call': {
        const id = eventIdRef.current++;
        setFeedEvents((prev) => [...prev, {
          id, type: event.type, step: event.step,
          subcall: event.subcall,
          message: `${event.tool}: ${event.input}`,
          timestamp: event.timestamp,
        }]);
        break;
      }
```

Update `tool:result` handler to include subcall:

```ts
      case 'tool:result': {
        const id = eventIdRef.current++;
        setFeedEvents((prev) => [...prev, {
          id, type: event.type, step: event.step,
          subcall: event.subcall,
          message: `  → ${event.summary}`,
          timestamp: event.timestamp,
        }]);
        break;
      }
```

Update the `text:delta` handler to preserve subcall. Replace the existing case:

```ts
      case 'text:delta': {
        const subcall = event.subcall;
        setFeedEvents((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'text:delta' && last.step === event.step && last.subcall === subcall) {
            const updated = { ...last, message: last.message + event.content };
            return [...prev.slice(0, -1), updated];
          }
          const id = eventIdRef.current++;
          return [...prev, { id, type: 'text:delta', step: event.step, subcall, message: event.content, timestamp: event.timestamp }];
        });
        break;
      }
```

- [ ] **Step 5: Add selection action callbacks**

After the existing `removeFile` callback, add:

```ts
  const selectStep = useCallback((step: PipelineStepName | null) => {
    if (step === null) {
      setSelectedStep(null);
      setSelectedSubcall(null);
      return;
    }
    setSelectedStep((prev) => {
      if (prev === step && !selectedSubcall) return null;
      return step;
    });
    setSelectedSubcall(null);
  }, [selectedSubcall]);

  const selectSubcall = useCallback((subcall: string, step: PipelineStepName) => {
    setSelectedSubcall((prev) => prev === subcall ? null : subcall);
    setSelectedStep((prev) => {
      if (selectedSubcall === subcall) return null;
      return step;
    });
  }, [selectedSubcall]);
```

- [ ] **Step 6: Reset subcall state in `reset` callback**

Add these three lines to the `reset` callback body:

```ts
    setSubcallStates({});
    setSelectedStep(null);
    setSelectedSubcall(null);
```

- [ ] **Step 7: Update the return object**

Add the new values to the return object:

```ts
  return {
    files, rubric, status, currentStep, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    subcallStates, selectedStep, selectedSubcall,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
    selectStep, selectSubcall,
  };
```

- [ ] **Step 8: Verify client compiles**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/client && npx tsc --noEmit`
Expected: Errors about StepStatus/LiveFeed/App props (expected — fixed in Tasks 9-11)

- [ ] **Step 9: Commit**

```bash
git add client/src/hooks/usePipeline.ts
git commit -m "feat: add subcall state tracking and selection to usePipeline"
```

---

### Task 9: Make StepStatus interactive with nested subcalls

**Files:**
- Modify: `client/src/components/StepStatus.tsx`

- [ ] **Step 1: Rewrite StepStatus component**

Replace the entire contents of `StepStatus.tsx`:

```tsx
import type { PipelineStepName } from '@shared/types/pipeline';
import type { StepState, SubcallInfo } from '../hooks/usePipeline';

interface StepStatusProps {
  stepStates: Record<PipelineStepName, StepState>;
  subcallStates: Record<string, SubcallInfo>;
  selectedStep: PipelineStepName | null;
  selectedSubcall: string | null;
  onSelectStep: (step: PipelineStepName | null) => void;
  onSelectSubcall: (subcall: string, step: PipelineStepName) => void;
}

const STEPS: { key: PipelineStepName; label: string }[] = [
  { key: 'ingest', label: '1. Ingest' },
  { key: 'template', label: '2. Template' },
  { key: 'dossier', label: '3. Dossier' },
  { key: 'score', label: '4. Score' },
];

const stateConfig: Record<StepState, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'text-gray-400' },
  running: { icon: '◉', color: 'text-blue-500' },
  done: { icon: '●', color: 'text-green-500' },
  error: { icon: '✗', color: 'text-red-500' },
};

export default function StepStatus({
  stepStates,
  subcallStates,
  selectedStep,
  selectedSubcall,
  onSelectStep,
  onSelectSubcall,
}: StepStatusProps) {
  const subcallsForStep = (step: PipelineStepName) =>
    Object.entries(subcallStates)
      .filter(([, info]) => info.step === step)
      .map(([name, info]) => ({ name, ...info }));

  const isAllSelected = !selectedStep && !selectedSubcall;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Progress</label>
      <div className="space-y-0.5">
        {/* "All" row */}
        <button
          type="button"
          onClick={() => onSelectStep(null)}
          className={`flex items-center gap-2 text-sm py-1 px-2 w-full text-left rounded transition-colors ${
            isAllSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>All</span>
        </button>

        {STEPS.map(({ key, label }) => {
          const state = stepStates[key];
          const { icon, color } = stateConfig[state];
          const isStepSelected = selectedStep === key && !selectedSubcall;
          const subcalls = subcallsForStep(key);

          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => onSelectStep(key)}
                className={`flex items-center gap-2 text-sm py-1 px-2 w-full text-left rounded transition-colors ${
                  isStepSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-100'
                } ${isStepSelected ? 'text-blue-700' : color}`}
              >
                <span className={state === 'running' ? 'animate-pulse' : ''}>{icon}</span>
                <span>{label}</span>
                {state === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
                {state === 'running' && <span className="text-xs text-blue-400 ml-auto">running</span>}
              </button>

              {/* Nested subcalls */}
              {subcalls.length > 0 && (
                <div className="ml-6 space-y-0.5">
                  {subcalls.map(({ name, state: scState }) => {
                    const scConfig = stateConfig[scState];
                    const isSubcallSelected = selectedSubcall === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => onSelectSubcall(name, key)}
                        className={`flex items-center gap-2 text-xs py-0.5 px-2 w-full text-left rounded transition-colors ${
                          isSubcallSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-100'
                        } ${isSubcallSelected ? 'text-blue-700' : scConfig.color}`}
                      >
                        <span className={scState === 'running' ? 'animate-pulse' : ''}>{scConfig.icon}</span>
                        <span>{name}</span>
                        {scState === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/StepStatus.tsx
git commit -m "feat: make StepStatus interactive with nested subcalls"
```

---

### Task 10: Add filtering to LiveFeed

**Files:**
- Modify: `client/src/components/LiveFeed.tsx`

- [ ] **Step 1: Add filter props and filtering logic**

Update the props interface and add filtering before render:

```tsx
import { useEffect, useRef } from 'react';
import type { PipelineStepName } from '@shared/types/pipeline';
import type { FeedEvent } from '../hooks/usePipeline';

interface LiveFeedProps {
  events: FeedEvent[];
  selectedStep?: PipelineStepName | null;
  selectedSubcall?: string | null;
}
```

Inside the component, add the filter before the JSX return:

```tsx
export default function LiveFeed({ events, selectedStep, selectedSubcall }: LiveFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = selectedSubcall
    ? events.filter((e) => e.subcall === selectedSubcall)
    : selectedStep
      ? events.filter((e) => e.step === selectedStep)
      : events;

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered]);
```

Update the render to use `filtered` instead of `events`:

```tsx
      {filtered.length === 0 && (
        <p className="text-gray-600">
          {events.length === 0 ? 'Waiting for pipeline to start...' : 'No events for this selection.'}
        </p>
      )}
      {filtered.map((event) => (
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/LiveFeed.tsx
git commit -m "feat: add step/subcall filtering to LiveFeed"
```

---

### Task 11: Wire everything together in App.tsx

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Destructure new values from usePipeline**

Update the destructuring:

```tsx
  const {
    files, rubric, status, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    subcallStates, selectedStep, selectedSubcall,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
    selectStep, selectSubcall,
  } = usePipeline();
```

- [ ] **Step 2: Pass new props to StepStatus**

Replace:
```tsx
        {status !== 'idle' && <StepStatus stepStates={stepStates} />}
```

With:
```tsx
        {status !== 'idle' && (
          <StepStatus
            stepStates={stepStates}
            subcallStates={subcallStates}
            selectedStep={selectedStep}
            selectedSubcall={selectedSubcall}
            onSelectStep={selectStep}
            onSelectSubcall={selectSubcall}
          />
        )}
```

- [ ] **Step 3: Pass filter props to LiveFeed**

Replace:
```tsx
        <LiveFeed events={feedEvents} />
```

With:
```tsx
        <LiveFeed
          events={feedEvents}
          selectedStep={selectedStep}
          selectedSubcall={selectedSubcall}
        />
```

- [ ] **Step 4: Verify full client compiles**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Verify full server compiles**

Run: `cd /Users/jacksonfisk/Desktop/CS/eandjclaudeproject/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire subcall visibility into App layout"
```
