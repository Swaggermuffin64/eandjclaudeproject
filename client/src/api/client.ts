import type { PipelineEvent, RubricType } from '@shared/types/pipeline';
import { resolveApiBaseUrl } from './api-base-url';
import { demoPasskeyHeaders, loadDemoPasskey } from './demo-passkey';

const BASE_URL = resolveApiBaseUrl(import.meta.env.VITE_API_ORIGIN);

export function startPipeline(
  primaryDocument: File,
  supplementaryDocuments: File[],
  rubric: RubricType,
  onEvent: (event: PipelineEvent) => void,
): AbortController {
  const controller = new AbortController();

  const formData = new FormData();
  formData.append('primaryDocument', primaryDocument);
  for (const file of supplementaryDocuments) {
    formData.append('supplementaryDocuments', file);
  }
  formData.append('rubric', rubric);

  fetch(`${BASE_URL}/pipeline/run`, {
    method: 'POST',
    headers: demoPasskeyHeaders(loadDemoPasskey()),
    body: formData,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        onEvent({
          type: 'pipeline:error',
          error: body.error || `HTTP ${response.status}`,
          step: 'template',
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
          step: 'template',
          timestamp: new Date().toISOString(),
        });
      }
    });

  return controller;
}

export function startScoreOnly(
  dossierFile: File,
  rubric: RubricType,
  onEvent: (event: PipelineEvent) => void,
): AbortController {
  const controller = new AbortController();

  const formData = new FormData();
  formData.append('dossier', dossierFile);
  formData.append('rubric', rubric);

  fetch(`${BASE_URL}/pipeline/score`, {
    method: 'POST',
    headers: demoPasskeyHeaders(loadDemoPasskey()),
    body: formData,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        onEvent({
          type: 'pipeline:error',
          error: body.error || `HTTP ${response.status}`,
          step: 'score',
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
          step: 'score',
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
