import type { PipelineEmitter } from '../../types.js';
import type { RubricType } from '@shared/types/pipeline.js';
import { callOpus, type SystemPart } from '../../claude/client.js';
import {
  getRubricShared,
  getRubricProfile,
  extractBlock,
} from '../../prompts/loader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutingResult {
  text: string;
  profile: 'A' | 'B';
  disqualified: boolean;
}

// ---------------------------------------------------------------------------
// Shared prompt parts
// ---------------------------------------------------------------------------

/**
 * Explains that the dossier's "C1"-"C7" labels are not rubric criterion numbers.
 *
 * The dossier is rubric-agnostic and always uses the same seven evidence blocks (C4 is
 * Capital Efficiency, C6 is Moat, C7 is Exit). Rubrics number their own criteria and some
 * also write them as "C<n>" — in the defense rubric C4 is Government Access and C6 is
 * Capital Efficiency. Without this note a scorer can be sent to the wrong dossier block.
 */
export const DOSSIER_LABEL_NOTE = [
  'How to read the dossier\'s labels: the dossier groups its criterion evidence into blocks labeled C1 through C7.',
  'Those labels are the dossier\'s own evidence categories. They are NOT this rubric\'s criterion numbers, and a dossier block does not necessarily hold the evidence for the rubric criterion with the same number.',
  'When the rubric itself writes "C<n>", it means criterion <n> as the rubric defines it (A<n> or B<n>), never dossier block C<n>.',
  'Locate the evidence for a criterion by its subject matter, drawing on every dossier block that bears on it.',
].join(' ');

/**
 * Builds the dossier system part sent with every score call. The text is identical across
 * calls so that it is cached once and reused.
 */
export function buildDossierSystemPart(dossier: string): SystemPart {
  return {
    text: `${DOSSIER_LABEL_NOTE}\n\nResearch dossier to evaluate:\n\n${dossier}`,
    cache: true,
  };
}

// ---------------------------------------------------------------------------
// 1. Routing + Disqualifier Check  (Blocks 0-2)
// ---------------------------------------------------------------------------

export async function runRouting(
  dossier: string,
  rubric: RubricType,
  emitter: PipelineEmitter,
): Promise<RoutingResult> {
  const shared = getRubricShared(rubric);

  const systemParts: SystemPart[] = [
    // Shared rubric (Sections 1, 2, 5 — includes routing logic and output format) — cached
    { text: shared, cache: true },
    // Dossier (with the label note) — cached across all score calls
    buildDossierSystemPart(dossier),
    // Routing-specific parsing instructions — uncached
    { text: [
        'Produce Blocks 0, 1, and 2 from the output format above.',
        '',
        'After producing the evaluation output for Blocks 0-2, emit the following structured tag on its own line so the result can be parsed programmatically:',
        '<routing_result profile="A" disqualified="false"/>',
        'Replace the attribute values with the actual routing profile ("A" or "B") and disqualification status ("true" or "false").',
      ].join('\n') },
  ];

  const response = await callOpus({
    systemParts,
    userContent: 'Produce Blocks 0-2 (Evaluation Header, Routing Determination, Disqualifier Screen) according to the rubric. End with the <routing_result .../> tag.',
    emitter,
    step: 'score',
    subcall: 'Routing',
    maxTokens: 4096,
  });

  const tagPattern = /<routing_result\s+profile="([AB])"\s+disqualified="(true|false)"\s*\/>/;
  const match = response.match(tagPattern);

  const profile: 'A' | 'B' = match ? (match[1] as 'A' | 'B') : 'B';
  const disqualified: boolean = match ? match[2] === 'true' : false;
  const text = response.replace(tagPattern, '').trimEnd();

  return { text, profile, disqualified };
}

// ---------------------------------------------------------------------------
// 2. Per-Criterion Scoring  (Block 3, one criterion at a time)
// ---------------------------------------------------------------------------

/**
 * Finds the Profile A criterion that a Profile B criterion is written against.
 *
 * Several rubrics define Profile B criteria as deltas on their Profile A counterpart
 * ("Per A1 top-band definition...", "refer to the A1 block"). Because each criterion is
 * scored in its own call, the counterpart has to be sent along or those references
 * point at text the model never sees.
 *
 * Returns the counterpart's id (e.g. "A1" for "B1") when the definition cites it,
 * or null for Profile A criteria and for Profile B criteria that stand alone.
 */
export function findInheritedProfileACriterionId(
  criterionId: string,
  criterionDef: string,
): string | null {
  if (!criterionId.startsWith('B')) return null;

  const counterpartId = `A${criterionId.slice(1)}`;
  const citesCounterpart = new RegExp(`\\b${counterpartId}\\b`).test(criterionDef);
  return citesCounterpart ? counterpartId : null;
}

/**
 * Builds the criterion-specific system text for one scoring call: the criterion's own
 * definition, plus its Profile A counterpart as reference-only material when the
 * definition inherits from it (see findInheritedProfileACriterionId).
 */
export function buildCriterionDefinitionText(
  profileAContent: string,
  profileContent: string,
  criterionId: string,
): string {
  const criterionDef = extractBlock(profileContent, 'criterion', criterionId);
  const inheritedId = findInheritedProfileACriterionId(criterionId, criterionDef);
  if (!inheritedId) return criterionDef;

  const inheritedDef = extractBlock(profileAContent, 'criterion', inheritedId);
  return [
    criterionDef,
    '',
    `The ${criterionId} definition above cites ${inheritedId} by reference. The full ${inheritedId} definition follows as REFERENCE ONLY so the cited elements can be applied exactly as written. Do NOT score ${inheritedId}. Wherever ${criterionId} states its own point ranges, weights, or adaptations, ${criterionId} takes precedence.`,
    '',
    `<referenced_criterion_definition id="${inheritedId}">`,
    inheritedDef,
    '</referenced_criterion_definition>',
  ].join('\n');
}

/**
 * Builds the user message for one criterion scoring call.
 *
 * `dependencyScores` holds the finished Block 3 outputs of the criteria this one depends on
 * (see criterion-dependencies.ts). They are included so rules that consume another
 * criterion's result — a score-triggered cap, a classification made elsewhere — are applied
 * to the recorded result instead of a fresh guess.
 */
export function buildCriterionScoringUserContent(
  criterionId: string,
  dependencyScores: ReadonlyMap<string, string>,
): string {
  const instruction = `Score criterion ${criterionId} according to the rubric. Produce the Block 3 output for this single criterion only.`;
  if (dependencyScores.size === 0) return instruction;

  const dependencyIds = [...dependencyScores.keys()];
  const completedScores = [...dependencyScores.entries()].map(([id, scoreText]) =>
    `<completed_criterion_score id="${id}">\n${scoreText}\n</completed_criterion_score>`,
  );

  return [
    `Criterion ${criterionId} depends on the results of ${dependencyIds.join(', ')}, which have already been scored. Their completed outputs are below.`,
    '',
    ...completedScores,
    '',
    `Wherever the ${criterionId} rules refer to the score, band, or classification of ${dependencyIds.join(' or ')}, use exactly what is recorded above. Do NOT re-score or revise those criteria.`,
    '',
    instruction,
  ].join('\n');
}

export async function runCriterionScore(
  dossier: string,
  rubric: RubricType,
  criterionId: string,
  dependencyScores: ReadonlyMap<string, string>,
  emitter: PipelineEmitter,
): Promise<string> {
  const profile = criterionId.startsWith('A') ? 'A' : 'B';
  const shared = getRubricShared(rubric);

  const criterionDefinitionText = buildCriterionDefinitionText(
    getRubricProfile(rubric, 'A'),
    getRubricProfile(rubric, profile),
    criterionId,
  );

  const systemParts: SystemPart[] = [
    // Shared rubric (Sections 1, 2, 5 — includes output format with Block 3 template) — cached
    { text: shared, cache: true },
    // Dossier (with the label note) — cached across all score calls
    buildDossierSystemPart(dossier),
    // Criterion definition (plus any Profile A definition it inherits from) — uncached
    { text: criterionDefinitionText },
  ];

  return callOpus({
    systemParts,
    userContent: buildCriterionScoringUserContent(criterionId, dependencyScores),
    emitter,
    step: 'score',
    subcall: criterionId,
    maxTokens: 4096,
  });
}

// ---------------------------------------------------------------------------
// 3. Score Assembly  (Blocks 4-6)
// ---------------------------------------------------------------------------

export async function runScoreAssembly(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  routingText: string,
  criterionScores: string[],
  emitter: PipelineEmitter,
): Promise<string> {
  const shared = getRubricShared(rubric);

  const systemParts: SystemPart[] = [
    // Shared rubric (Sections 1, 2, 5 — includes Blocks 4-6 output format) — cached
    { text: shared, cache: true },
    // Dossier (with the label note) — cached across all score calls
    buildDossierSystemPart(dossier),
    // Assembly instructions — uncached
    { text: 'Produce Blocks 4 (Total Score / Tier), 5 (Qualitative Assessment), and 6 (Footer) from the output format above.' },
  ];

  const userContent = `Here are the completed scoring outputs so far:

<routing_and_disqualifier>
${routingText}
</routing_and_disqualifier>

<criterion_scores>
${criterionScores.join('\n\n')}
</criterion_scores>

The routing assigned profile ${profile}. Using all of the above, produce Blocks 4-6 (Total Score / Tier, Qualitative Assessment, Footer) according to the rubric.`;

  return callOpus({
    systemParts,
    userContent,
    emitter,
    step: 'score',
    subcall: 'Assembly',
    maxTokens: 8192,
  });
}
