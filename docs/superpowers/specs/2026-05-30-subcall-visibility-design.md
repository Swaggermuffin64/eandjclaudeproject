# Subcall Visibility Design

## Problem

The Dossier and Score pipeline steps decompose into 14 and 9 subcalls respectively, but the client has no structured visibility into them. All subcall output streams into a single terminal feed under the parent step name. The sidebar shows only a single pulsing dot for the entire step. Users cannot tell which subcalls are running, which are done, or isolate a specific subcall's output.

## Goals

1. Add structured SSE events for subcall lifecycle (`subcall:start`, `subcall:complete`)
2. Tag all existing events (`text:delta`, `tool:call`, `tool:result`) with their originating subcall
3. Show clickable subcalls in the sidebar, nested under their parent step
4. Filter the LiveFeed to show only the selected step or subcall's output

## Selection Model

- **"All"** (default): shows every event, unfiltered
- **Click a top-level step** (Ingest, Template, Dossier, Score): filters feed to that step's events
- **Click a subcall** (R0, C3, Routing, etc.): filters feed to only that subcall's events
- Subcalls appear nested under Dossier/Score only once they start running (not shown as pending upfront)
- Clicking the already-selected item deselects it (returns to "All")
- Active selection gets a visual highlight (background color)

## Server Changes

### 1. Shared types (`shared/types/pipeline.ts`)

Add optional `subcall?: string` to existing event interfaces:

```ts
interface TextDeltaEvent {
  type: 'text:delta';
  step: PipelineStepName;
  subcall?: string;       // NEW
  content: string;
  timestamp: string;
}

interface ToolCallEvent {
  type: 'tool:call';
  step: PipelineStepName;
  subcall?: string;       // NEW
  tool: string;
  input: string;
  timestamp: string;
}

interface ToolResultEvent {
  type: 'tool:result';
  step: PipelineStepName;
  subcall?: string;       // NEW
  tool: string;
  summary: string;
  timestamp: string;
}
```

Add two new event types:

```ts
interface SubcallStartEvent {
  type: 'subcall:start';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}

interface SubcallCompleteEvent {
  type: 'subcall:complete';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}
```

Add both to the `PipelineEvent` union.

### 2. Server emit helpers (`server/src/pipeline/types.ts`)

Update `emitTextDelta`, `emitToolCall`, `emitToolResult` to accept an optional `subcall` parameter and include it in the emitted event object.

Add new helpers:

```ts
function emitSubcallStart(emitter, step, subcall): void
function emitSubcallComplete(emitter, step, subcall): void
```

### 3. Claude client (`server/src/pipeline/claude/client.ts`)

Add `subcall?: string` to `ClaudeCallOptions`. Inside `callModel()`, pass `options.subcall` through to every `emitTextDelta`, `emitToolCall`, and `emitToolResult` call.

### 4. Dossier sub-steps (`server/src/pipeline/steps/dossier/sub-steps.ts`)

Each `callOpus()` invocation passes a `subcall` field matching its block name:

| Function | subcall value |
|----------|--------------|
| `runR0` | `'R0'` |
| `runR1` | `'R1'` |
| `runR2` | `'R2'` |
| `runR4a` | `'R4a'` |
| `runR3` | `'R3'` |
| `runCriterionBlock('C1', ...)` | `'C1'` |
| `runCriterionBlock('C2', ...)` | `'C2'` |
| ... | ... |
| `runR5` | `'R5'` |
| `runR6R7R8` | `'R6-R8'` |

### 5. Score sub-steps (`server/src/pipeline/steps/score/sub-steps.ts`)

| Function | subcall value |
|----------|--------------|
| `runRouting` | `'Routing'` |
| `runCriterionScore(_, _, _, n, _)` | `'${profile}${n}'` (e.g., `'A1'`, `'B3'`) |
| `runScoreAssembly` | `'Assembly'` |

### 6. Dossier orchestrator (`server/src/pipeline/steps/dossier/index.ts`)

Wrap each `timed()` call with `emitSubcallStart` / `emitSubcallComplete`:

```ts
emitSubcallStart(emitter, 'dossier', 'R0');
const r0 = await timed('R0', () => runR0(filledTemplate, emitter));
emitSubcallComplete(emitter, 'dossier', 'R0');
```

For parallel calls, emit all starts before `Promise.all`, then emit completes as each resolves (wrap each promise individually).

Remove the `emitPhase()` text banners — the structured subcall events replace them.

### 7. Score orchestrator (`server/src/pipeline/steps/score/index.ts`)

Same pattern as dossier. For the 7 parallel criterion scores, wrap each individual promise.

Remove `emitPhase()` calls.

## Client Changes

### 8. `usePipeline.ts`

**New state:**

```ts
subcallStates: Record<string, { step: PipelineStepName; state: StepState }>
selectedStep: PipelineStepName | null
selectedSubcall: string | null
```

**New actions:** `setSelectedStep(step)`, `setSelectedSubcall(subcall)`

**FeedEvent changes:** Add `subcall?: string` field.

**New event handlers in `handleEvent`:**

- `subcall:start`: add entry to `subcallStates` with `state: 'running'`, tag feed event
- `subcall:complete`: update `subcallStates` entry to `state: 'done'`, tag feed event
- `text:delta`, `tool:call`, `tool:result`: preserve `subcall` field from server event into `FeedEvent`

**Selection logic:** clicking a step sets `selectedStep` and clears `selectedSubcall`; clicking a subcall sets both `selectedSubcall` and `selectedStep` (to its parent). Clicking the active selection clears both (back to "All").

### 9. `StepStatus.tsx`

- Add an "All" row at the top, highlighted when nothing is selected
- Make each step row clickable via `onSelectStep` callback
- After each Dossier/Score row, render its known subcalls (from `subcallStates`) as indented clickable items with the same icon/color system
- Highlight the active selection with a background color (e.g., `bg-blue-50` in the light sidebar)

### 10. `LiveFeed.tsx`

Accept new props: `selectedStep?: PipelineStepName`, `selectedSubcall?: string`.

Filter logic before rendering:

```ts
const filtered = selectedSubcall
  ? events.filter(e => e.subcall === selectedSubcall)
  : selectedStep
    ? events.filter(e => e.step === selectedStep)
    : events;
```

### 11. `App.tsx`

Wire `selectedStep`, `selectedSubcall`, `setSelectedStep`, `setSelectedSubcall` from `usePipeline` into `StepStatus` and `LiveFeed`.

## Subcall Names Reference

**Dossier (14 subcalls):**
R0, R1, R2, R4a, R3, C1, C2, C3, C4, C5, C6, C7, R5, R6-R8

**Score (up to 9 subcalls):**
Routing, A1-A7 or B1-B7 (depending on profile), Assembly

(When disqualified, only Routing + Assembly run.)
