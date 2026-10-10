import { describe, it, expect } from 'vitest';
import { appendTextDeltaToFeed } from '../append-text-delta-to-feed';
import type { FeedEvent } from '../usePipeline';

function createIdCounter(firstId = 100): () => number {
  let nextId = firstId;
  return () => nextId++;
}

function feedEvent(id: number, type: string, subcall: string | undefined, message: string): FeedEvent {
  return { id, type, step: 'dossier', subcall, message, timestamp: 't' };
}

function textDelta(subcall: string | undefined, content: string) {
  return { step: 'dossier', subcall, content, timestamp: 't' };
}

describe('appendTextDeltaToFeed', () => {
  it('starts a new text event when the feed is empty', () => {
    const feed = appendTextDeltaToFeed([], textDelta('R1', 'Hello'), createIdCounter());

    expect(feed).toEqual([feedEvent(100, 'text:delta', 'R1', 'Hello')]);
  });

  it('extends the previous text event of the same subcall', () => {
    const before = [feedEvent(0, 'text:delta', 'R1', 'Hello')];

    const feed = appendTextDeltaToFeed(before, textDelta('R1', ' world'), createIdCounter());

    expect(feed).toEqual([feedEvent(0, 'text:delta', 'R1', 'Hello world')]);
  });

  it('starts a new text event after a tool call from the same subcall', () => {
    const before = [
      feedEvent(0, 'text:delta', 'R1', 'Searching.'),
      feedEvent(1, 'tool:call', 'R1', 'web_search: acme'),
    ];

    const feed = appendTextDeltaToFeed(before, textDelta('R1', 'Found it.'), createIdCounter());

    expect(feed).toHaveLength(3);
    expect(feed[2]).toEqual(feedEvent(100, 'text:delta', 'R1', 'Found it.'));
  });

  it('does not mutate the feed it was given', () => {
    const before = [feedEvent(0, 'text:delta', 'R1', 'Hello')];

    appendTextDeltaToFeed(before, textDelta('R1', ' world'), createIdCounter());

    expect(before).toEqual([feedEvent(0, 'text:delta', 'R1', 'Hello')]);
  });

  // Regression: R1, R2 and R4a stream in parallel. Their deltas used to be
  // merged only into the very last feed event, so every interleaved fragment
  // became its own line and the text never filled the width of the feed.
  it('keeps one text event per subcall when parallel subcalls interleave', () => {
    const createId = createIdCounter();
    const interleavedDeltas = [
      textDelta('R1', 'The company '),
      textDelta('R2', 'The market '),
      textDelta('R4a', 'The founder '),
      textDelta('R1', 'builds rockets.'),
      textDelta('R2', 'is large.'),
      textDelta('R4a', 'is experienced.'),
    ];

    const feed = interleavedDeltas.reduce<FeedEvent[]>(
      (events, delta) => appendTextDeltaToFeed(events, delta, createId),
      [],
    );

    expect(feed.map((event) => [event.subcall, event.message])).toEqual([
      ['R1', 'The company builds rockets.'],
      ['R2', 'The market is large.'],
      ['R4a', 'The founder is experienced.'],
    ]);
  });

  it('does not merge text from different steps that have no subcall', () => {
    const before = [{ ...feedEvent(0, 'text:delta', undefined, 'Ingest text'), step: 'ingest' }];

    const feed = appendTextDeltaToFeed(before, textDelta(undefined, 'Dossier text'), createIdCounter());

    expect(feed).toHaveLength(2);
  });
});
