export type PipelineStepName = 'ingest' | 'template' | 'dossier' | 'score' | 'audit';

export type PipelineStatus = 'pending' | 'processing' | 'completed' | 'error';

export interface PipelineStepResponse {
  step: PipelineStepName;
  status: PipelineStatus;
  data: Record<string, unknown> | null;
  timestamp: string;
}
