import { useEffect, useRef } from 'react';
import type { PipelineStepName } from '@shared/types/pipeline';
import type { FeedEvent } from '../hooks/usePipeline';

interface LiveFeedProps {
  events: FeedEvent[];
  selectedStep?: PipelineStepName | null;
  selectedSubcall?: string | null;
}

function eventColor(type: string): string {
  switch (type) {
    case 'step:start':
    case 'step:complete':
    case 'pipeline:complete':
      return 'text-green-400';
    case 'subcall:start':
    case 'subcall:complete':
      return 'text-cyan-400';
    case 'tool:call':
      return 'text-gray-400';
    case 'tool:result':
      return 'text-gray-500';
    case 'text:delta':
      return 'text-gray-300';
    case 'result:dossier':
    case 'result:score':
      return 'text-purple-400';
    case 'pipeline:error':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

function eventPrefix(type: string): string {
  switch (type) {
    case 'step:start':
      return '▶ ';
    case 'step:complete':
      return '✓ ';
    case 'subcall:start':
      return '  ▸ ';
    case 'subcall:complete':
      return '  ✓ ';
    case 'tool:call':
      return '🔍 ';
    case 'tool:result':
      return '';
    case 'pipeline:complete':
      return '✓ ';
    case 'pipeline:error':
      return '✗ ';
    case 'result:dossier':
    case 'result:score':
      return '📥 ';
    default:
      return '';
  }
}

export default function LiveFeed({ events, selectedStep, selectedSubcall }: LiveFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = selectedSubcall
    ? events.filter((e) => e.subcall === selectedSubcall)
    : selectedStep
      ? events.filter((e) => e.step === selectedStep)
      : events;

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed p-4"
    >
      {filtered.length === 0 && (
        <p className="text-gray-600">
          {events.length === 0 ? 'Waiting for pipeline to start...' : 'No events for this selection.'}
        </p>
      )}
      {filtered.map((event) => (
        <div
          key={event.id}
          className={`${eventColor(event.type)} ${event.type === 'pipeline:complete' ? 'font-bold' : ''} whitespace-pre-wrap break-words`}
        >
          {eventPrefix(event.type)}{event.message}
        </div>
      ))}
    </div>
  );
}
