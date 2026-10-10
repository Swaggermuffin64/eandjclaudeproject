import type { RubricType } from '@shared/types/pipeline.js';
import type { DependentTask } from '../../dependency-scheduler.js';

export type RubricProfile = 'A' | 'B';

const CRITERION_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Criteria whose scoring rules consume another criterion's finished result.
 *
 * Each criterion is scored in its own Claude call. Most are independent, but a few rules
 * read a sibling's outcome. Those criteria must wait for the sibling and be handed its
 * output; scored in parallel they could only guess at it.
 *
 * Two kinds of rule create a dependency:
 *  - Operational Viability Condition: the sector/market criterion is capped when two anchor
 *    criteria both land in their lowest band, and must quote the anchors' scores either way.
 *  - AI Modifier classification (technology only): the moat and exit criteria apply rules
 *    keyed to the AI tier that the market criterion assigns.
 *
 * Only list a criterion here when it needs a sibling's RESULT. References that merely
 * point at a sibling's wording or at a Block 2 disqualifier are not dependencies.
 * A criterion that is absent from a rubric's map has no dependencies.
 */
const CRITERION_RESULT_DEPENDENCIES: Record<RubricType, Record<string, readonly string[]>> = {
  'life-sciences': {
    A3: ['A2', 'A4'], // Operational Viability Condition
    B3: ['B2', 'B5'], // Operational Viability Condition
  },
  technology: {
    A2: ['A1', 'A3'], // Operational Viability Condition
    A6: ['A2'], // AI wrapper force-test integrates with the A2 AI Modifier classification
    A7: ['A2'], // reverse-acqui-hire exit pattern applies per the A2 AI Modifier
    B2: ['B1', 'B3'], // Operational Viability Condition
    B6: ['B2'], // same force-test integration as A6, against the B2 classification
    B7: ['B2'], // same exit-pattern rule as A7, against the B2 classification
  },
  defense: {
    A2: ['A1', 'A3'], // Operational Viability Condition
    B2: ['B1', 'B3'], // Operational Viability Condition
  },
};

/** Returns the ids of the criteria whose results the given criterion needs before scoring. */
export function getCriterionResultDependencies(
  rubric: RubricType,
  criterionId: string,
): readonly string[] {
  return CRITERION_RESULT_DEPENDENCIES[rubric][criterionId] ?? [];
}

/**
 * Returns the seven criterion scoring tasks for a profile, in criterion order, each with
 * the criteria it must wait for. Ready to hand to runTasksInDependencyOrder.
 */
export function getCriterionScoringTasks(
  rubric: RubricType,
  profile: RubricProfile,
): DependentTask[] {
  return CRITERION_NUMBERS.map((criterionNumber) => {
    const criterionId = `${profile}${criterionNumber}`;
    return { id: criterionId, dependsOn: getCriterionResultDependencies(rubric, criterionId) };
  });
}
