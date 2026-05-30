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
    // Dossier — cached across all score calls
    { text: `Research dossier to evaluate:\n\n${dossier}`, cache: true },
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

export async function runCriterionScore(
  dossier: string,
  rubric: RubricType,
  profile: 'A' | 'B',
  criterionNumber: number,
  emitter: PipelineEmitter,
): Promise<string> {
  const criterionId = `${profile}${criterionNumber}`;
  const shared = getRubricShared(rubric);
  const profileContent = getRubricProfile(rubric, profile);

  // Extract the specific criterion from the profile file
  const criterionDef = extractBlock(profileContent, 'criterion', criterionId);

  const systemParts: SystemPart[] = [
    // Shared rubric (Sections 1, 2, 5 — includes output format with Block 3 template) — cached
    { text: shared, cache: true },
    // Dossier — cached across all score calls
    { text: `Research dossier to evaluate:\n\n${dossier}`, cache: true },
    // Criterion-specific definition from profile file — uncached
    { text: criterionDef },
  ];

  return callOpus({
    systemParts,
    userContent: `Score criterion ${criterionId} according to the rubric. Produce the Block 3 output for this single criterion only.`,
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
    // Dossier — cached
    { text: `Research dossier to evaluate:\n\n${dossier}`, cache: true },
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
