import type { PipelineEmitter, IngestInput, IngestOutput } from '../types.js';
import { callSonnet, buildPdfContentBlock } from '../claude/client.js';

const ENTITY_EXTRACTION_PROMPT = `You are Claude Sonnet operating as a document extraction engine. Your job is to extract a structured entity manifest from company source documents (pitch decks, one-pagers, financials, etc.).

Extract the following into a structured manifest (OI-3 Sonnet Entity Manifest):

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

For each extracted entity, note the source location (page/section) where it appears.

Also produce a clean text extraction of the full document content for downstream processing.

Output format:
---EXTRACTED TEXT---
[Full clean text of all documents]
---ENTITY MANIFEST---
[Structured manifest with all 16 categories above]`;

export async function runIngest(input: IngestInput, emitter: PipelineEmitter): Promise<IngestOutput> {
  const contentBlocks: Array<ReturnType<typeof buildPdfContentBlock> | { type: 'text'; text: string }> = [];

  contentBlocks.push({ type: 'text', text: 'PRIMARY DOCUMENT:' });
  contentBlocks.push(buildPdfContentBlock(input.primaryPdf));

  for (let i = 0; i < input.supplementaryPdfs.length; i++) {
    contentBlocks.push({ type: 'text', text: `SUPPLEMENTARY DOCUMENT ${i + 1}:` });
    contentBlocks.push(buildPdfContentBlock(input.supplementaryPdfs[i]));
  }

  contentBlocks.push({
    type: 'text',
    text: 'Extract the full text and produce the entity manifest as instructed.',
  });

  const response = await callSonnet({
    systemPrompt: ENTITY_EXTRACTION_PROMPT,
    userContent: contentBlocks,
    emitter,
    step: 'ingest',
    maxTokens: 16384,
  });

  const textMarker = '---EXTRACTED TEXT---';
  const manifestMarker = '---ENTITY MANIFEST---';

  const textStart = response.indexOf(textMarker);
  const manifestStart = response.indexOf(manifestMarker);

  let extractedText: string;
  let entityManifest: string;

  if (textStart !== -1 && manifestStart !== -1) {
    extractedText = response.slice(textStart + textMarker.length, manifestStart).trim();
    entityManifest = response.slice(manifestStart + manifestMarker.length).trim();
  } else {
    // If markers are missing, treat entire response as both
    extractedText = response;
    entityManifest = response;
  }

  return { extractedText, entityManifest };
}
