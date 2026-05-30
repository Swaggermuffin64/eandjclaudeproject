import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
import { runRouting, runCriterionScore, runScoreAssembly } from './sub-steps.js';

function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`[score] ▶ ${label}`);
  return fn().then(result => {
    console.log(`[score] ✓ ${label} (${((Date.now() - start) / 1000).toFixed(1)}s)`);
    return result;
  });
}

// ---------------------------------------------------------------------------
// Score Orchestrator
// ---------------------------------------------------------------------------

export async function runScore(
  input: ScoreInput,
  emitter: PipelineEmitter,
): Promise<ScoreOutput> {
  const { dossier, rubric } = input;

  // Phase 1: Routing + Disqualifier Screen (Blocks 0-2)
  emitSubcallStart(emitter, 'score', 'Routing');
  const routing = await timed('Routing', () => runRouting(dossier, rubric, emitter));
  emitSubcallComplete(emitter, 'score', 'Routing');

  // Early exit if disqualified
  if (routing.disqualified) {
    const abbreviatedBlocks = [
      'Block 3 (Criterion Scoring): N/A — Disqualified',
      'Block 4 (Total Score and Tier): N/A — Disqualified',
      'Block 5 (Qualitative Assessment): N/A — Disqualified',
    ].join('\n\n');

    // Still produce footer (Block 6) via assembly
    emitSubcallStart(emitter, 'score', 'Assembly');
    const assembly = await runScoreAssembly(
      dossier,
      rubric,
      routing.profile,
      routing.text,
      [],
      emitter,
    );
    emitSubcallComplete(emitter, 'score', 'Assembly');

    const score = [routing.text, abbreviatedBlocks, assembly].join('\n\n');
    return { score };
  }

  // Phase 2: Score all 7 criteria in parallel
  [1, 2, 3, 4, 5, 6, 7].forEach((n) => emitSubcallStart(emitter, 'score', `${routing.profile}${n}`));
  const criterionScores = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7].map((n) =>
      timed(`${routing.profile}${n}`, () => runCriterionScore(dossier, rubric, routing.profile, n, emitter))
        .then(r => { emitSubcallComplete(emitter, 'score', `${routing.profile}${n}`); return r; }),
    ),
  );

  // Phase 3: Assembly (Blocks 4-6)
  emitSubcallStart(emitter, 'score', 'Assembly');
  const assembly = await timed('Assembly', () => runScoreAssembly(
    dossier,
    rubric,
    routing.profile,
    routing.text,
    criterionScores,
    emitter,
  ));
  emitSubcallComplete(emitter, 'score', 'Assembly');

  const score = [routing.text, ...criterionScores, assembly].join('\n\n');
  return { score };
}
