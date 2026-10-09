/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin of the API server, e.g. https://my-app.fly.dev. Unset locally. */
  readonly VITE_API_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
