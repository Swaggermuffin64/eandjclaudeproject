import type Anthropic from '@anthropic-ai/sdk';
import type { PipelineEmitter, TemplateInput, TemplateOutput, UploadedSourceDocument } from '../types.js';
import { callSonnet } from '../claude/client.js';
import { buildSourceDocumentBlock } from '../claude/source-document-files.js';
import { getResearchDossierTemplate } from '../prompts/loader.js';

const TEMPLATE_FILL_PROMPT = `You are Claude Sonnet operating as a document extraction and research template preparation engine. Your job is to read a company's source documents (pitch decks, one-pagers, financials, etc.) and produce the three Operator Inputs (OI-1, OI-2, OI-3) that the Research Dossier Template requires.

Work directly from the source documents provided. Read every document in full, including text, tables, charts and images where they are present.

Produce the following structured operator inputs:

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

OI-3 (Entity Manifest): The full entity manifest extracted from the source documents, organized into all 16 categories:

1. LEGAL ENTITY: Full legal name, DBA/brand names, jurisdiction of incorporation
2. NAMED FOUNDERS/EXECUTIVES: Name, title, claimed background for each
3. TEAM MEMBERS: Non-founder team members mentioned by name
4. ADVISORS: Named advisors, board members, KOLs
5. CUSTOMERS: Named customers, partners, design partners
6. COMPETITORS: Named competitors or competitive landscape references
7. INVESTORS: Named investors (institutional, angel, accelerator)
8. PRIOR EMPLOYERS: Employer names associated with founder/team claims
9. MEDIA COVERAGE: Named press outlets, publications, awards
10. PRODUCT ELEMENTS: Product names, features, technical claims
11. QUANTITATIVE CLAIMS: Revenue figures, growth rates, market sizes, user counts
12. CREDENTIAL CLAIMS: Degrees, patents, publications, certifications
13. REGULATORY FLAGS: FDA mentions, compliance claims, regulatory pathway references
14. AMBIGUOUS ATTRIBUTIONS: Claims where the subject or attribution is unclear
15. CAPITAL STRUCTURE CLAIMS: Raise amounts, valuations, round types, investor terms
16. SURFACED INDIVIDUALS LOG: All named individuals for downstream research

For each extracted entity, note the source document and the location (page/section) where it appears.

Format your output as a single structured document with clear section headers for each operator input.`;

/** Added to the label of an Office document so the model does not read missing visuals as missing information. */
const OFFICE_TEXT_ONLY_NOTE =
  'This is a text-only extraction of an Office file; charts, images and layout from the original are not included.';

/** Builds the text label that introduces one source document, e.g. "PRIMARY DOCUMENT (deck.pdf):". */
function buildDocumentLabel(role: string, document: UploadedSourceDocument): string {
  const label = `${role} (${document.filename}):`;
  return document.kind === 'office' ? `${label} ${OFFICE_TEXT_ONLY_NOTE}` : label;
}

/** Builds the label and file-reference blocks for one source document. */
function buildLabelledDocumentBlocks(
  role: string,
  document: UploadedSourceDocument,
): Anthropic.ContentBlockParam[] {
  return [
    { type: 'text', text: buildDocumentLabel(role, document) },
    buildSourceDocumentBlock(document),
  ];
}

/**
 * Template step: reads the uploaded source documents and produces the three Operator
 * Inputs (OI-1, OI-2, OI-3) that the dossier step works from.
 *
 * It is the only step that sees the source documents. They are referenced by Files
 * API file id, so their bytes are never sent inline.
 */
export async function runTemplate(input: TemplateInput, emitter: PipelineEmitter): Promise<TemplateOutput> {
  const dossierTemplate = getResearchDossierTemplate();

  const userContent: Anthropic.ContentBlockParam[] = [
    {
      type: 'text',
      text: `Here is the Research Dossier Template for reference on the expected operator input format:

<research_dossier_template>
${dossierTemplate}
</research_dossier_template>

The company's source documents follow.`,
    },
    ...buildLabelledDocumentBlocks('PRIMARY DOCUMENT', input.primaryDocument),
    ...input.supplementaryDocuments.flatMap((document, index) =>
      buildLabelledDocumentBlocks(`SUPPLEMENTARY DOCUMENT ${index + 1}`, document),
    ),
    {
      type: 'text',
      text: 'Produce the three Operator Inputs (OI-1, OI-2, OI-3) as instructed.',
    },
  ];

  const response = await callSonnet({
    systemPrompt: TEMPLATE_FILL_PROMPT,
    userContent,
    emitter,
    step: 'template',
    maxTokens: 16384,
  });

  return { filledTemplate: response };
}
