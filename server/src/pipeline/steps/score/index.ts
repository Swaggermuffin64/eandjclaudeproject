import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../../types.js';
import { emitTextDelta } from '../../types.js';
import { runRouting, runCriterionScore, runScoreAssembly } from './sub-steps.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emitPhase(emitter: PipelineEmitter, label: string): void {
  emitTextDelta(emitter, 'score', `\n\n========== ${label} ==========\n\n`);
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
  emitPhase(emitter, 'Phase 1: Routing + Disqualifier Screen');
  const routing = await runRouting(dossier, rubric, emitter);

  // Early exit if disqualified
  if (routing.disqualified) {
    emitPhase(emitter, 'Disqualified — Skipping Criteria');

    const abbreviatedBlocks = [
      'Block 3 (Criterion Scoring): N/A — Disqualified',
      'Block 4 (Total Score and Tier): N/A — Disqualified',
      'Block 5 (Qualitative Assessment): N/A — Disqualified',
    ].join('\n\n');

    // Still produce footer (Block 6) via assembly
    const assembly = await runScoreAssembly(
      dossier,
      rubric,
      routing.profile,
      routing.text,
      [],
      emitter,
    );

    const score = [routing.text, abbreviatedBlocks, assembly].join('\n\n');
    return { score };
  }

  // Phase 2: Score all 7 criteria in parallel
  emitPhase(emitter, 'Phase 2: Scoring Criteria 1-7');
  const criterionScores = await Promise.all(
    [1, 2, 3, 4, 5, 6, 7].map((n) =>
      runCriterionScore(dossier, rubric, routing.profile, n, emitter),
    ),
  );

  // Phase 3: Assembly (Blocks 4-6)
  emitPhase(emitter, 'Phase 3: Assembly');
  const assembly = await runScoreAssembly(
    dossier,
    rubric,
    routing.profile,
    routing.text,
    criterionScores,
    emitter,
  );

  const score = [routing.text, ...criterionScores, assembly].join('\n\n');
  return { score };
}
