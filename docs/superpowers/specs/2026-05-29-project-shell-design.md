# Project Shell Design — AI Investment Research Pipeline

## Overview

Decoupled shell for an AI-powered investment research pipeline. Fastify backend (Node.js), React + TypeScript + Vite + Tailwind frontend. No auth, no pipeline logic — a clean skeleton with API communication wired up and placeholder routes/pages for each of the 5 pipeline steps.

The pipeline (to be implemented later):
1. **Ingest** — Normalize raw company documents into clean structured text
2. **Template** — Fill a standardized research dossier template using documents + web search
3. **Dossier** — Generate a comprehensive research report
4. **Score** — Score against sector-specific investment rubric (tier, score, investor match)
5. **Audit** — Self-critique the evaluation for overconfidence or reasoning gaps

## Architecture

Monorepo with three top-level directories:

- `client/` — React + TypeScript + Vite + Tailwind
- `server/` — Fastify + TypeScript
- `shared/` — TypeScript interfaces shared by both sides via path aliases

Each side has its own `package.json` and runs independently. No monorepo tooling (Nx, Turborepo) — not needed at this scale.

## Project Structure

```
eandjclaudeproject/
├── client/
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # One page per pipeline step + Dashboard
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Ingest.tsx
│   │   │   ├── Template.tsx
│   │   │   ├── Dossier.tsx
│   │   │   ├── Score.tsx
│   │   │   └── Audit.tsx
│   │   ├── api/               # Fetch wrapper for backend communication
│   │   │   └── client.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── server/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── ingest.ts
│   │   │   ├── template.ts
│   │   │   ├── dossier.ts
│   │   │   ├── score.ts
│   │   │   └── audit.ts
│   │   ├── plugins/
│   │   │   └── cors.ts
│   │   ├── app.ts
│   │   └── server.ts
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   └── types/
│       └── pipeline.ts
├── .env
└── .gitignore
```

## API Design

Base URL: `http://localhost:3001/api`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/health | Health check |
| POST | /api/pipeline/ingest | Step 1 — Document ingestion |
| POST | /api/pipeline/template | Step 2 — Fill research template |
| POST | /api/pipeline/dossier | Step 3 — Generate dossier |
| POST | /api/pipeline/score | Step 4 — Score against rubric |
| POST | /api/pipeline/audit | Step 5 — Self-audit |

### Shared Response Shape

```typescript
interface PipelineStepResponse {
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data: Record<string, unknown> | null;
  timestamp: string;
}
```

All endpoints return this shape. For the shell, each returns `status: "pending"` with `data: null`.

## Frontend Design

### Layout
Sidebar navigation + main content area. Dark sidebar, light content area. Minimal Tailwind styling.

### Routing (React Router v6)

| Path | Page |
|------|------|
| / | Dashboard |
| /ingest | Ingest |
| /template | Template |
| /dossier | Dossier |
| /score | Score |
| /audit | Audit |

### Pages
Each pipeline step page includes a title, description, and a "Run" button that calls the corresponding API endpoint and displays the JSON response.

### State Management
Local component state only (`useState`). No external state library.

### API Client
Thin `fetch` wrapper in `client/src/api/client.ts` that centralizes the base URL and error handling.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router v6 |
| Backend | Node.js, Fastify, TypeScript |
| Shared | TypeScript interfaces via path aliases |

## Ports

- Frontend dev server: `http://localhost:5173`
- Backend server: `http://localhost:3001`
