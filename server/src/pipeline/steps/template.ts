import type { PipelineEmitter, TemplateInput, TemplateOutput } from '../types.js';
import { callSonnet } from '../claude/client.js';
import { getResearchDossierTemplate } from '../prompts/loader.js';

const TEMPLATE_FILL_PROMPT = `You are Claude Sonnet operating as a research template preparation engine. Your job is to take extracted document text and an entity manifest, and produce the three Operator Inputs (OI-1, OI-2, OI-3) that the Research Dossier Template requires.

Using the extracted text and entity manifest provided, produce the following structured operator inputs:

OI-1 (Source Documents): List all source documents that were processed, with a brief description of each document's type and content coverage.

OI-2 (Company Quick Reference): A structured quick-reference block containing:
  - Company legal name and DBA
  - Sector / industry
  - Headquarters location
  - Founding year
  - Current headcount (if available)
  - Current fundraising target (if stated)
  - Most recent funding round (if available)
  - Development stage
  - Primary product / technology

OI-3 (Entity Manifest): The full entity manifest as extracted, organized into all 16 categories.

Format your output as a single structured document with clear section headers for each operator input.`;

export async function runTemplate(input: TemplateInput, emitter: PipelineEmitter): Promise<TemplateOutput> {
  const dossierTemplate = getResearchDossierTemplate();

  const userMessage = `Here is the Research Dossier Template for reference on the expected operator input format:

<research_dossier_template>
${dossierTemplate}
</research_dossier_template>

Here is the extracted text from the company's source documents:

<extracted_text>
${input.extractedText}
</extracted_text>

Here is the entity manifest extracted from the source documents:

<entity_manifest>
${input.entityManifest}
</entity_manifest>

Produce the three Operator Inputs (OI-1, OI-2, OI-3) as instructed.`;

  const response = await callSonnet({
    systemPrompt: TEMPLATE_FILL_PROMPT,
    userContent: userMessage,
    emitter,
    step: 'template',
    maxTokens: 16384,
  });

  return { filledTemplate: response };
}
