# Deployment

- **API server (`server/`)** → Fly.io, built from `server/Dockerfile`, configured by `fly.toml` (repo root).
- **Frontend (`client/`)** → Vercel, as a static Vite build.

The frontend calls the API across origins, so each side is told about the other:
Vercel gets the Fly URL (`VITE_API_ORIGIN`), Fly gets the Vercel URL (`CORS_ORIGINS`).

## Environment variables

| Where | Variable | Example | Notes |
|---|---|---|---|
| Fly (secret) | `ANTHROPIC_API_KEY` | `sk-ant-...` | Required. |
| Fly (secret) | `CORS_ORIGINS` | `https://your-app.vercel.app` | Comma-separated. Defaults to `http://localhost:3000`. |
| Fly (`fly.toml`) | `PORT` | `8080` | Already set. Defaults to `3001` locally. |
| Vercel | `VITE_API_ORIGIN` | `https://eandj-pipeline-api.fly.dev` | No `/api` suffix. Baked in at build time — redeploy after changing. |

Nothing needs to be set for local development.

## 1. Deploy the API to Fly.io

From the repo root:

```sh
fly auth login
fly launch --no-deploy --copy-config   # creates the app from fly.toml; rename if the name is taken
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy --ha=false                  # ONE machine: the pipeline lock is in memory
curl https://<app-name>.fly.dev/api/health
```

## 2. Deploy the frontend to Vercel

1. Import the GitHub repo in Vercel.
2. Set **Root Directory** to `client`. Framework preset: Vite (auto-detected).
3. Leave **"Include files outside the root directory in the Build Step"** enabled — the client imports `../shared`.
4. Add `VITE_API_ORIGIN=https://<app-name>.fly.dev` under Environment Variables, then deploy.

## 3. Connect them

```sh
fly secrets set CORS_ORIGINS=https://<your-project>.vercel.app
```

Setting a secret restarts the app. Vercel preview deployments get different URLs;
add them to `CORS_ORIGINS` (comma-separated) if you want previews to reach the API.

## Testing the server image locally

```sh
docker build -f server/Dockerfile -t eandj-api .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... eandj-api
```

## Notes

- Long pipeline runs stream events over one HTTP response. The server sends a
  heartbeat comment every 20s (`server/src/routes/sse-stream.ts`) so Fly's proxy
  doesn't close quiet connections.
- The server runs TypeScript directly with `tsx`; `npm run typecheck` is the build gate.
- The app has no authentication: anyone with the URL can run the pipeline on your Anthropic key.
