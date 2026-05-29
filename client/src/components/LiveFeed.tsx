import { useEffect, useRef } from 'react';
import type { FeedEvent } from '../hooks/usePipeline';

interface LiveFeedProps {
  events: FeedEvent[];
}

function eventColor(type: string): string {
  switch (type) {
    case 'step:start':
    case 'step:complete':
    case 'pipeline:complete':
      return 'text-green-400';
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

export default function LiveFeed({ events }: LiveFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto font-mono text-xs leading-relaxed p-4"
    >
      {events.length === 0 && (
        <p className="text-gray-600">Waiting for pipeline to start...</p>
      )}
      {events.map((event) => (
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
