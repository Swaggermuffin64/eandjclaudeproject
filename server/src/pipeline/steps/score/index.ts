import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../../types.js';
import { emitSubcallStart, emitSubcallComplete } from '../../types.js';
import { runTasksInDependencyOrder } from '../../dependency-scheduler.js';
import { getCriterionScoringTasks } from './criterion-dependencies.js';
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

/**
 * Scores a dossier against a rubric: routing and disqualifier screen first, then the seven
 * criteria of the assigned profile, then the total, tier and qualitative assessment.
 */
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

  // Phase 2: Score all 7 criteria. Independent criteria run in parallel; a criterion that
  // consumes another's result waits for it and is given its output.
  const scoresByCriterion = await runTasksInDependencyOrder(
    getCriterionScoringTasks(rubric, routing.profile),
    async (criterion, dependencyScores: ReadonlyMap<string, string>): Promise<string> => {
      emitSubcallStart(emitter, 'score', criterion.id);
      const criterionScore = await timed(criterion.id, () =>
        runCriterionScore(dossier, rubric, criterion.id, dependencyScores, emitter),
      );
      emitSubcallComplete(emitter, 'score', criterion.id);
      return criterionScore;
    },
  );
  const criterionScores = [...scoresByCriterion.values()];

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
