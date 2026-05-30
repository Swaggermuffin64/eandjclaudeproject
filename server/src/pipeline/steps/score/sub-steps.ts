import type { PipelineEmitter } from '../../types.js';
import type { RubricType } from '@shared/types/pipeline.js';
import { callOpus } from '../../claude/client.js';
import {
  getRubricSection,
  getRubricCriterion,
  getRubricOutputBlock,
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
// 1. Routing + Disqualifier Check  (Blocks 0-2)
// ---------------------------------------------------------------------------

/**
 * Scores Blocks 0-2: Evaluation Header, Routing Determination, and
 * Disqualifier Screen. Returns the generated text along with the extracted
 * routing profile and disqualification status.
 */
export async function runRouting(
  dossier: string,
  rubric: RubricType,
  emitter: PipelineEmitter,
): Promise<RoutingResult> {
  const systemPrompt = [
    getRubricSection(rubric, '1'),
    getRubricSection(rubric, '2'),
    getRubricOutputBlock(rubric, '0'),
    getRubricOutputBlock(rubric, '1'),
    getRubricOutputBlock(rubric, '2'),
    '',
    'After producing the evaluation output for Blocks 0-2, emit the following structured tag on its own line so the result can be parsed programmatically:',
    '<routing_result profile="A" disqualified="false"/>',
    'Replace the attribute values with the actual routing profile ("A" or "B") and disqualification status ("true" or "false").',
  ].join('\n\n');

  const userContent = `Here is the completed research dossier to evaluate:

<research_dossier>
${dossier}
</research_dossier>

Produce Blocks 0-2 (Evaluation Header, Routing Determination, Disqualifier Screen) according to the rubric. End with the <routing_result .../> tag.`;

  const response = await callOpus({
    systemPrompt,
    userContent,
    emitter,
    step: 'score',
    maxTokens: 4096,
  });

  // Parse the structured routing tag from the response
  const tagPattern = /<routing_result\s+profile="([AB])"\s+disqualified="(true|false)"\s*\/>/;
  const match = response.match(tagPattern);

  const profile: 'A' | 'B' = match ? (match[1] as 'A' | 'B') : 'B';
  const disqualified: boolean = match ? match[2] === 'true' : false;

  // Remove the tag from the output text
  const text = response.replace(tagPattern, '').trimEnd();

  return { text, profile, disqualified };
}

// ---------------------------------------------------------------------------
// 2. Per-Criterion Scoring  (Block 3, one criterion at a time)
// ---------------------------------------------------------------------------

/**
 * Scores a single criterion (e.g. A1, B3) and returns the Block 3 text for
 * that criterion. Designed to be called in parallel for all 7 criteria.
 */
export async function runCriterionScore(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  criterionNumber: number,
  emitter: PipelineEmitter,
): Promise<string> {
  const criterionId = `${profile}${criterionNumber}`;

  const systemPrompt = [
    getRubricSection(rubric, '1'),
    getRubricCriterion(rubric, criterionId),
    getRubricOutputBlock(rubric, '3'),
  ].join('\n\n');

  const userContent = `Here is the completed research dossier to evaluate:

<research_dossier>
${dossier}
</research_dossier>

Score criterion ${criterionId} according to the rubric. Produce the Block 3 output for this single criterion only.`;

  return callOpus({
    systemPrompt,
    userContent,
    emitter,
    step: 'score',
    maxTokens: 4096,
  });
}

// ---------------------------------------------------------------------------
// 3. Score Assembly  (Blocks 4-6)
// ---------------------------------------------------------------------------

/**
 * Assembles the final scoring output: Total Score / Tier (Block 4),
 * Qualitative Assessment (Block 5), and Footer (Block 6). Receives the
 * routing text and all criterion scores as context.
 */
export async function runScoreAssembly(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  routingText: string,
  criterionScores: string[],
  emitter: PipelineEmitter,
): Promise<string> {
  const systemPrompt = [
    getRubricSection(rubric, '1'),
    getRubricOutputBlock(rubric, '4'),
    getRubricOutputBlock(rubric, '5'),
    getRubricOutputBlock(rubric, '6'),
  ].join('\n\n');

  const userContent = `Here is the completed research dossier:

<research_dossier>
${dossier}
</research_dossier>

Here are the completed scoring outputs so far:

<routing_and_disqualifier>
${routingText}
</routing_and_disqualifier>

<criterion_scores>
${criterionScores.join('\n\n')}
</criterion_scores>

The routing assigned profile ${profile}. Using all of the above, produce Blocks 4-6 (Total Score / Tier, Qualitative Assessment, Footer) according to the rubric.`;

  return callOpus({
    systemPrompt,
    userContent,
    emitter,
    step: 'score',
    maxTokens: 8192,
  });
}
