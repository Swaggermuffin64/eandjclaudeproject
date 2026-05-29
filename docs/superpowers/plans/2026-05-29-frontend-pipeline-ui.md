# Frontend Pipeline UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-page shell frontend with a single-page two-panel pipeline runner that uploads PDFs, streams SSE progress in real-time, and offers downloadable results.

**Architecture:** Single-page React app with a left config panel (file upload, rubric selector, step status) and a right output panel (dark terminal-style live feed). A `usePipeline` hook manages all state. The API client uses `fetch` with `ReadableStream` to consume SSE from `POST /api/pipeline/run`.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite (existing). No new dependencies. Removing `react-router-dom`.

---

## File Map

### New files
- `client/src/api/client.ts` — SSE-based `startPipeline()` function (replaces old file)
- `client/src/hooks/usePipeline.ts` — Central state hook
- `client/src/components/FileUpload.tsx` — Drag-and-drop PDF upload
- `client/src/components/StepStatus.tsx` — Step progress indicators
- `client/src/components/LiveFeed.tsx` — Terminal-style event log
- `client/src/components/DownloadButtons.tsx` — Download dossier/score

### Modified files
- `client/package.json` — Remove `react-router-dom`
- `client/src/main.tsx` — Remove `BrowserRouter` wrapper
- `client/src/App.tsx` — Replace with two-panel layout

### Deleted files
- `client/src/pages/Dashboard.tsx`
- `client/src/pages/Ingest.tsx`
- `client/src/pages/Template.tsx`
- `client/src/pages/Dossier.tsx`
- `client/src/pages/Score.tsx`
- `client/src/pages/Audit.tsx`

---

## Task 1: Remove Old Shell (Router, Pages, Dependencies)

**Files:**
- Modify: `client/package.json`
- Modify: `client/src/main.tsx`
- Delete: `client/src/pages/Dashboard.tsx`
- Delete: `client/src/pages/Ingest.tsx`
- Delete: `client/src/pages/Template.tsx`
- Delete: `client/src/pages/Dossier.tsx`
- Delete: `client/src/pages/Score.tsx`
- Delete: `client/src/pages/Audit.tsx`

- [ ] **Step 1: Delete all page components**

```bash
rm client/src/pages/Dashboard.tsx client/src/pages/Ingest.tsx client/src/pages/Template.tsx client/src/pages/Dossier.tsx client/src/pages/Score.tsx client/src/pages/Audit.tsx
rmdir client/src/pages
```

- [ ] **Step 2: Remove `react-router-dom` from `client/package.json`**

Remove `"react-router-dom": "^6.26.0"` from the dependencies section. The dependencies should be:

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  }
}
```

- [ ] **Step 3: Run `cd client && npm install` to update lockfile**

- [ ] **Step 4: Replace `client/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Replace `client/src/App.tsx` with a placeholder**

```tsx
export default function App() {
  return (
    <div className="flex h-screen">
      <div className="w-80 bg-gray-50 p-6 border-r border-gray-200">
        <h1 className="text-lg font-bold text-gray-900">Research Pipeline</h1>
      </div>
      <div className="flex-1 bg-gray-900 p-4">
        <p className="text-gray-400 font-mono text-sm">Live output will appear here...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify it builds**

```bash
cd client && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A client/
git commit -m "refactor: remove router, sidebar, and page components from shell"
```

---

## Task 2: API Client — SSE Pipeline Runner

**Files:**
- Create: `client/src/api/client.ts` (replace existing)

- [ ] **Step 1: Replace `client/src/api/client.ts`**

```typescript
import type { PipelineEvent, RubricType } from '@shared/types/pipeline';

const BASE_URL = 'http://localhost:3001/api';

export function startPipeline(
  primaryPdf: File,
  supplementaryPdfs: File[],
  rubric: RubricType,
  onEvent: (event: PipelineEvent) => void,
): AbortController {
  const controller = new AbortController();

  const formData = new FormData();
  formData.append('primaryPdf', primaryPdf);
  for (const file of supplementaryPdfs) {
    formData.append('supplementaryPdfs', file);
  }
  formData.append('rubric', rubric);

  fetch(`${BASE_URL}/pipeline/run`, {
    method: 'POST',
    body: formData,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        onEvent({
          type: 'pipeline:error',
          error: body.error || `HTTP ${response.status}`,
          step: 'ingest',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as PipelineEvent;
              onEvent(event);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onEvent({
          type: 'pipeline:error',
          error: err.message || 'Network error',
          step: 'ingest',
          timestamp: new Date().toISOString(),
        });
      }
    });

  return controller;
}

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/client.ts
git commit -m "feat: replace API client with SSE-based pipeline runner"
```

---

## Task 3: `usePipeline` Hook

**Files:**
- Create: `client/src/hooks/usePipeline.ts`

- [ ] **Step 1: Create `client/src/hooks/usePipeline.ts`**

```typescript
import { useState, useCallback, useRef } from 'react';
import type { PipelineStepName, RubricType, PipelineEvent } from '@shared/types/pipeline';
import { startPipeline } from '../api/client';

export interface UploadedFile {
  file: File;
  isPrimary: boolean;
}

export type PipelineUIStatus = 'idle' | 'running' | 'complete' | 'error';

export type StepState = 'pending' | 'running' | 'done' | 'error';

export interface FeedEvent {
  id: number;
  type: string;
  step?: string;
  message: string;
  timestamp: string;
}

const STEPS: PipelineStepName[] = ['ingest', 'template', 'dossier', 'score'];

function initialStepStates(): Record<PipelineStepName, StepState> {
  return { ingest: 'pending', template: 'pending', dossier: 'pending', score: 'pending' };
}

export function usePipeline() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [rubric, setRubric] = useState<RubricType>('technology');
  const [status, setStatus] = useState<PipelineUIStatus>('idle');
  const [currentStep, setCurrentStep] = useState<PipelineStepName | null>(null);
  const [stepStates, setStepStates] = useState<Record<PipelineStepName, StepState>>(initialStepStates);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [dossierContent, setDossierContent] = useState<string | null>(null);
  const [scoreContent, setScoreContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const eventIdRef = useRef(0);

  const addFeedEvent = useCallback((type: string, message: string, step?: string) => {
    const id = eventIdRef.current++;
    setFeedEvents((prev) => [...prev, { id, type, step, message, timestamp: new Date().toISOString() }]);
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const hasPrimary = prev.some((f) => f.isPrimary);
      const additions = newFiles.map((file, i) => ({
        file,
        isPrimary: !hasPrimary && i === 0 && prev.length === 0,
      }));
      return [...prev, ...additions];
    });
  }, []);

  const setPrimary = useCallback((index: number) => {
    setFiles((prev) =>
      prev.map((f, i) => ({ ...f, isPrimary: i === index })),
    );
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((f) => f.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next;
    });
  }, []);

  const handleEvent = useCallback((event: PipelineEvent) => {
    switch (event.type) {
      case 'step:start':
        setCurrentStep(event.step);
        setStepStates((prev) => ({ ...prev, [event.step]: 'running' }));
        addFeedEvent(event.type, `Step: ${event.step} started`, event.step);
        break;

      case 'step:complete':
        setStepStates((prev) => ({ ...prev, [event.step]: 'done' }));
        addFeedEvent(event.type, `Step: ${event.step} complete`, event.step);
        break;

      case 'tool:call':
        addFeedEvent(event.type, `${event.tool}: ${event.input}`, event.step);
        break;

      case 'tool:result':
        addFeedEvent(event.type, `  → ${event.summary}`, event.step);
        break;

      case 'text:delta':
        setFeedEvents((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'text:delta' && last.step === event.step) {
            const updated = { ...last, message: last.message + event.content };
            return [...prev.slice(0, -1), updated];
          }
          const id = eventIdRef.current++;
          return [...prev, { id, type: 'text:delta', step: event.step, message: event.content, timestamp: event.timestamp }];
        });
        break;

      case 'result:dossier':
        setDossierContent(event.content);
        addFeedEvent(event.type, 'Dossier ready for download');
        break;

      case 'result:score':
        setScoreContent(event.content);
        addFeedEvent(event.type, 'Score ready for download');
        break;

      case 'pipeline:complete':
        setStatus('complete');
        setCurrentStep(null);
        addFeedEvent(event.type, 'Pipeline complete');
        break;

      case 'pipeline:error':
        setStatus('error');
        setError(event.error);
        if (event.step && event.step !== 'unknown') {
          setStepStates((prev) => ({ ...prev, [event.step as PipelineStepName]: 'error' }));
        }
        addFeedEvent(event.type, `Error: ${event.error}`, event.step);
        break;
    }
  }, [addFeedEvent]);

  const start = useCallback(() => {
    const primary = files.find((f) => f.isPrimary);
    if (!primary) return;

    const supplementary = files.filter((f) => !f.isPrimary).map((f) => f.file);

    setStatus('running');
    setError(null);
    setStepStates(initialStepStates());
    setFeedEvents([]);
    setDossierContent(null);
    setScoreContent(null);
    setCurrentStep(null);

    abortRef.current = startPipeline(primary.file, supplementary, rubric, handleEvent);
  }, [files, rubric, handleEvent]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setFiles([]);
    setRubric('technology');
    setStatus('idle');
    setCurrentStep(null);
    setStepStates(initialStepStates());
    setFeedEvents([]);
    setDossierContent(null);
    setScoreContent(null);
    setError(null);
  }, []);

  return {
    files, rubric, status, currentStep, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/usePipeline.ts
git commit -m "feat: add usePipeline hook for pipeline state and SSE event handling"
```

---

## Task 4: FileUpload Component

**Files:**
- Create: `client/src/components/FileUpload.tsx`

- [ ] **Step 1: Create `client/src/components/FileUpload.tsx`**

```tsx
import { useCallback, useRef } from 'react';
import type { UploadedFile } from '../hooks/usePipeline';

interface FileUploadProps {
  files: UploadedFile[];
  onAddFiles: (files: File[]) => void;
  onSetPrimary: (index: number) => void;
  onRemoveFile: (index: number) => void;
  disabled: boolean;
}

export default function FileUpload({ files, onAddFiles, onSetPrimary, onRemoveFile, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (disabled) return;
      const pdfFiles = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
      if (pdfFiles.length > 0) onAddFiles(pdfFiles);
    },
    [disabled, onAddFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleBrowse = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const pdfFiles = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf');
      if (pdfFiles.length > 0) onAddFiles(pdfFiles);
      e.target.value = '';
    },
    [onAddFiles],
  );

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Documents</label>

      {!disabled && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={handleBrowse}
          className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 transition-colors mb-3"
        >
          <p className="text-sm font-medium text-gray-600">Drop PDFs here or click to browse</p>
          <p className="text-xs text-gray-400 mt-1">Primary deck + supplementary docs</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            multiple
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      )}

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div
              key={`${f.file.name}-${i}`}
              className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-gray-400 flex-shrink-0">📄</span>
                <span className="truncate text-gray-700">{f.file.name}</span>
                {f.isPrimary && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                    Primary
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!f.isPrimary && !disabled && (
                  <button
                    onClick={() => onSetPrimary(i)}
                    className="text-xs text-gray-400 hover:text-blue-600 px-1"
                    title="Set as primary"
                  >
                    Set primary
                  </button>
                )}
                {!disabled && (
                  <button
                    onClick={() => onRemoveFile(i)}
                    className="text-gray-400 hover:text-red-500 px-1"
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/FileUpload.tsx
git commit -m "feat: add FileUpload component with drag-and-drop and primary designation"
```

---

## Task 5: StepStatus Component

**Files:**
- Create: `client/src/components/StepStatus.tsx`

- [ ] **Step 1: Create `client/src/components/StepStatus.tsx`**

```tsx
import type { PipelineStepName } from '@shared/types/pipeline';
import type { StepState } from '../hooks/usePipeline';

interface StepStatusProps {
  stepStates: Record<PipelineStepName, StepState>;
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

export default function StepStatus({ stepStates }: StepStatusProps) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Progress</label>
      <div className="space-y-1">
        {STEPS.map(({ key, label }) => {
          const state = stepStates[key];
          const { icon, color } = stateConfig[state];
          return (
            <div
              key={key}
              className={`flex items-center gap-2 text-sm py-1 ${color}`}
            >
              <span className={state === 'running' ? 'animate-pulse' : ''}>{icon}</span>
              <span>{label}</span>
              {state === 'done' && <span className="text-xs text-gray-400 ml-auto">done</span>}
              {state === 'running' && <span className="text-xs text-blue-400 ml-auto">running</span>}
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
git commit -m "feat: add StepStatus component with per-step progress indicators"
```

---

## Task 6: LiveFeed Component

**Files:**
- Create: `client/src/components/LiveFeed.tsx`

- [ ] **Step 1: Create `client/src/components/LiveFeed.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { FeedEvent } from '../hooks/usePipeline';

interface LiveFeedProps {
  events: FeedEvent[];
}

function eventColor(type: string): string {
  switch (type) {
    case 'step:start':
    case 'step:complete':
    case 'pipeline:complete':
      return 'text-green-400';
    case 'tool:call':
      return 'text-gray-400';
    case 'tool:result':
      return 'text-gray-500';
    case 'text:delta':
      return 'text-gray-300';
    case 'result:dossier':
    case 'result:score':
      return 'text-purple-400';
    case 'pipeline:error':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

function eventPrefix(type: string): string {
  switch (type) {
    case 'step:start':
      return '▶ ';
    case 'step:complete':
      return '✓ ';
    case 'tool:call':
      return '🔍 ';
    case 'tool:result':
      return '';
    case 'pipeline:complete':
      return '✓ ';
    case 'pipeline:error':
      return '✗ ';
    case 'result:dossier':
    case 'result:score':
      return '📥 ';
    default:
      return '';
  }
}

export default function LiveFeed({ events }: LiveFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed p-4"
    >
      {events.length === 0 && (
        <p className="text-gray-600">Waiting for pipeline to start...</p>
      )}
      {events.map((event) => (
        <div
          key={event.id}
          className={`${eventColor(event.type)} ${event.type === 'pipeline:complete' ? 'font-bold' : ''} whitespace-pre-wrap break-words`}
        >
          {eventPrefix(event.type)}{event.message}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/LiveFeed.tsx
git commit -m "feat: add LiveFeed component with color-coded auto-scrolling event log"
```

---

## Task 7: DownloadButtons Component

**Files:**
- Create: `client/src/components/DownloadButtons.tsx`

- [ ] **Step 1: Create `client/src/components/DownloadButtons.tsx`**

```tsx
interface DownloadButtonsProps {
  dossierContent: string | null;
  scoreContent: string | null;
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DownloadButtons({ dossierContent, scoreContent }: DownloadButtonsProps) {
  if (!dossierContent && !scoreContent) return null;

  return (
    <div className="flex gap-2">
      {dossierContent && (
        <button
          onClick={() => downloadFile(dossierContent, 'research-dossier.txt')}
          className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded transition-colors"
        >
          Download Dossier
        </button>
      )}
      {scoreContent && (
        <button
          onClick={() => downloadFile(scoreContent, 'evaluation-score.txt')}
          className="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-3 py-1.5 rounded transition-colors"
        >
          Download Score
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/DownloadButtons.tsx
git commit -m "feat: add DownloadButtons component for dossier and score downloads"
```

---

## Task 8: App.tsx — Two-Panel Layout

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Replace `client/src/App.tsx`**

```tsx
import { usePipeline } from './hooks/usePipeline';
import FileUpload from './components/FileUpload';
import StepStatus from './components/StepStatus';
import LiveFeed from './components/LiveFeed';
import DownloadButtons from './components/DownloadButtons';
import type { RubricType } from '@shared/types/pipeline';

export default function App() {
  const {
    files, rubric, status, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
  } = usePipeline();

  const isRunning = status === 'running';
  const canRun = files.some((f) => f.isPrimary) && !isRunning;

  return (
    <div className="flex h-screen">
      {/* Left Panel */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col p-6 gap-6 overflow-y-auto">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Research Pipeline</h1>
          <p className="text-xs text-gray-500 mt-1">Upload documents and run the full evaluation</p>
        </div>

        <FileUpload
          files={files}
          onAddFiles={addFiles}
          onSetPrimary={setPrimary}
          onRemoveFile={removeFile}
          disabled={isRunning}
        />

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Rubric</label>
          <select
            value={rubric}
            onChange={(e) => setRubric(e.target.value as RubricType)}
            disabled={isRunning}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white disabled:opacity-50"
          >
            <option value="technology">Technology</option>
            <option value="life-sciences">Life Sciences</option>
          </select>
        </div>

        {status === 'complete' || status === 'error' ? (
          <button
            onClick={reset}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
          >
            Run Again
          </button>
        ) : (
          <button
            onClick={start}
            disabled={!canRun}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? 'Running...' : 'Run Pipeline'}
          </button>
        )}

        {status !== 'idle' && <StepStatus stepStates={stepStates} />}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Right Panel */}
      <div className="flex-1 bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <span className="text-sm font-semibold text-gray-300">Live Output</span>
          <DownloadButtons dossierContent={dossierContent} scoreContent={scoreContent} />
        </div>
        <LiveFeed events={feedEvents} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it builds**

```bash
cd client && npx vite build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: replace shell with two-panel pipeline runner layout"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Start the backend**

```bash
cd server && npx tsx src/server.ts &
sleep 2
curl -s http://localhost:3001/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 2: Start the frontend**

```bash
cd client && npx vite &
sleep 2
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:3000`. Confirm:
- Two-panel layout: left config panel, right dark output panel
- Drag-and-drop zone visible for PDF upload
- Rubric dropdown with Technology/Life Sciences options
- Run Pipeline button (disabled until a file is uploaded)
- "Waiting for pipeline to start..." message in right panel
- No sidebar, no routing, single page

- [ ] **Step 4: Stop servers**

```bash
kill %1 %2
```
