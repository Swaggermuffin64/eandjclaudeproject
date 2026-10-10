import type { FeedEvent } from './usePipeline';

/** A chunk of streamed model text, as it arrives from the pipeline. */
export interface TextDelta {
  step: string;
  subcall?: string;
  content: string;
  timestamp: string;
}

/**
 * Adds a chunk of streamed text to the live feed and returns the new feed.
 *
 * Used by usePipeline when a 'text:delta' event arrives. Each feed event is
 * rendered by LiveFeed as its own line, so a chunk must extend the text its
 * own subcall is already writing rather than start a new line.
 *
 * Subcalls such as R1, R2 and R4a stream in parallel, so their chunks arrive
 * interleaved. The chunk is therefore matched to the most recent event from
 * the same step and subcall, not simply to the last event in the feed. If that
 * event is not text (for example a tool call), a new text event is started.
 */
export function appendTextDeltaToFeed(
  events: FeedEvent[],
  delta: TextDelta,
  createId: () => number,
): FeedEvent[] {
  const latestIndex = findLatestEventIndexForSubcall(events, delta.step, delta.subcall);
  const latest = events[latestIndex];

  if (latest && latest.type === 'text:delta') {
    const extended = { ...latest, message: latest.message + delta.content };
    return [...events.slice(0, latestIndex), extended, ...events.slice(latestIndex + 1)];
  }

  return [...events, {
    id: createId(),
    type: 'text:delta',
    step: delta.step,
    subcall: delta.subcall,
    message: delta.content,
    timestamp: delta.timestamp,
  }];
}

/** Returns the index of the newest feed event from the given step and subcall, or -1 if there is none. */
function findLatestEventIndexForSubcall(events: FeedEvent[], step: string, subcall?: string): number {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index].step === step && events[index].subcall === subcall) {
      return index;
    }
  }
  return -1;
}
