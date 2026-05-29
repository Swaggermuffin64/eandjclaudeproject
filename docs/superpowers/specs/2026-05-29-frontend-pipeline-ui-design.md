# Frontend Pipeline UI Design

## Overview

Replace the shell's multi-page layout with a single-page two-panel pipeline runner. Left panel: file upload, rubric selection, step status. Right panel: dark terminal-style live feed of SSE events with download buttons. No routing, no sidebar.

This is sub-project 2 of 3.

## Decisions

- **Single page, no routing** — Remove React Router and sidebar. The two-panel layout is the entire app.
- **Two-panel layout** — Left: config/status. Right: live output.
- **Drag-and-drop upload** — Primary PDF required, supplementary optional. User designates which is primary.
- **Real-time SSE** — Events streamed from backend displayed in a live feed.
- **Download buttons** — Dossier and score downloadable as text files when pipeline completes.
- **No persistence** — State resets on page refresh.

## What Gets Removed

- `react-router-dom` dependency
- Sidebar navigation in `App.tsx`
- All 6 page components: `Dashboard.tsx`, `Ingest.tsx`, `Template.tsx`, `Dossier.tsx`, `Score.tsx`, `Audit.tsx`
- `BrowserRouter` wrapper in `main.tsx`
- Old `api/client.ts` (replaced with SSE-based version)

## Component Structure

```
client/src/
  App.tsx                  — Two-panel layout container
  components/
    FileUpload.tsx         — Drag-and-drop PDF upload with primary designation
    StepStatus.tsx         — Step progress indicators (pending/running/done/error)
    LiveFeed.tsx           — Dark terminal-style auto-scrolling event log
    DownloadButtons.tsx    — Download dossier + score as text files
  api/
    client.ts              — startPipeline() function, SSE consumption
  hooks/
    usePipeline.ts         — Central state hook managing files, SSE, pipeline lifecycle
```

## State Management — `usePipeline` Hook

Single hook managing all pipeline state. No external state library.

```typescript
interface UploadedFile {
  file: File;
  isPrimary: boolean;
}

type PipelineUIStatus = 'idle' | 'running' | 'complete' | 'error';

type StepState = 'pending' | 'running' | 'done' | 'error';

interface FeedEvent {
  id: number;
  type: string;
  step?: string;
  message: string;
  timestamp: string;
}

interface PipelineState {
  files: UploadedFile[];
  rubric: RubricType;
  status: PipelineUIStatus;
  currentStep: PipelineStepName | null;
  stepStates: Record<PipelineStepName, StepState>;
  feedEvents: FeedEvent[];
  dossierContent: string | null;
  scoreContent: string | null;
  error: string | null;
}
```

The hook returns the state plus actions:
- `addFiles(files: File[])` — Add files, first file auto-designated as primary
- `setPrimary(index: number)` — Designate a file as primary
- `removeFile(index: number)` — Remove a file
- `setRubric(rubric: RubricType)` — Set rubric choice
- `start()` — Validate inputs, POST to `/api/pipeline/run`, connect SSE
- `reset()` — Clear state back to idle

## API Client — `api/client.ts`

```typescript
function startPipeline(
  primaryPdf: File,
  supplementaryPdfs: File[],
  rubric: RubricType,
  onEvent: (event: PipelineEvent) => void,
): AbortController
```

- Builds `FormData` with `primaryPdf`, `supplementaryPdfs` (multiple), and `rubric`
- POSTs to `http://localhost:3001/api/pipeline/run`
- Reads the response body as a stream (`response.body.getReader()`)
- Parses SSE `data:` lines and calls `onEvent` for each
- Returns an `AbortController` so the hook can cancel if needed
- Uses `fetch` (not `EventSource`, since EventSource doesn't support POST)

## Components

### `FileUpload.tsx`

- Drag-and-drop zone with click-to-browse fallback
- Accepts only `.pdf` files
- Shows list of uploaded files below the drop zone
- First file auto-tagged as "Primary" with a blue badge
- Click a different file to make it primary
- "×" button to remove a file
- Disabled when pipeline is running

### `StepStatus.tsx`

- Vertical list of 4 steps: Ingest, Template, Dossier, Score
- Each step shows an icon + label:
  - Pending: gray circle `○`
  - Running: blue pulsing dot `◉`
  - Done: green checkmark `●`
  - Error: red `✗`
- Receives `stepStates` and `currentStep` as props

### `LiveFeed.tsx`

- Dark background (`bg-gray-900`), monospace font, full height of right panel
- Auto-scrolls to bottom as new events arrive
- Color-coded by event type:
  - `step:start` / `step:complete` — green
  - `tool:call` — gray with search icon
  - `tool:result` — gray, indented
  - `text:delta` — light gray (streaming text, appended to current line)
  - `pipeline:error` — red
  - `pipeline:complete` — green bold
- Shows timestamps for step transitions
- `text:delta` events are batched — consecutive deltas for the same step append to a single growing line rather than creating new entries

### `DownloadButtons.tsx`

- Two buttons: "Download Dossier" and "Download Score"
- Only visible when `dossierContent` / `scoreContent` are non-null
- Creates a Blob and triggers download as `.txt` file
- Positioned in the header area of the right panel

## Layout

### App.tsx

Full-height flex container, no sidebar.

```
┌──────────────────────────────────────────────┐
│ ┌──────────────┐ ┌─────────────────────────┐ │
│ │  Left Panel   │ │     Right Panel          │ │
│ │  (w-80)       │ │     (flex-1)             │ │
│ │               │ │                          │ │
│ │  Title        │ │  Header: "Live Output"   │ │
│ │               │ │  + Download buttons      │ │
│ │  FileUpload   │ │                          │ │
│ │               │ │  LiveFeed                │ │
│ │  Rubric       │ │  (auto-scrolling log)    │ │
│ │  dropdown     │ │                          │ │
│ │               │ │                          │ │
│ │  [Run Button] │ │                          │ │
│ │               │ │                          │ │
│ │  StepStatus   │ │                          │ │
│ │               │ │                          │ │
│ └──────────────┘ └─────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Left panel: `w-80`, light background (`bg-gray-50`), padding, flex column.
Right panel: `flex-1`, dark background (`bg-gray-900`), monospace.

### Left Panel States

**Idle:** Upload zone active, rubric selector active, Run button enabled (blue). Step statuses all pending (gray).

**Running:** Upload zone disabled (files shown read-only). Rubric selector disabled. Run button disabled with "Running..." text. Step statuses update in real-time.

**Complete:** All steps green. Download buttons appear in right panel header. Run button re-enabled as "Run Again" (resets state).

**Error:** Failed step shown in red. Error message displayed below step status. Run button re-enabled.

## Dependencies

### Remove
- `react-router-dom`

### Keep
- `react`, `react-dom`, `typescript`, `vite`, `tailwindcss` (all existing)

### No new dependencies needed
- File upload: native HTML5 drag-and-drop + `<input type="file">`
- SSE parsing: manual `fetch` + `ReadableStream`
- Downloads: `Blob` + `URL.createObjectURL`
