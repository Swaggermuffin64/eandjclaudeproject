import { EventEmitter } from 'node:events';
import type { PipelineStepName, RubricType } from '@shared/types/pipeline.js';

export interface IngestInput {
  primaryPdf: Buffer;
  supplementaryPdfs: Buffer[];
}

export interface IngestOutput {
  extractedText: string;
  entityManifest: string;
}

export interface TemplateInput {
  extractedText: string;
  entityManifest: string;
}

export interface TemplateOutput {
  filledTemplate: string;
}

export interface DossierInput {
  filledTemplate: string;
}

export interface DossierOutput {
  dossier: string;
}

export interface ScoreInput {
  dossier: string;
  rubric: RubricType;
}

export interface ScoreOutput {
  score: string;
}

export interface PipelineRunInput {
  primaryPdf: Buffer;
  supplementaryPdfs: Buffer[];
  rubric: RubricType;
}

export type PipelineEmitter = EventEmitter;

export function emitEvent(emitter: PipelineEmitter, event: Record<string, unknown>): void {
  emitter.emit('pipeline-event', event);
}

export function emitStepStart(emitter: PipelineEmitter, step: PipelineStepName): void {
  emitEvent(emitter, { type: 'step:start', step, timestamp: new Date().toISOString() });
}

export function emitStepComplete(emitter: PipelineEmitter, step: PipelineStepName): void {
  emitEvent(emitter, { type: 'step:complete', step, timestamp: new Date().toISOString() });
}

export function emitToolCall(emitter: PipelineEmitter, step: PipelineStepName, tool: string, input: string): void {
  emitEvent(emitter, { type: 'tool:call', step, tool, input, timestamp: new Date().toISOString() });
}

export function emitToolResult(emitter: PipelineEmitter, step: PipelineStepName, tool: string, summary: string): void {
  emitEvent(emitter, { type: 'tool:result', step, tool, summary, timestamp: new Date().toISOString() });
}

export function emitTextDelta(emitter: PipelineEmitter, step: PipelineStepName, content: string): void {
  emitEvent(emitter, { type: 'text:delta', step, content, timestamp: new Date().toISOString() });
}
