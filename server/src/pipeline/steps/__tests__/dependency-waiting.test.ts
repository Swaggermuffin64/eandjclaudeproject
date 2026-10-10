import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';

// End-to-end tests that the dossier and score steps make each Claude call only after the
// calls it depends on have finished, and hand it their output. The Claude client is mocked:
// every call returns a recognizable marker, and records what had finished when it started.

interface RecordedCall {
  subcall: string;
  userContent: string;
  /** Subcalls that had already returned when this call started. */
  finishedBefore: string[];
}

const recordedCalls: RecordedCall[] = [];
const finishedSubcalls: string[] = [];
let routingResponse = '';

/** The text a mocked call returns, unique per subcall so it can be found in later prompts. */
const outputOf = (subcall: string) => `<<output of ${subcall}>>`;

const callOpusMock = jest.fn(async (options: { subcall?: string; userContent: unknown }) => {
  const subcall = options.subcall ?? 'unknown';
  recordedCalls.push({
    subcall,
    userContent: String(options.userContent),
    finishedBefore: [...finishedSubcalls],
  });

  // Finish on a later tick so calls that are allowed to run in parallel really overlap.
  await new Promise((resolve) => setImmediate(resolve));

  finishedSubcalls.push(subcall);
  return subcall === 'Routing' ? routingResponse : outputOf(subcall);
});

jest.unstable_mockModule('../../claude/client.js', () => ({
  callOpus: callOpusMock,
  callSonnet: callOpusMock,
}));

const { runDossier } = await import('../dossier/index.js');
const { DOSSIER_BLOCKS, DOSSIER_ASSEMBLY_ORDER } = await import('../dossier/blocks.js');
const { runScore } = await import('../score/index.js');
const { getCriterionScoringTasks } = await import('../score/criterion-dependencies.js');

function callFor(subcall: string): RecordedCall {
  const call = recordedCalls.find((recorded) => recorded.subcall === subcall);
  if (!call) throw new Error(`no Claude call was made for ${subcall}`);
  return call;
}

/** Collects the subcall start/complete events a step emits, in order. */
function recordSubcallEvents(emitter: EventEmitter): string[] {
  const events: string[] = [];
  emitter.on('pipeline-event', (event: { type: string; subcall?: string }) => {
    if (event.type === 'subcall:start' || event.type === 'subcall:complete') {
      events.push(`${event.type} ${event.subcall}`);
    }
  });
  return events;
}

beforeEach(() => {
  recordedCalls.length = 0;
  finishedSubcalls.length = 0;
  callOpusMock.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Dossier step
// ---------------------------------------------------------------------------

describe('dossier block dependency table', () => {
  const dependenciesOf = (blockId: string) =>
    DOSSIER_BLOCKS.find((block) => block.id === blockId)!.dependsOn;

  it('gives every block after R0 the research plan', () => {
    for (const block of DOSSIER_BLOCKS) {
      if (block.id === 'R0') continue;
      expect(block.dependsOn).toContain('R0');
    }
  });

  // Regression: these blocks are told by the template to use another block's findings,
  // but were previously started without that block in their context.
  it.each([
    ['C7', 'C2', 'the AI tier classification that selects the exit pattern'],
    ['C7', 'R2', 'the development stage note behind the exit timeline baseline'],
    ['C2', 'R4a', 'founder research-lab pedigree used by the AI tier classification'],
    ['C4', 'R1', 'headcount'],
    ['R3', 'R1', 'the legal entity that court and registry searches run under'],
    ['R5', 'R1', 'the legal entity that cross-validation searches run under'],
  ])('%s depends on %s (%s)', (blockId, dependencyId) => {
    expect(dependenciesOf(blockId)).toContain(dependencyId);
  });

  it('keeps the dependencies the earlier fixed phases already honored', () => {
    expect(dependenciesOf('R3')).toContain('R4a');
    expect(dependenciesOf('C1')).toContain('R4a');
    expect(dependenciesOf('C3')).toContain('R3');
    expect(dependenciesOf('C4')).toContain('R2');
    expect(dependenciesOf('C5')).toEqual(expect.arrayContaining(['R2', 'R3']));
    expect(dependenciesOf('C6')).toEqual(expect.arrayContaining(['R4a', 'C2']));
  });

  it('gives cross-validation every criterion block and the final assembly every other block', () => {
    expect(dependenciesOf('R5')).toEqual(
      expect.arrayContaining(['R3', 'R4a', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7']),
    );
    const everyOtherBlock = DOSSIER_BLOCKS.map((block) => block.id).filter((id) => id !== 'R6-R8');
    expect([...dependenciesOf('R6-R8')].sort()).toEqual([...everyOtherBlock].sort());
  });

  it('assembles every block exactly once', () => {
    expect([...DOSSIER_ASSEMBLY_ORDER].sort()).toEqual(DOSSIER_BLOCKS.map((block) => block.id).sort());
  });
});

describe('runDossier', () => {
  it('starts each block only after every block it depends on has finished', async () => {
    await runDossier({ filledTemplate: 'TEMPLATE' }, new EventEmitter());

    for (const block of DOSSIER_BLOCKS) {
      expect(callFor(block.id).finishedBefore).toEqual(expect.arrayContaining([...block.dependsOn]));
    }
  });

  it('gives each block the output of every block it depends on, and nothing else', async () => {
    await runDossier({ filledTemplate: 'TEMPLATE' }, new EventEmitter());

    for (const block of DOSSIER_BLOCKS) {
      const { userContent } = callFor(block.id);
      for (const other of DOSSIER_BLOCKS) {
        const shouldBePresent = block.dependsOn.includes(other.id);
        expect([block.id, other.id, userContent.includes(outputOf(other.id))]).toEqual([
          block.id,
          other.id,
          shouldBePresent,
        ]);
      }
    }
  });

  it('runs blocks with the same dependencies in parallel', async () => {
    await runDossier({ filledTemplate: 'TEMPLATE' }, new EventEmitter());

    // R1, R2 and R4a all depend only on R0, so none of them waits for another.
    for (const blockId of ['R1', 'R2', 'R4a']) {
      expect(callFor(blockId).finishedBefore).toEqual(['R0']);
    }
  });

  it('makes one call per block and assembles the dossier in template order', async () => {
    const { dossier } = await runDossier({ filledTemplate: 'TEMPLATE' }, new EventEmitter());

    expect(callOpusMock).toHaveBeenCalledTimes(DOSSIER_BLOCKS.length);
    expect(dossier).toBe(DOSSIER_ASSEMBLY_ORDER.map(outputOf).join('\n\n'));
  });

  it('reports a block as started only when its call actually begins', async () => {
    const emitter = new EventEmitter();
    const events = recordSubcallEvents(emitter);

    await runDossier({ filledTemplate: 'TEMPLATE' }, emitter);

    expect(events.indexOf('subcall:start C7')).toBeGreaterThan(events.indexOf('subcall:complete C2'));
    expect(events.indexOf('subcall:start R6-R8')).toBeGreaterThan(events.indexOf('subcall:complete R5'));
    expect(events.filter((event) => event.startsWith('subcall:start'))).toHaveLength(DOSSIER_BLOCKS.length);
    expect(events.filter((event) => event.startsWith('subcall:complete'))).toHaveLength(DOSSIER_BLOCKS.length);
  });
});

// ---------------------------------------------------------------------------
// Score step
// ---------------------------------------------------------------------------

describe('runScore', () => {
  const RUBRIC_PROFILES = (['life-sciences', 'technology', 'defense'] as const).flatMap((rubric) =>
    (['A', 'B'] as const).map((profile) => [rubric, profile] as const),
  );

  it.each(RUBRIC_PROFILES)(
    '%s profile %s: each criterion waits for, and receives, the criteria it depends on',
    async (rubric, profile) => {
      routingResponse = `Blocks 0-2\n<routing_result profile="${profile}" disqualified="false"/>`;

      await runScore({ dossier: 'DOSSIER', rubric }, new EventEmitter());

      for (const task of getCriterionScoringTasks(rubric, profile)) {
        const call = callFor(task.id);
        expect(call.finishedBefore).toEqual(expect.arrayContaining([...task.dependsOn]));
        for (const dependencyId of task.dependsOn) {
          expect(call.userContent).toContain(outputOf(dependencyId));
        }
      }
    },
  );

  it('does not hand a criterion the scores of criteria it does not depend on', async () => {
    routingResponse = 'Blocks 0-2\n<routing_result profile="A" disqualified="false"/>';

    await runScore({ dossier: 'DOSSIER', rubric: 'technology' }, new EventEmitter());

    expect(callFor('A1').userContent).not.toContain('<<output of');
    expect(callFor('A6').userContent).toContain(outputOf('A2'));
    expect(callFor('A6').userContent).not.toContain(outputOf('A1'));
  });

  it('scores independent criteria in parallel, without waiting on each other', async () => {
    routingResponse = 'Blocks 0-2\n<routing_result profile="A" disqualified="false"/>';

    await runScore({ dossier: 'DOSSIER', rubric: 'defense' }, new EventEmitter());

    // Defense A1 and A3-A7 have no dependencies: only Routing has finished when they start.
    for (const criterionId of ['A1', 'A3', 'A4', 'A5', 'A6', 'A7']) {
      expect(callFor(criterionId).finishedBefore).toEqual(['Routing']);
    }
  });

  it('assembles the criterion scores in criterion order regardless of finishing order', async () => {
    routingResponse = 'Blocks 0-2\n<routing_result profile="A" disqualified="false"/>';

    const { score } = await runScore({ dossier: 'DOSSIER', rubric: 'technology' }, new EventEmitter());

    const expectedOrder = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'].map(outputOf).join('\n\n');
    expect(score).toContain(expectedOrder);
    expect(callFor('Assembly').userContent).toContain(expectedOrder);
    expect(callFor('Assembly').finishedBefore).toEqual(
      expect.arrayContaining(['Routing', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7']),
    );
  });

  it('skips criterion scoring entirely when routing disqualifies the company', async () => {
    routingResponse = 'Blocks 0-2\n<routing_result profile="B" disqualified="true"/>';

    await runScore({ dossier: 'DOSSIER', rubric: 'defense' }, new EventEmitter());

    expect(recordedCalls.map((call) => call.subcall)).toEqual(['Routing', 'Assembly']);
  });
});
