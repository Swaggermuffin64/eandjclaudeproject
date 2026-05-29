import type { PipelineStepResponse, PipelineStepName } from '@shared/types/pipeline';

const BASE_URL = 'http://localhost:3001/api';

export async function fetchHealth(): Promise<{ status: string; timestamp: string }> {
  const res = await fetch(`${BASE_URL}/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function runPipelineStep(
  step: PipelineStepName,
): Promise<PipelineStepResponse> {
  const res = await fetch(`${BASE_URL}/pipeline/${step}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Pipeline step "${step}" failed: ${res.status}`);
  return res.json();
}
