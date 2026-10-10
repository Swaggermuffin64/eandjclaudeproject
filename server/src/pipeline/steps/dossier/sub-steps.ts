import type Anthropic from '@anthropic-ai/sdk';
import type { PipelineEmitter } from '../../types.js';
import { callOpus, type SystemPart } from '../../claude/client.js';
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

const PREAMBLE_MINIMAL = getDossierPreambleMinimal();
const PREAMBLE_RESEARCH = getDossierPreambleResearch();
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

/** Build cacheable system parts: preamble (cached) + operator inputs (cached) + instructions (uncached). */
function buildSystemParts(preamble: string, filledTemplate: string, instructions: string): SystemPart[] {
  return [
    { text: preamble, cache: true },
    { text: `Operator inputs:\n\n${filledTemplate}`, cache: true },
    { text: instructions },
  ];
}

/**
 * Signature shared by every dossier block runner, so the orchestrator can schedule them
 * from one dependency table. `priorContext` is the finished text of the blocks this block
 * depends on (see DOSSIER_BLOCKS in blocks.ts), already joined in dependency order.
 */
export type DossierBlockRunner = (
  filledTemplate: string,
  priorContext: string,
  emitter: PipelineEmitter,
) => Promise<string>;

/** Builds the user message: the prior blocks this block builds on, then the instruction. */
function buildUserContent(priorContext: string, instruction: string): string {
  return priorContext
    ? `Prior research context:\n\n${priorContext}\n\n${instruction}`
    : instruction;
}

/**
 * Shared helper for criterion sub-blocks (C1-C7).
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

  const instructions = `You are producing ONLY Sub-Block ${subBlockId} (${label}) of the research dossier.

${blockDef}

Produce ${subBlockId} in full. Do NOT produce any other blocks.`;

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate, instructions),
    userContent: buildUserContent(priorContext, `Produce Sub-Block ${subBlockId} only.`),
    emitter,
    step: 'dossier',
    subcall: subBlockId,
    ...(tools && tools.length > 0 ? { tools } : {}),
    maxTokens,
  });
}

// ---------------------------------------------------------------------------
// R0 - Research Plan
// ---------------------------------------------------------------------------

export const runR0: DossierBlockRunner = async (filledTemplate, _priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R0');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_MINIMAL, filledTemplate,
      `You are producing ONLY Block R0 (Research Plan) of the research dossier.

${blockDef}

Produce R0 in full. Do NOT produce any other blocks.`),
    userContent: 'Produce Block R0 only.',
    emitter,
    step: 'dossier',
    subcall: 'R0',
    maxTokens: 4096,
  });
};

// ---------------------------------------------------------------------------
// R1 - Entity Identification
// ---------------------------------------------------------------------------

export const runR1: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R1');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R1 (Entity Identification) of the research dossier.

${blockDef}

Produce R1 in full. Do NOT produce any other blocks.`),
    userContent: buildUserContent(priorContext, 'Produce Block R1 only.'),
    emitter,
    step: 'dossier',
    subcall: 'R1',
    tools: [makeWebSearchTool(10)],
    maxTokens: 4096,
  });
};

// ---------------------------------------------------------------------------
// R2 - Capital Position
// ---------------------------------------------------------------------------

export const runR2: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R2');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_ROUTING, filledTemplate,
      `You are producing ONLY Block R2 (Capital Position) of the research dossier.

${blockDef}

Produce R2 in full. Do NOT produce any other blocks.`),
    userContent: buildUserContent(priorContext, 'Produce Block R2 only.'),
    emitter,
    step: 'dossier',
    subcall: 'R2',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// R4a - Per-Founder Profiles (most research-intensive)
// ---------------------------------------------------------------------------

export const runR4a: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R4a');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R4a (Per-Founder Profiles) of the research dossier.

${blockDef}

Produce R4a in full. Do NOT produce any other blocks.`),
    userContent: buildUserContent(priorContext, 'Produce Block R4a only.'),
    emitter,
    step: 'dossier',
    subcall: 'R4a',
    tools: [makeWebSearchTool(30)],
    maxTokens: 16384,
  });
};

// ---------------------------------------------------------------------------
// R3 - Disqualifier Screen (depends on R4a for identity-dependent DQs)
// ---------------------------------------------------------------------------

export const runR3: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R3');
  const disqualifierSchema = getDossierDisqualifierSchema();

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R3 (Disqualifier Screen) of the research dossier.

${blockDef}

Reference the disqualifier schema below when evaluating disqualifiers:

${disqualifierSchema}

Produce R3 in full. Do NOT produce any other blocks.`),
    userContent: buildUserContent(priorContext, 'Produce Block R3 only.'),
    emitter,
    step: 'dossier',
    subcall: 'R3',
    tools: [makeWebSearchTool(20)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C1 - Team Quality (no web search; evidence comes from R4a)
// ---------------------------------------------------------------------------

export const runC1: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C1',
    label: 'Team Quality',
    filledTemplate,
    priorContext,
    emitter,
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C2 - Market Opportunity (runs 5 force tests)
// ---------------------------------------------------------------------------

export const runC2: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C2',
    label: 'Market Opportunity',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C3 - Product / Traction
// ---------------------------------------------------------------------------

export const runC3: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C3',
    label: 'Product/Traction',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C4 - Capital Efficiency
// ---------------------------------------------------------------------------

export const runC4: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C4',
    label: 'Capital Efficiency',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C5 - Cap Table
// ---------------------------------------------------------------------------

export const runC5: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C5',
    label: 'Cap Table',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C6 - Competitive Moat (needs R4a + C2 force test results)
// ---------------------------------------------------------------------------

export const runC6: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C6',
    label: 'Competitive Moat',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// C7 - Exit Pathway
// ---------------------------------------------------------------------------

export const runC7: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  return runCriterionBlock({
    subBlockId: 'C7',
    label: 'Exit Pathway',
    filledTemplate,
    priorContext,
    emitter,
    tools: [makeWebSearchTool(10)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// R5 - Cross-Validation
// ---------------------------------------------------------------------------

export const runR5: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const blockDef = getDossierOutputBlock('R5');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_RESEARCH, filledTemplate,
      `You are producing ONLY Block R5 (Cross-Validation) of the research dossier.

${blockDef}

Produce R5 in full. Do NOT produce any other blocks.`),
    userContent: buildUserContent(priorContext, 'Produce Block R5 only.'),
    emitter,
    step: 'dossier',
    subcall: 'R5',
    tools: [makeWebSearchTool(15)],
    maxTokens: 8192,
  });
};

// ---------------------------------------------------------------------------
// R6 + R7 + R8 - Assembly, Completion Gate & Handoff
// ---------------------------------------------------------------------------

export const runR6R7R8: DossierBlockRunner = async (filledTemplate, priorContext, emitter) => {
  const r6Def = getDossierOutputBlock('R6');
  const r7Def = getDossierOutputBlock('R7');
  const r8Def = getDossierOutputBlock('R8');

  return callOpus({
    systemParts: buildSystemParts(PREAMBLE_MINIMAL, filledTemplate,
      `You are producing Blocks R6 (Assembly), R7 (Completion Gate), and R8 (Handoff) of the research dossier.

${r6Def}

${r7Def}

${r8Def}

Produce R6, R7, and R8 in full. Do NOT produce any other blocks.`),
    userContent: `All prior dossier blocks:\n\n${priorContext}\n\nProduce Blocks R6, R7, and R8.`,
    emitter,
    step: 'dossier',
    subcall: 'R6-R8',
    maxTokens: 16384,
  });
};
