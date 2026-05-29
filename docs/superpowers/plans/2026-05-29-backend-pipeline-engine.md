# Backend Pipeline Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 4-step AI pipeline engine that accepts PDF uploads, processes them through Claude Sonnet and Opus, and streams real-time progress via SSE.

**Architecture:** Linear pipeline with SSE event bus. A single `POST /api/pipeline/run` endpoint accepts multipart uploads, runs 4 steps sequentially (ingest → template → dossier → score), and streams events. Each step is an async function. A pipeline lock prevents concurrent runs. Temp files are cleaned up after every run.

**Tech Stack:** Fastify, @anthropic-ai/sdk, @fastify/multipart, TypeScript, Node.js EventEmitter

---

## File Map

### New files
- `server/src/pipeline/types.ts` — All pipeline-internal types (events, step I/O, rubric)
- `server/src/pipeline/claude/client.ts` — Anthropic SDK wrapper for Sonnet and Opus
- `server/src/pipeline/prompts/loader.ts` — Reads and caches prompt .txt files
- `server/src/pipeline/steps/ingest.ts` — Step 1: PDF extraction via Sonnet
- `server/src/pipeline/steps/template.ts` — Step 2: Operator input filling via Sonnet
- `server/src/pipeline/steps/dossier.ts` — Step 3: Full dossier generation via Opus
- `server/src/pipeline/steps/score.ts` — Step 4: Rubric scoring via Opus
- `server/src/pipeline/orchestrator.ts` — Runs steps in sequence, manages lock and SSE
- `server/src/routes/pipeline.ts` — POST /api/pipeline/run route handler
- `server/src/plugins/multipart.ts` — @fastify/multipart registration

### Modified files
- `server/package.json` — Add new dependencies
- `server/src/app.ts` — Remove old placeholder routes, register new pipeline route + multipart plugin
- `shared/types/pipeline.ts` — Update with SSE event types for frontend consumption

### Deleted files
- `server/src/routes/ingest.ts` — Replaced by pipeline route
- `server/src/routes/template.ts` — Replaced by pipeline route
- `server/src/routes/dossier.ts` — Replaced by pipeline route
- `server/src/routes/score.ts` — Replaced by pipeline route
- `server/src/routes/audit.ts` — Replaced by pipeline route

---

## Task 1: Install Dependencies and Update Shared Types

**Files:**
- Modify: `server/package.json`
- Modify: `shared/types/pipeline.ts`

- [ ] **Step 1: Add new dependencies to `server/package.json`**

Replace the entire `server/package.json` with:

```json
{
  "name": "server",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/multipart": "^9.0.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd server && npm install
```

Expected: `@anthropic-ai/sdk`, `@fastify/multipart`, and `dotenv` installed.

- [ ] **Step 3: Update `shared/types/pipeline.ts`**

Replace the entire file with:

```typescript
export type PipelineStepName = 'ingest' | 'template' | 'dossier' | 'score';

export type PipelineStatus = 'pending' | 'processing' | 'completed' | 'error';

export type RubricType = 'life-sciences' | 'technology';

export interface PipelineStepResponse {
  step: PipelineStepName;
  status: PipelineStatus;
  data: Record<string, unknown> | null;
  timestamp: string;
}

// SSE event types streamed from backend to frontend

export interface StepStartEvent {
  type: 'step:start';
  step: PipelineStepName;
  timestamp: string;
}

export interface StepCompleteEvent {
  type: 'step:complete';
  step: PipelineStepName;
  timestamp: string;
}

export interface ToolCallEvent {
  type: 'tool:call';
  step: PipelineStepName;
  tool: string;
  input: string;
  timestamp: string;
}

export interface ToolResultEvent {
  type: 'tool:result';
  step: PipelineStepName;
  tool: string;
  summary: string;
  timestamp: string;
}

export interface TextDeltaEvent {
  type: 'text:delta';
  step: PipelineStepName;
  content: string;
  timestamp: string;
}

export interface ResultDossierEvent {
  type: 'result:dossier';
  content: string;
  timestamp: string;
}

export interface ResultScoreEvent {
  type: 'result:score';
  content: string;
  timestamp: string;
}

export interface PipelineCompleteEvent {
  type: 'pipeline:complete';
  timestamp: string;
}

export interface PipelineErrorEvent {
  type: 'pipeline:error';
  error: string;
  step: PipelineStepName;
  timestamp: string;
}

export type PipelineEvent =
  | StepStartEvent
  | StepCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | TextDeltaEvent
  | ResultDossierEvent
  | ResultScoreEvent
  | PipelineCompleteEvent
  | PipelineErrorEvent;
```

- [ ] **Step 4: Commit**

```bash
git add server/package.json server/package-lock.json shared/types/pipeline.ts
git commit -m "feat: add pipeline dependencies and SSE event types"
```

---

## Task 2: Pipeline Internal Types

**Files:**
- Create: `server/src/pipeline/types.ts`

- [ ] **Step 1: Create `server/src/pipeline/types.ts`**

```typescript
import { EventEmitter } from 'node:events';
import type { PipelineStepName, RubricType } from '@shared/types/pipeline.js';

export interface IngestInput {
  primaryPdf: Buffer;
  supplementaryPdfs: Buffer[];
}

export interface IngestOutput {
  extractedText: string;
  entityManifest: string;
}

export interface TemplateInput {
  extractedText: string;
  entityManifest: string;
}

export interface TemplateOutput {
  filledTemplate: string;
}

export interface DossierInput {
  filledTemplate: string;
}

export interface DossierOutput {
  dossier: string;
}

export interface ScoreInput {
  dossier: string;
  rubric: RubricType;
}

export interface ScoreOutput {
  score: string;
}

export interface PipelineRunInput {
  primaryPdf: Buffer;
  supplementaryPdfs: Buffer[];
  rubric: RubricType;
}

export type PipelineEmitter = EventEmitter;

export function emitEvent(emitter: PipelineEmitter, event: Record<string, unknown>): void {
  emitter.emit('pipeline-event', event);
}

export function emitStepStart(emitter: PipelineEmitter, step: PipelineStepName): void {
  emitEvent(emitter, { type: 'step:start', step, timestamp: new Date().toISOString() });
}

export function emitStepComplete(emitter: PipelineEmitter, step: PipelineStepName): void {
  emitEvent(emitter, { type: 'step:complete', step, timestamp: new Date().toISOString() });
}

export function emitToolCall(emitter: PipelineEmitter, step: PipelineStepName, tool: string, input: string): void {
  emitEvent(emitter, { type: 'tool:call', step, tool, input, timestamp: new Date().toISOString() });
}

export function emitToolResult(emitter: PipelineEmitter, step: PipelineStepName, tool: string, summary: string): void {
  emitEvent(emitter, { type: 'tool:result', step, tool, summary, timestamp: new Date().toISOString() });
}

export function emitTextDelta(emitter: PipelineEmitter, step: PipelineStepName, content: string): void {
  emitEvent(emitter, { type: 'text:delta', step, content, timestamp: new Date().toISOString() });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/types.ts
git commit -m "feat: add pipeline internal types and event emitter helpers"
```

---

## Task 3: Prompt Loader

**Files:**
- Create: `server/src/pipeline/prompts/loader.ts`

- [ ] **Step 1: Create `server/src/pipeline/prompts/loader.ts`**

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RubricType } from '@shared/types/pipeline.js';

const PROMPTS_DIR = resolve(import.meta.dirname, '../../../../prompts');

let cachedPrompts: {
  researchDossierTemplate: string;
  lifeSciencesRubric: string;
  technologyRubric: string;
} | null = null;

function loadAll() {
  if (cachedPrompts) return cachedPrompts;
  cachedPrompts = {
    researchDossierTemplate: readFileSync(resolve(PROMPTS_DIR, 'Research Dossier Template.txt'), 'utf-8'),
    lifeSciencesRubric: readFileSync(resolve(PROMPTS_DIR, 'Life Sciences Rubric v5.1.txt'), 'utf-8'),
    technologyRubric: readFileSync(resolve(PROMPTS_DIR, 'Technology Rubric.txt'), 'utf-8'),
  };
  return cachedPrompts;
}

export function getResearchDossierTemplate(): string {
  return loadAll().researchDossierTemplate;
}

export function getRubricPrompt(rubric: RubricType): string {
  const prompts = loadAll();
  return rubric === 'life-sciences' ? prompts.lifeSciencesRubric : prompts.technologyRubric;
}
```

- [ ] **Step 2: Verify the loader works**

```bash
cd server && npx tsx -e "
import { getResearchDossierTemplate, getRubricPrompt } from './src/pipeline/prompts/loader.js';
const t = getResearchDossierTemplate();
console.log('Template length:', t.length);
const r = getRubricPrompt('technology');
console.log('Tech rubric length:', r.length);
console.log('OK');
"
```

Expected: Template and rubric lengths printed, `OK`.

- [ ] **Step 3: Commit**

```bash
git add server/src/pipeline/prompts/loader.ts
git commit -m "feat: add prompt loader with caching for rubric and template files"
```

---

## Task 4: Claude API Client Wrapper

**Files:**
- Create: `server/src/pipeline/claude/client.ts`

- [ ] **Step 1: Create `server/src/pipeline/claude/client.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { PipelineStepName } from '@shared/types/pipeline.js';
import { emitTextDelta, emitToolCall, emitToolResult, type PipelineEmitter } from '../types.js';

const SONNET_MODEL = 'claude-sonnet-4-6';
const OPUS_MODEL = 'claude-opus-4-6';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface ClaudeCallOptions {
  systemPrompt: string;
  userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  emitter: PipelineEmitter;
  step: PipelineStepName;
  tools?: Anthropic.Tool[];
  maxTokens?: number;
}

export async function callSonnet(options: ClaudeCallOptions): Promise<string> {
  return callModel(SONNET_MODEL, options);
}

export async function callOpus(options: ClaudeCallOptions): Promise<string> {
  return callModel(OPUS_MODEL, options);
}

async function callModel(model: string, options: ClaudeCallOptions): Promise<string> {
  const { systemPrompt, userContent, emitter, step, tools, maxTokens = 16384 } = options;
  const anthropic = getClient();

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  let fullResponse = '';

  while (true) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];
    let currentText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentText += event.delta.text;
          emitTextDelta(emitter, step, event.delta.text);
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          });
        }
      } else if (event.type === 'content_block_stop') {
        // tool_use input is accumulated by the SDK
      }
    }

    const finalMessage = await stream.finalMessage();
    fullResponse += currentText;

    // Check if there are tool use blocks in the final message
    const toolBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
      break;
    }

    // Process tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolBlock of toolBlocks) {
      const inputStr = typeof toolBlock.input === 'string'
        ? toolBlock.input
        : JSON.stringify(toolBlock.input);
      emitToolCall(emitter, step, toolBlock.name, inputStr);

      // For server-side tools like web_search, the API handles them internally.
      // For tools that need client-side execution, we'd handle them here.
      // Currently we rely on Claude's built-in web_search tool which is server-side.
      const resultContent = `Tool ${toolBlock.name} executed by API`;
      emitToolResult(emitter, step, toolBlock.name, resultContent);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: resultContent,
      });
    }

    // Add assistant message and tool results to conversation for next turn
    messages.push({ role: 'assistant', content: finalMessage.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return fullResponse;
}

export function buildPdfContentBlock(pdfBuffer: Buffer): Anthropic.DocumentBlockParam {
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/claude/client.ts
git commit -m "feat: add Claude API client wrapper with streaming and tool use loop"
```

---

## Task 5: Step 1 — Ingest

**Files:**
- Create: `server/src/pipeline/steps/ingest.ts`

- [ ] **Step 1: Create `server/src/pipeline/steps/ingest.ts`**

```typescript
import type { PipelineEmitter, IngestInput, IngestOutput } from '../types.js';
import { callSonnet, buildPdfContentBlock } from '../claude/client.js';

const ENTITY_EXTRACTION_PROMPT = `You are Claude Sonnet operating as a document extraction engine. Your job is to extract a structured entity manifest from company source documents (pitch decks, one-pagers, financials, etc.).

Extract the following into a structured manifest (OI-3 Sonnet Entity Manifest):

1. LEGAL ENTITY: Full legal name, DBA/brand names, jurisdiction of incorporation
2. NAMED FOUNDERS/EXECUTIVES: Name, title, claimed background for each
3. TEAM MEMBERS: Non-founder team members mentioned by name
4. ADVISORS: Named advisors, board members, KOLs
5. CUSTOMERS: Named customers, partners, design partners
6. COMPETITORS: Named competitors or competitive landscape references
7. INVESTORS: Named investors (institutional, angel, accelerator)
8. PRIOR EMPLOYERS: Employer names associated with founder/team claims
9. MEDIA COVERAGE: Named press outlets, publications, awards
10. PRODUCT ELEMENTS: Product names, features, technical claims
11. QUANTITATIVE CLAIMS: Revenue figures, growth rates, market sizes, user counts
12. CREDENTIAL CLAIMS: Degrees, patents, publications, certifications
13. REGULATORY FLAGS: FDA mentions, compliance claims, regulatory pathway references
14. AMBIGUOUS ATTRIBUTIONS: Claims where the subject or attribution is unclear
15. CAPITAL STRUCTURE CLAIMS: Raise amounts, valuations, round types, investor terms
16. SURFACED INDIVIDUALS LOG: All named individuals for downstream research

For each extracted entity, note the source location (page/section) where it appears.

Also produce a clean text extraction of the full document content for downstream processing.

Output format:
---EXTRACTED TEXT---
[Full clean text of all documents]
---ENTITY MANIFEST---
[Structured manifest with all 16 categories above]`;

export async function runIngest(input: IngestInput, emitter: PipelineEmitter): Promise<IngestOutput> {
  const contentBlocks: Array<ReturnType<typeof buildPdfContentBlock> | { type: 'text'; text: string }> = [];

  contentBlocks.push({ type: 'text', text: 'PRIMARY DOCUMENT:' });
  contentBlocks.push(buildPdfContentBlock(input.primaryPdf));

  for (let i = 0; i < input.supplementaryPdfs.length; i++) {
    contentBlocks.push({ type: 'text', text: `SUPPLEMENTARY DOCUMENT ${i + 1}:` });
    contentBlocks.push(buildPdfContentBlock(input.supplementaryPdfs[i]));
  }

  contentBlocks.push({
    type: 'text',
    text: 'Extract the full text and produce the entity manifest as instructed.',
  });

  const response = await callSonnet({
    systemPrompt: ENTITY_EXTRACTION_PROMPT,
    userContent: contentBlocks,
    emitter,
    step: 'ingest',
    maxTokens: 16384,
  });

  const textMarker = '---EXTRACTED TEXT---';
  const manifestMarker = '---ENTITY MANIFEST---';

  const textStart = response.indexOf(textMarker);
  const manifestStart = response.indexOf(manifestMarker);

  let extractedText: string;
  let entityManifest: string;

  if (textStart !== -1 && manifestStart !== -1) {
    extractedText = response.slice(textStart + textMarker.length, manifestStart).trim();
    entityManifest = response.slice(manifestStart + manifestMarker.length).trim();
  } else {
    // If markers are missing, treat entire response as both
    extractedText = response;
    entityManifest = response;
  }

  return { extractedText, entityManifest };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/ingest.ts
git commit -m "feat: add ingest step — PDF extraction via Sonnet"
```

---

## Task 6: Step 2 — Template

**Files:**
- Create: `server/src/pipeline/steps/template.ts`

- [ ] **Step 1: Create `server/src/pipeline/steps/template.ts`**

```typescript
import type { PipelineEmitter, TemplateInput, TemplateOutput } from '../types.js';
import { callSonnet } from '../claude/client.js';
import { getResearchDossierTemplate } from '../prompts/loader.js';

const TEMPLATE_FILL_PROMPT = `You are Claude Sonnet operating as a research template preparation engine. Your job is to take extracted document text and an entity manifest, and produce the three Operator Inputs (OI-1, OI-2, OI-3) that the Research Dossier Template requires.

Using the extracted text and entity manifest provided, produce the following structured operator inputs:

OI-1 (Source Documents): List all source documents that were processed, with a brief description of each document's type and content coverage.

OI-2 (Company Quick Reference): A structured quick-reference block containing:
  - Company legal name and DBA
  - Sector / industry
  - Headquarters location
  - Founding year
  - Current headcount (if available)
  - Current fundraising target (if stated)
  - Most recent funding round (if available)
  - Development stage
  - Primary product / technology

OI-3 (Entity Manifest): The full entity manifest as extracted, organized into all 16 categories.

Format your output as a single structured document with clear section headers for each operator input.`;

export async function runTemplate(input: TemplateInput, emitter: PipelineEmitter): Promise<TemplateOutput> {
  const dossierTemplate = getResearchDossierTemplate();

  const userMessage = `Here is the Research Dossier Template for reference on the expected operator input format:

<research_dossier_template>
${dossierTemplate}
</research_dossier_template>

Here is the extracted text from the company's source documents:

<extracted_text>
${input.extractedText}
</extracted_text>

Here is the entity manifest extracted from the source documents:

<entity_manifest>
${input.entityManifest}
</entity_manifest>

Produce the three Operator Inputs (OI-1, OI-2, OI-3) as instructed.`;

  const response = await callSonnet({
    systemPrompt: TEMPLATE_FILL_PROMPT,
    userContent: userMessage,
    emitter,
    step: 'template',
    maxTokens: 16384,
  });

  return { filledTemplate: response };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/template.ts
git commit -m "feat: add template step — operator input filling via Sonnet"
```

---

## Task 7: Step 3 — Dossier

**Files:**
- Create: `server/src/pipeline/steps/dossier.ts`

- [ ] **Step 1: Create `server/src/pipeline/steps/dossier.ts`**

```typescript
import type { PipelineEmitter, DossierInput, DossierOutput } from '../types.js';
import { callOpus } from '../claude/client.js';
import { getResearchDossierTemplate } from '../prompts/loader.js';

export async function runDossier(input: DossierInput, emitter: PipelineEmitter): Promise<DossierOutput> {
  const dossierTemplate = getResearchDossierTemplate();

  const userMessage = `Here are the prepared operator inputs for this company evaluation:

<operator_inputs>
${input.filledTemplate}
</operator_inputs>

Produce the complete research dossier (blocks R0 through R8) following the template instructions exactly. Use the web_search tool to verify claims, research founders, check patents, validate customer relationships, and gather competitive intelligence as the template requires.`;

  const response = await callOpus({
    systemPrompt: dossierTemplate,
    userContent: userMessage,
    emitter,
    step: 'dossier',
    tools: [
      {
        type: 'web_search' as const,
        name: 'web_search',
        max_uses: 50,
      } as unknown as import('@anthropic-ai/sdk').Tool,
    ],
    maxTokens: 32768,
  });

  return { dossier: response };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/dossier.ts
git commit -m "feat: add dossier step — full R0-R8 generation via Opus with web search"
```

---

## Task 8: Step 4 — Score

**Files:**
- Create: `server/src/pipeline/steps/score.ts`

- [ ] **Step 1: Create `server/src/pipeline/steps/score.ts`**

```typescript
import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../types.js';
import { callOpus } from '../claude/client.js';
import { getRubricPrompt } from '../prompts/loader.js';

export async function runScore(input: ScoreInput, emitter: PipelineEmitter): Promise<ScoreOutput> {
  const rubricPrompt = getRubricPrompt(input.rubric);

  const userMessage = `Here is the completed research dossier to evaluate:

<research_dossier>
${input.dossier}
</research_dossier>

Score this company according to the rubric. Follow the routing logic to assign the correct profile (A or B), run the disqualifier screen, score all criteria, and produce the complete 7-block standardized scoring output as specified in Section 5 of the rubric.`;

  const response = await callOpus({
    systemPrompt: rubricPrompt,
    userContent: userMessage,
    emitter,
    step: 'score',
    maxTokens: 16384,
  });

  return { score: response };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/steps/score.ts
git commit -m "feat: add score step — rubric evaluation via Opus"
```

---

## Task 9: Pipeline Orchestrator

**Files:**
- Create: `server/src/pipeline/orchestrator.ts`

- [ ] **Step 1: Create `server/src/pipeline/orchestrator.ts`**

```typescript
import { EventEmitter } from 'node:events';
import type { PipelineRunInput, PipelineEmitter } from './types.js';
import { emitStepStart, emitStepComplete, emitEvent } from './types.js';
import { runIngest } from './steps/ingest.js';
import { runTemplate } from './steps/template.js';
import { runDossier } from './steps/dossier.js';
import { runScore } from './steps/score.js';

let pipelineLocked = false;

export function isPipelineLocked(): boolean {
  return pipelineLocked;
}

export async function runPipeline(input: PipelineRunInput, emitter: PipelineEmitter): Promise<void> {
  if (pipelineLocked) {
    throw new Error('Pipeline is already running');
  }

  pipelineLocked = true;

  try {
    // Step 1: Ingest
    emitStepStart(emitter, 'ingest');
    const ingestResult = await runIngest(
      { primaryPdf: input.primaryPdf, supplementaryPdfs: input.supplementaryPdfs },
      emitter,
    );
    emitStepComplete(emitter, 'ingest');

    // Step 2: Template
    emitStepStart(emitter, 'template');
    const templateResult = await runTemplate(
      { extractedText: ingestResult.extractedText, entityManifest: ingestResult.entityManifest },
      emitter,
    );
    emitStepComplete(emitter, 'template');

    // Step 3: Dossier
    emitStepStart(emitter, 'dossier');
    const dossierResult = await runDossier(
      { filledTemplate: templateResult.filledTemplate },
      emitter,
    );
    emitStepComplete(emitter, 'dossier');

    // Emit dossier result for download
    emitEvent(emitter, {
      type: 'result:dossier',
      content: dossierResult.dossier,
      timestamp: new Date().toISOString(),
    });

    // Step 4: Score
    emitStepStart(emitter, 'score');
    const scoreResult = await runScore(
      { dossier: dossierResult.dossier, rubric: input.rubric },
      emitter,
    );
    emitStepComplete(emitter, 'score');

    // Emit score result for download
    emitEvent(emitter, {
      type: 'result:score',
      content: scoreResult.score,
      timestamp: new Date().toISOString(),
    });

    // Pipeline complete
    emitEvent(emitter, {
      type: 'pipeline:complete',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    emitEvent(emitter, {
      type: 'pipeline:error',
      error: message,
      step: 'unknown',
      timestamp: new Date().toISOString(),
    });
  } finally {
    pipelineLocked = false;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/pipeline/orchestrator.ts
git commit -m "feat: add pipeline orchestrator with lock and sequential step execution"
```

---

## Task 10: Multipart Plugin

**Files:**
- Create: `server/src/plugins/multipart.ts`

- [ ] **Step 1: Create `server/src/plugins/multipart.ts`**

```typescript
import multipart from '@fastify/multipart';
import { FastifyInstance } from 'fastify';

const MAX_FILE_SIZE = 32 * 1024 * 1024; // 32MB

export async function registerMultipart(app: FastifyInstance) {
  await app.register(multipart, {
    limits: {
      fileSize: MAX_FILE_SIZE,
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/plugins/multipart.ts
git commit -m "feat: add multipart plugin for file uploads (32MB limit)"
```

---

## Task 11: Pipeline Route Handler

**Files:**
- Create: `server/src/routes/pipeline.ts`

- [ ] **Step 1: Create `server/src/routes/pipeline.ts`**

```typescript
import { EventEmitter } from 'node:events';
import { FastifyInstance } from 'fastify';
import type { RubricType } from '@shared/types/pipeline.js';
import { runPipeline, isPipelineLocked } from '../pipeline/orchestrator.js';

const VALID_RUBRICS: RubricType[] = ['life-sciences', 'technology'];

export async function pipelineRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/run', async (request, reply) => {
    // Check pipeline lock
    if (isPipelineLocked()) {
      return reply.code(409).send({ error: 'Pipeline is already running' });
    }

    // Parse multipart data
    const parts = request.parts();
    let primaryPdf: Buffer | null = null;
    const supplementaryPdfs: Buffer[] = [];
    let rubric: RubricType | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const buffer = await part.toBuffer();
        if (part.fieldname === 'primaryPdf') {
          primaryPdf = buffer;
        } else if (part.fieldname === 'supplementaryPdfs') {
          supplementaryPdfs.push(buffer);
        }
      } else if (part.type === 'field') {
        if (part.fieldname === 'rubric' && typeof part.value === 'string') {
          rubric = part.value as RubricType;
        }
      }
    }

    // Validate inputs
    if (!primaryPdf) {
      return reply.code(400).send({ error: 'primaryPdf is required' });
    }
    if (!rubric || !VALID_RUBRICS.includes(rubric)) {
      return reply.code(400).send({ error: 'rubric must be "life-sciences" or "technology"' });
    }

    // Set up SSE
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': 'http://localhost:3000',
    });

    const emitter = new EventEmitter();

    emitter.on('pipeline-event', (event: Record<string, unknown>) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Run pipeline (don't await — let it stream)
    runPipeline(
      { primaryPdf, supplementaryPdfs, rubric },
      emitter,
    ).finally(() => {
      reply.raw.end();
    });

    // Prevent Fastify from sending its own response
    return reply;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/routes/pipeline.ts
git commit -m "feat: add pipeline route handler with SSE streaming"
```

---

## Task 12: Wire Everything Into App

**Files:**
- Modify: `server/src/app.ts`
- Modify: `server/src/server.ts`
- Delete: `server/src/routes/ingest.ts`
- Delete: `server/src/routes/template.ts`
- Delete: `server/src/routes/dossier.ts`
- Delete: `server/src/routes/score.ts`
- Delete: `server/src/routes/audit.ts`

- [ ] **Step 1: Delete old placeholder routes**

```bash
rm server/src/routes/ingest.ts server/src/routes/template.ts server/src/routes/dossier.ts server/src/routes/score.ts server/src/routes/audit.ts
```

- [ ] **Step 2: Replace `server/src/server.ts` to load dotenv**

Replace the entire file with:

```typescript
import 'dotenv/config';
import { buildApp } from './app.js';

const PORT = 3001;

async function start() {
  const app = await buildApp();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${PORT}`);
}

start();
```

- [ ] **Step 3: Replace `server/src/app.ts` with new registrations**

Replace the entire file with:

```typescript
import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { registerMultipart } from './plugins/multipart.js';
import { healthRoutes } from './routes/health.js';
import { pipelineRoutes } from './routes/pipeline.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await registerMultipart(app);
  await app.register(healthRoutes);
  await app.register(pipelineRoutes);

  return app;
}
```

- [ ] **Step 4: Verify server starts**

```bash
cd server && npx tsx src/server.ts &
sleep 2
curl -s http://localhost:3001/api/health
kill %1
```

Expected: `{"status":"ok","timestamp":"..."}` — server starts without import errors.

- [ ] **Step 5: Commit**

```bash
git add -A server/src/
git commit -m "feat: wire pipeline engine into app, remove placeholder routes"
```

---

## Task 13: End-to-End Verification

- [ ] **Step 1: Verify server starts with all pipeline code loaded**

```bash
cd server && npx tsx src/server.ts &
sleep 2
curl -s http://localhost:3001/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 2: Verify 409 lock behavior**

```bash
# Without a running pipeline, this should fail with 400 (no file), not 409
curl -s -X POST http://localhost:3001/api/pipeline/run
```

Expected: `{"error":"primaryPdf is required"}` or similar 400 error (not 409).

- [ ] **Step 3: Verify validation errors**

```bash
# Missing rubric
curl -s -X POST http://localhost:3001/api/pipeline/run \
  -F "primaryPdf=@../prompts/Technology Rubric.txt"
```

Expected: `{"error":"rubric must be \"life-sciences\" or \"technology\""}` (400 error). We're using a .txt file as a stand-in for a PDF just to test validation.

- [ ] **Step 4: Stop server**

```bash
kill %1
```

- [ ] **Step 5: Commit if any fixes needed, otherwise skip**

```bash
git status
```

If clean, no commit needed.
