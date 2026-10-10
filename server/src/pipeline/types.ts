import { EventEmitter } from 'node:events';
import type { PipelineStepName, RubricType } from '@shared/types/pipeline.js';
import type { SourceDocumentKind } from '@shared/types/source-document-formats.js';

/** A source document as uploaded by the user: its original filename and raw bytes. */
export interface SourceDocument {
  filename: string;
  content: Buffer;
}

/**
 * A source document after it has been uploaded to the Anthropic Files API.
 * Steps reference it by `fileId` instead of resending its bytes.
 */
export interface UploadedSourceDocument {
  fileId: string;
  /** The original filename, used to label the document for the model. */
  filename: string;
  kind: SourceDocumentKind;
}

export interface TemplateInput {
  primaryDocument: UploadedSourceDocument;
  supplementaryDocuments: UploadedSourceDocument[];
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
  primaryDocument: SourceDocument;
  supplementaryDocuments: SourceDocument[];
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

export function emitToolCall(emitter: PipelineEmitter, step: PipelineStepName, tool: string, input: string, subcall?: string): void {
  emitEvent(emitter, { type: 'tool:call', step, tool, input, ...(subcall ? { subcall } : {}), timestamp: new Date().toISOString() });
}

export function emitToolResult(emitter: PipelineEmitter, step: PipelineStepName, tool: string, summary: string, subcall?: string): void {
  emitEvent(emitter, { type: 'tool:result', step, tool, summary, ...(subcall ? { subcall } : {}), timestamp: new Date().toISOString() });
}

export function emitTextDelta(emitter: PipelineEmitter, step: PipelineStepName, content: string, subcall?: string): void {
  emitEvent(emitter, { type: 'text:delta', step, content, ...(subcall ? { subcall } : {}), timestamp: new Date().toISOString() });
}

export function emitSubcallStart(emitter: PipelineEmitter, step: PipelineStepName, subcall: string): void {
  emitEvent(emitter, { type: 'subcall:start', step, subcall, timestamp: new Date().toISOString() });
}

export function emitSubcallComplete(emitter: PipelineEmitter, step: PipelineStepName, subcall: string): void {
  emitEvent(emitter, { type: 'subcall:complete', step, subcall, timestamp: new Date().toISOString() });
}
