import { useState, useCallback, useRef } from 'react';
import type { PipelineStepName, RubricType, PipelineEvent } from '@shared/types/pipeline';
import { startPipeline } from '../api/client';

export interface UploadedFile {
  file: File;
  isPrimary: boolean;
}

export type PipelineUIStatus = 'idle' | 'running' | 'complete' | 'error';

export type StepState = 'pending' | 'running' | 'done' | 'error';

export interface FeedEvent {
  id: number;
  type: string;
  step?: string;
  message: string;
  timestamp: string;
}

const STEPS: PipelineStepName[] = ['ingest', 'template', 'dossier', 'score'];

function initialStepStates(): Record<PipelineStepName, StepState> {
  return { ingest: 'pending', template: 'pending', dossier: 'pending', score: 'pending' };
}

export function usePipeline() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [rubric, setRubric] = useState<RubricType>('technology');
  const [status, setStatus] = useState<PipelineUIStatus>('idle');
  const [currentStep, setCurrentStep] = useState<PipelineStepName | null>(null);
  const [stepStates, setStepStates] = useState<Record<PipelineStepName, StepState>>(initialStepStates);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [dossierContent, setDossierContent] = useState<string | null>(null);
  const [scoreContent, setScoreContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const eventIdRef = useRef(0);

  const addFeedEvent = useCallback((type: string, message: string, step?: string) => {
    const id = eventIdRef.current++;
    setFeedEvents((prev) => [...prev, { id, type, step, message, timestamp: new Date().toISOString() }]);
  }, []);

  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => {
      const hasPrimary = prev.some((f) => f.isPrimary);
      const additions = newFiles.map((file, i) => ({
        file,
        isPrimary: !hasPrimary && i === 0 && prev.length === 0,
      }));
      return [...prev, ...additions];
    });
  }, []);

  const setPrimary = useCallback((index: number) => {
    setFiles((prev) =>
      prev.map((f, i) => ({ ...f, isPrimary: i === index })),
    );
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((f) => f.isPrimary)) {
        next[0].isPrimary = true;
      }
      return next;
    });
  }, []);

  const handleEvent = useCallback((event: PipelineEvent) => {
    switch (event.type) {
      case 'step:start':
        setCurrentStep(event.step);
        setStepStates((prev) => ({ ...prev, [event.step]: 'running' }));
        addFeedEvent(event.type, `Step: ${event.step} started`, event.step);
        break;

      case 'step:complete':
        setStepStates((prev) => ({ ...prev, [event.step]: 'done' }));
        addFeedEvent(event.type, `Step: ${event.step} complete`, event.step);
        break;

      case 'tool:call':
        addFeedEvent(event.type, `${event.tool}: ${event.input}`, event.step);
        break;

      case 'tool:result':
        addFeedEvent(event.type, `  → ${event.summary}`, event.step);
        break;

      case 'text:delta':
        setFeedEvents((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.type === 'text:delta' && last.step === event.step) {
            const updated = { ...last, message: last.message + event.content };
            return [...prev.slice(0, -1), updated];
          }
          const id = eventIdRef.current++;
          return [...prev, { id, type: 'text:delta', step: event.step, message: event.content, timestamp: event.timestamp }];
        });
        break;

      case 'result:dossier':
        setDossierContent(event.content);
        addFeedEvent(event.type, 'Dossier ready for download');
        break;

      case 'result:score':
        setScoreContent(event.content);
        addFeedEvent(event.type, 'Score ready for download');
        break;

      case 'pipeline:complete':
        setStatus('complete');
        setCurrentStep(null);
        addFeedEvent(event.type, 'Pipeline complete');
        break;

      case 'pipeline:error':
        setStatus('error');
        setError(event.error);
        if (event.step && event.step !== 'unknown') {
          setStepStates((prev) => ({ ...prev, [event.step as PipelineStepName]: 'error' }));
        }
        addFeedEvent(event.type, `Error: ${event.error}`, event.step);
        break;
    }
  }, [addFeedEvent]);

  const start = useCallback(() => {
    const primary = files.find((f) => f.isPrimary);
    if (!primary) return;

    const supplementary = files.filter((f) => !f.isPrimary).map((f) => f.file);

    setStatus('running');
    setError(null);
    setStepStates(initialStepStates());
    setFeedEvents([]);
    setDossierContent(null);
    setScoreContent(null);
    setCurrentStep(null);

    abortRef.current = startPipeline(primary.file, supplementary, rubric, handleEvent);
  }, [files, rubric, handleEvent]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setFiles([]);
    setRubric('technology');
    setStatus('idle');
    setCurrentStep(null);
    setStepStates(initialStepStates());
    setFeedEvents([]);
    setDossierContent(null);
    setScoreContent(null);
    setError(null);
  }, []);

  return {
    files, rubric, status, currentStep, stepStates, feedEvents,
    dossierContent, scoreContent, error,
    addFiles, setPrimary, removeFile, setRubric, start, reset,
  };
}
