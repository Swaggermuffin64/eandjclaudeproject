export type PipelineStepName = 'template' | 'dossier' | 'score';

export type PipelineStatus = 'pending' | 'processing' | 'completed' | 'error';

export type RubricType = 'life-sciences' | 'technology' | 'defense';

export interface PipelineStepResponse {
  step: PipelineStepName;
  status: PipelineStatus;
  data: Record<string, unknown> | null;
  timestamp: string;
}

// SSE event types streamed from backend to frontend

export interface StepStartEvent {
  type: 'step:start';
  step: PipelineStepName;
  timestamp: string;
}

export interface StepCompleteEvent {
  type: 'step:complete';
  step: PipelineStepName;
  timestamp: string;
}

export interface ToolCallEvent {
  type: 'tool:call';
  step: PipelineStepName;
  tool: string;
  input: string;
  subcall?: string;
  timestamp: string;
}

export interface ToolResultEvent {
  type: 'tool:result';
  step: PipelineStepName;
  tool: string;
  summary: string;
  subcall?: string;
  timestamp: string;
}

export interface TextDeltaEvent {
  type: 'text:delta';
  step: PipelineStepName;
  content: string;
  subcall?: string;
  timestamp: string;
}

export interface SubcallStartEvent {
  type: 'subcall:start';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}

export interface SubcallCompleteEvent {
  type: 'subcall:complete';
  step: PipelineStepName;
  subcall: string;
  timestamp: string;
}

export interface ResultDossierEvent {
  type: 'result:dossier';
  content: string;
  timestamp: string;
}

export interface ResultScoreEvent {
  type: 'result:score';
  content: string;
  timestamp: string;
}

export interface PipelineCompleteEvent {
  type: 'pipeline:complete';
  timestamp: string;
}

export interface PipelineErrorEvent {
  type: 'pipeline:error';
  error: string;
  /** 'unknown' when the orchestrator catches an error it can't attribute to a step. */
  step: PipelineStepName | 'unknown';
  timestamp: string;
}

export type PipelineEvent =
  | StepStartEvent
  | StepCompleteEvent
  | ToolCallEvent
  | ToolResultEvent
  | TextDeltaEvent
  | SubcallStartEvent
  | SubcallCompleteEvent
  | ResultDossierEvent
  | ResultScoreEvent
  | PipelineCompleteEvent
  | PipelineErrorEvent;
