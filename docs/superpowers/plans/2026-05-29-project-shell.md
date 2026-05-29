# Project Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a decoupled monorepo shell with a Fastify backend and React + TypeScript + Tailwind frontend, wired together with shared types and placeholder routes/pages for each of the 5 pipeline steps.

**Architecture:** Monorepo with `client/`, `server/`, and `shared/` top-level directories. Each side has its own `package.json` and runs independently. Shared TypeScript interfaces are referenced via path aliases — no build step for shared types.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS v3, React Router v6, Fastify, Node.js

---

## File Map

### `shared/`
- `shared/types/pipeline.ts` — `PipelineStepResponse` interface and step name union type

### `server/`
- `server/package.json` — Dependencies: fastify, @fastify/cors, typescript, tsx
- `server/tsconfig.json` — TypeScript config with path alias to `shared/`
- `server/src/server.ts` — Entry point, starts Fastify on port 3001
- `server/src/app.ts` — Fastify app factory, registers plugins and routes
- `server/src/plugins/cors.ts` — CORS plugin allowing `localhost:5173`
- `server/src/routes/health.ts` — GET /api/health
- `server/src/routes/ingest.ts` — POST /api/pipeline/ingest
- `server/src/routes/template.ts` — POST /api/pipeline/template
- `server/src/routes/dossier.ts` — POST /api/pipeline/dossier
- `server/src/routes/score.ts` — POST /api/pipeline/score
- `server/src/routes/audit.ts` — POST /api/pipeline/audit

### `client/`
- `client/package.json` — Dependencies: react, react-dom, react-router-dom, typescript, vite, tailwindcss, postcss, autoprefixer
- `client/tsconfig.json` — TypeScript config with path alias to `shared/`
- `client/vite.config.ts` — Vite config with path alias for `@shared`
- `client/tailwind.config.js` — Tailwind config scanning `./src/**/*.{ts,tsx}`
- `client/postcss.config.js` — PostCSS config for Tailwind
- `client/index.html` — HTML entry point
- `client/src/main.tsx` — React entry point, renders App
- `client/src/index.css` — Tailwind directives
- `client/src/App.tsx` — Router + layout (sidebar + content area)
- `client/src/api/client.ts` — Fetch wrapper with base URL and error handling
- `client/src/pages/Dashboard.tsx` — Landing page
- `client/src/pages/Ingest.tsx` — Step 1 page
- `client/src/pages/Template.tsx` — Step 2 page
- `client/src/pages/Dossier.tsx` — Step 3 page
- `client/src/pages/Score.tsx` — Step 4 page
- `client/src/pages/Audit.tsx` — Step 5 page

### Root
- `.gitignore` — Node modules, dist, env files, etc.

---

## Task 1: Root .gitignore and Shared Types

**Files:**
- Create: `.gitignore`
- Create: `shared/types/pipeline.ts`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
.env
.env.*
*.log
.DS_Store
```

- [ ] **Step 2: Create `shared/types/pipeline.ts`**

```typescript
export type PipelineStepName = 'ingest' | 'template' | 'dossier' | 'score' | 'audit';

export type PipelineStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface PipelineStepResponse {
  step: PipelineStepName;
  status: PipelineStatus;
  data: Record<string, unknown> | null;
  timestamp: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore shared/
git commit -m "feat: add shared pipeline types and gitignore"
```

---

## Task 2: Server — Project Setup

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`

- [ ] **Step 1: Create `server/package.json`**

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
    "@fastify/cors": "^10.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "@types/node": "^22.0.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*"],
  "references": []
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd server && npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 4: Commit**

```bash
cd server && git add package.json package-lock.json tsconfig.json && git commit -m "feat: initialize server with fastify and typescript"
```

---

## Task 3: Server — App, Plugins, and Health Route

**Files:**
- Create: `server/src/plugins/cors.ts`
- Create: `server/src/routes/health.ts`
- Create: `server/src/app.ts`
- Create: `server/src/server.ts`

- [ ] **Step 1: Create `server/src/plugins/cors.ts`**

```typescript
import cors from '@fastify/cors';
import { FastifyInstance } from 'fastify';

export async function registerCors(app: FastifyInstance) {
  await app.register(cors, {
    origin: 'http://localhost:5173',
  });
}
```

- [ ] **Step 2: Create `server/src/routes/health.ts`**

```typescript
import { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });
}
```

- [ ] **Step 3: Create `server/src/app.ts`**

```typescript
import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './routes/health.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await app.register(healthRoutes);

  return app;
}
```

- [ ] **Step 4: Create `server/src/server.ts`**

```typescript
import { buildApp } from './app.js';

const PORT = 3001;

async function start() {
  const app = await buildApp();

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Server running on http://localhost:${PORT}`);
}

start();
```

- [ ] **Step 5: Verify server starts**

```bash
cd server && npx tsx src/server.ts &
sleep 2
curl http://localhost:3001/api/health
kill %1
```

Expected: `{"status":"ok","timestamp":"..."}` response.

- [ ] **Step 6: Commit**

```bash
git add server/src/
git commit -m "feat: add fastify app with CORS plugin and health route"
```

---

## Task 4: Server — Pipeline Routes

**Files:**
- Create: `server/src/routes/ingest.ts`
- Create: `server/src/routes/template.ts`
- Create: `server/src/routes/dossier.ts`
- Create: `server/src/routes/score.ts`
- Create: `server/src/routes/audit.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create `server/src/routes/ingest.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function ingestRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/ingest', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'ingest',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
```

- [ ] **Step 2: Create `server/src/routes/template.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function templateRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/template', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'template',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
```

- [ ] **Step 3: Create `server/src/routes/dossier.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function dossierRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/dossier', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'dossier',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
```

- [ ] **Step 4: Create `server/src/routes/score.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function scoreRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/score', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'score',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
```

- [ ] **Step 5: Create `server/src/routes/audit.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { PipelineStepResponse } from '@shared/types/pipeline.js';

export async function auditRoutes(app: FastifyInstance) {
  app.post('/api/pipeline/audit', async (): Promise<PipelineStepResponse> => {
    return {
      step: 'audit',
      status: 'pending',
      data: null,
      timestamp: new Date().toISOString(),
    };
  });
}
```

- [ ] **Step 6: Update `server/src/app.ts` to register pipeline routes**

```typescript
import Fastify from 'fastify';
import { registerCors } from './plugins/cors.js';
import { healthRoutes } from './routes/health.js';
import { ingestRoutes } from './routes/ingest.js';
import { templateRoutes } from './routes/template.js';
import { dossierRoutes } from './routes/dossier.js';
import { scoreRoutes } from './routes/score.js';
import { auditRoutes } from './routes/audit.js';

export async function buildApp() {
  const app = Fastify({ logger: true });

  await registerCors(app);
  await app.register(healthRoutes);
  await app.register(ingestRoutes);
  await app.register(templateRoutes);
  await app.register(dossierRoutes);
  await app.register(scoreRoutes);
  await app.register(auditRoutes);

  return app;
}
```

- [ ] **Step 7: Verify all routes work**

```bash
cd server && npx tsx src/server.ts &
sleep 2
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/pipeline/ingest
curl -X POST http://localhost:3001/api/pipeline/audit
kill %1
```

Expected: Health returns `{"status":"ok",...}`. Pipeline routes return `{"step":"ingest","status":"pending","data":null,"timestamp":"..."}` etc.

- [ ] **Step 8: Commit**

```bash
git add server/src/
git commit -m "feat: add placeholder pipeline routes for all 5 steps"
```

---

## Task 5: Client — Project Setup (Vite + TypeScript + Tailwind)

**Files:**
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/tailwind.config.js`
- Create: `client/postcss.config.js`
- Create: `client/index.html`
- Create: `client/src/main.tsx`
- Create: `client/src/index.css`

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@shared/*": ["../shared/*"]
    }
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `client/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});
```

- [ ] **Step 4: Create `client/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `client/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Investment Research Pipeline</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `client/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `client/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 9: Install dependencies**

```bash
cd client && npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 10: Commit**

```bash
cd client && git add package.json package-lock.json tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html src/main.tsx src/index.css
git commit -m "feat: initialize client with vite, react, typescript, and tailwind"
```

---

## Task 6: Client — API Client

**Files:**
- Create: `client/src/api/client.ts`

- [ ] **Step 1: Create `client/src/api/client.ts`**

```typescript
import type { PipelineStepResponse } from '@shared/types/pipeline';

const BASE_URL = 'http://localhost:3001/api';

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function runPipelineStep(
  step: string,
): Promise<PipelineStepResponse> {
  const res = await fetch(`${BASE_URL}/pipeline/${step}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Pipeline step "${step}" failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api/
git commit -m "feat: add API client with fetch wrapper for backend communication"
```

---

## Task 7: Client — Pages

**Files:**
- Create: `client/src/pages/Dashboard.tsx`
- Create: `client/src/pages/Ingest.tsx`
- Create: `client/src/pages/Template.tsx`
- Create: `client/src/pages/Dossier.tsx`
- Create: `client/src/pages/Score.tsx`
- Create: `client/src/pages/Audit.tsx`

- [ ] **Step 1: Create `client/src/pages/Dashboard.tsx`**

```tsx
export default function Dashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-gray-600">
        AI-powered investment research pipeline. Select a step from the sidebar to get started.
      </p>
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {['Ingest', 'Template', 'Dossier', 'Score', 'Audit'].map((step, i) => (
          <div key={step} className="rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold">Step {i + 1}: {step}</h3>
            <p className="text-sm text-gray-500 mt-1">Pending</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/Ingest.tsx`**

```tsx
import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Ingest() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('ingest');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 1: Ingest</h1>
      <p className="text-gray-600 mb-4">
        Normalize raw company documents into clean, structured text.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/Template.tsx`**

```tsx
import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Template() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('template');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 2: Template</h1>
      <p className="text-gray-600 mb-4">
        Fill a standardized research dossier template using documents and web search.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/pages/Dossier.tsx`**

```tsx
import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Dossier() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('dossier');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 3: Dossier</h1>
      <p className="text-gray-600 mb-4">
        Generate a comprehensive, formatted research report on the company.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `client/src/pages/Score.tsx`**

```tsx
import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Score() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('score');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 4: Score</h1>
      <p className="text-gray-600 mb-4">
        Score the company against a sector-specific investment rubric.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `client/src/pages/Audit.tsx`**

```tsx
import { useState } from 'react';
import { runPipelineStep } from '../api/client';
import type { PipelineStepResponse } from '@shared/types/pipeline';

export default function Audit() {
  const [result, setResult] = useState<PipelineStepResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const data = await runPipelineStep('audit');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Step 5: Audit</h1>
      <p className="text-gray-600 mb-4">
        Self-critique the evaluation for overconfidence or reasoning gaps.
      </p>
      <button
        onClick={handleRun}
        disabled={loading}
        className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Running...' : 'Run'}
      </button>
      {error && <p className="mt-4 text-red-600">{error}</p>}
      {result && (
        <pre className="mt-4 rounded bg-gray-100 p-4 text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add client/src/pages/
git commit -m "feat: add dashboard and pipeline step pages"
```

---

## Task 8: Client — App Layout with Sidebar and Routing

**Files:**
- Create: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/App.tsx`**

```tsx
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Ingest from './pages/Ingest';
import Template from './pages/Template';
import Dossier from './pages/Dossier';
import Score from './pages/Score';
import Audit from './pages/Audit';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/ingest', label: '1. Ingest' },
  { path: '/template', label: '2. Template' },
  { path: '/dossier', label: '3. Dossier' },
  { path: '/score', label: '4. Score' },
  { path: '/audit', label: '5. Audit' },
];

export default function App() {
  return (
    <div className="flex h-screen">
      <nav className="w-56 bg-gray-900 text-gray-300 flex flex-col p-4 space-y-1">
        <h2 className="text-white font-bold text-lg mb-4">Research Pipeline</h2>
        {navItems.map(({ path, label }) => (
          <NavLink
            key={path}
            to={path}
            end={path === '/'}
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm ${
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto bg-gray-50 p-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ingest" element={<Ingest />} />
          <Route path="/template" element={<Template />} />
          <Route path="/dossier" element={<Dossier />} />
          <Route path="/score" element={<Score />} />
          <Route path="/audit" element={<Audit />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: add app layout with sidebar navigation and routing"
```

---

## Task 9: End-to-End Verification

- [ ] **Step 1: Start the backend**

```bash
cd server && npx tsx src/server.ts &
```

- [ ] **Step 2: Start the frontend**

```bash
cd client && npx vite &
```

- [ ] **Step 3: Verify backend health**

```bash
curl http://localhost:3001/api/health
```

Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 4: Verify frontend loads**

Open `http://localhost:5173` in a browser. Confirm:
- Sidebar renders with Dashboard + 5 pipeline step links
- Dashboard page shows the 5 step cards
- Clicking a step page shows title, description, and Run button
- Clicking Run calls the backend and displays the JSON response

- [ ] **Step 5: Stop servers**

```bash
kill %1 %2
```

- [ ] **Step 6: Final commit (if any cleanup needed)**

```bash
git add -A && git status
```

If clean, no commit needed.
