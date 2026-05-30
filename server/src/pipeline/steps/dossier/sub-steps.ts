import type Anthropic from '@anthropic-ai/sdk';
import type { PipelineEmitter } from '../../types.js';
import { callOpus } from '../../claude/client.js';
import {
  getDossierPreambleMinimal,
  getDossierPreambleResearch,
  getDossierPreambleRouting,
  getDossierOutputBlock,
  getDossierSubBlock,
  getDossierDisqualifierSchema,
} from '../../prompts/loader.js';

// ---------------------------------------------------------------------------
// Module-level cached preambles — tailored per sub-step type to reduce tokens
// ---------------------------------------------------------------------------

/** Section 1 only (role + prohibited outputs). For R0, R6-R8. */
const PREAMBLE_MINIMAL = getDossierPreambleMinimal();

/** Sections 1-3 (role + classification tags + scarcity rules). For research blocks. */
const PREAMBLE_RESEARCH = getDossierPreambleResearch();

/** Sections 1-4 (research + routing ambiguity protocol). For R2 only. */
const PREAMBLE_ROUTING = getDossierPreambleRouting();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWebSearchTool(maxUses: number): Anthropic.Tool {
  return {
    type: 'web_search_20250305' as const,
    name: 'web_search',
    max_uses: maxUses,
  } as unknown as Anthropic.Tool;
}

/**
 * Shared helper for criterion sub-blocks (C1-C7).
 * Each criterion call follows the same shape: system prompt built from the
 * preamble + the sub-block definition, user content that includes operator
 * inputs and any prior block outputs needed as context.
 */
async function runCriterionBlock(options: {
  subBlockId: string;
  label: string;
  filledTemplate: string;
  priorContext: string;
  emitter: PipelineEmitter;
  tools?: Anthropic.Tool[];
  maxTokens: number;
}): Promise<string> {
  const { subBlockId, label, filledTemplate, priorContext, emitter, tools, maxTokens } = options;
  const blockDef = getDossierSubBlock(subBlockId);

  const systemPrompt = `${PREAMBLE_RESEARCH}

You are producing ONLY Sub-Block ${subBlockId} (${label}) of the research dossier.

${blockDef}

Produce ${subBlockId} in full. Do NOT produce any other blocks.`;

  const userContent = priorContext
    ? `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${priorContext}\n\nProduce Sub-Block ${subBlockId} only.`
    : `Operator inputs:\n\n${filledTemplate}\n\nProduce Sub-Block ${subBlockId} only.`;

  return callOpus({
    systemPrompt,
    userContent,
    emitter,
    step: 'dossier',
    ...(tools && tools.length > 0 ? { tools } : {}),
    maxTokens,
  });
}

// ---------------------------------------------------------------------------
// R0 - Research Plan
// ---------------------------------------------------------------------------

export async function runR0(
  filledTemplate: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R0');

  const systemPrompt = `${PREAMBLE_MINIMAL}

You are producing ONLY Block R0 (Research Plan) of the research dossier.

${blockDef}

Produce R0 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nProduce Block R0 only.`,
    emitter,
    step: 'dossier',
    maxTokens: 4096,
  });
}

// ---------------------------------------------------------------------------
// R1 - Entity Identification
// ---------------------------------------------------------------------------

export async function runR1(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R1');

  const systemPrompt = `${PREAMBLE_RESEARCH}

You are producing ONLY Block R1 (Entity Identification) of the research dossier.

${blockDef}

Produce R1 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${r0}\n\nProduce Block R1 only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(10)],
    maxTokens: 4096,
  });
}

// ---------------------------------------------------------------------------
// R2 - Capital Position
// ---------------------------------------------------------------------------

export async function runR2(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R2');

  const systemPrompt = `${PREAMBLE_ROUTING}

You are producing ONLY Block R2 (Capital Position) of the research dossier.

${blockDef}

Produce R2 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${r0}\n\nProduce Block R2 only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// R4a - Per-Founder Profiles (most research-intensive)
// ---------------------------------------------------------------------------

export async function runR4a(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R4a');

  const systemPrompt = `${PREAMBLE_RESEARCH}

You are producing ONLY Block R4a (Per-Founder Profiles) of the research dossier.

${blockDef}

Produce R4a in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${r0}\n\nProduce Block R4a only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(30)],
    maxTokens: 16384,
  });
}

// ---------------------------------------------------------------------------
// R3 - Disqualifier Screen (depends on R4a for identity-dependent DQs)
// ---------------------------------------------------------------------------

export async function runR3(
  filledTemplate: string,
  r0: string,
  r4a: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R3');
  const disqualifierSchema = getDossierDisqualifierSchema();

  const systemPrompt = `${PREAMBLE_RESEARCH}

You are producing ONLY Block R3 (Disqualifier Screen) of the research dossier.

${blockDef}

Reference the disqualifier schema below when evaluating disqualifiers:

${disqualifierSchema}

Produce R3 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${r0}\n\n${r4a}\n\nProduce Block R3 only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(20)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C1 - Team Quality (no web search; evidence comes from R4a)
// ---------------------------------------------------------------------------

export async function runC1(
  filledTemplate: string,
  r4a: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C1',
    label: 'Team Quality',
    filledTemplate,
    priorContext: r4a,
    emitter,
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C2 - Market Opportunity (runs 5 force tests)
// ---------------------------------------------------------------------------

export async function runC2(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C2',
    label: 'Market Opportunity',
    filledTemplate,
    priorContext: r0,
    emitter,
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C3 - Product / Traction
// ---------------------------------------------------------------------------

export async function runC3(
  filledTemplate: string,
  r3: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C3',
    label: 'Product/Traction',
    filledTemplate,
    priorContext: r3,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C4 - Capital Efficiency
// ---------------------------------------------------------------------------

export async function runC4(
  filledTemplate: string,
  r2: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C4',
    label: 'Capital Efficiency',
    filledTemplate,
    priorContext: r2,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C5 - Cap Table
// ---------------------------------------------------------------------------

export async function runC5(
  filledTemplate: string,
  r2: string,
  r3: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C5',
    label: 'Cap Table',
    filledTemplate,
    priorContext: `${r2}\n\n${r3}`,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C6 - Competitive Moat (needs R4a + C2 force test results)
// ---------------------------------------------------------------------------

export async function runC6(
  filledTemplate: string,
  r4a: string,
  c2: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C6',
    label: 'Competitive Moat',
    filledTemplate,
    priorContext: `${r4a}\n\n${c2}`,
    emitter,
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// C7 - Exit Pathway
// ---------------------------------------------------------------------------

export async function runC7(
  filledTemplate: string,
  r0: string,
  emitter: PipelineEmitter,
): Promise<string> {
  return runCriterionBlock({
    subBlockId: 'C7',
    label: 'Exit Pathway',
    filledTemplate,
    priorContext: r0,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// R5 - Cross-Validation
// ---------------------------------------------------------------------------

export async function runR5(
  filledTemplate: string,
  r3: string,
  r4a: string,
  r4b: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const blockDef = getDossierOutputBlock('R5');

  const systemPrompt = `${PREAMBLE_RESEARCH}

You are producing ONLY Block R5 (Cross-Validation) of the research dossier.

${blockDef}

Produce R5 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nPrior research context:\n\n${r3}\n\n${r4a}\n\n${r4b}\n\nProduce Block R5 only.`,
    emitter,
    step: 'dossier',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
}

// ---------------------------------------------------------------------------
// R6 + R7 + R8 - Assembly, Completion Gate & Handoff
// ---------------------------------------------------------------------------

export async function runR6R7R8(
  filledTemplate: string,
  allPriorBlocks: string,
  emitter: PipelineEmitter,
): Promise<string> {
  const r6Def = getDossierOutputBlock('R6');
  const r7Def = getDossierOutputBlock('R7');
  const r8Def = getDossierOutputBlock('R8');

  const systemPrompt = `${PREAMBLE_MINIMAL}

You are producing Blocks R6 (Assembly), R7 (Completion Gate), and R8 (Handoff) of the research dossier.

${r6Def}

${r7Def}

${r8Def}

Produce R6, R7, and R8 in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemPrompt,
    userContent: `Operator inputs:\n\n${filledTemplate}\n\nAll prior dossier blocks:\n\n${allPriorBlocks}\n\nProduce Blocks R6, R7, and R8.`,
    emitter,
    step: 'dossier',
    maxTokens: 16384,
  });
}
