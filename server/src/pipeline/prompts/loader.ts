import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { RubricType } from '@shared/types/pipeline.js';

const PROMPTS_DIR = resolve(import.meta.dirname, '../../../../prompts');

let cachedPrompts: {
  researchDossierTemplate: string;
  lifeSciencesRubric: string;
  technologyRubric: string;
} | null = null;

function loadAll() {
  if (cachedPrompts) return cachedPrompts;
  cachedPrompts = {
    researchDossierTemplate: readFileSync(resolve(PROMPTS_DIR, 'Research Dossier Template.txt'), 'utf-8'),
    lifeSciencesRubric: readFileSync(resolve(PROMPTS_DIR, 'Life Sciences Rubric v5.1.txt'), 'utf-8'),
    technologyRubric: readFileSync(resolve(PROMPTS_DIR, 'Technology Rubric.txt'), 'utf-8'),
  };
  return cachedPrompts;
}

export function getResearchDossierTemplate(): string {
  return loadAll().researchDossierTemplate;
}

export function getRubricPrompt(rubric: RubricType): string {
  const prompts = loadAll();
  return rubric === 'life-sciences' ? prompts.lifeSciencesRubric : prompts.technologyRubric;
}

// ---------------------------------------------------------------------------
// Prompt section extraction utilities
// ---------------------------------------------------------------------------

/**
 * Extracts a block of content from an XML-like template by tag name and id attribute.
 * Works for <section>, <output_block>, <sub_block>, <criterion>, <block> tags.
 * These tags do not self-nest in these files, so finding the next closing tag works.
 *
 * For <criterion> tags, matches only full definitions (those with a `name=` attribute
 * and content between open/close tags), not self-closing summary tags.
 */
export function extractBlock(source: string, tagName: string, id: string): string {
  // Build a regex that matches the opening tag with the given id.
  // For <criterion>, require the tag to have a name= attribute to skip self-closing
  // summary entries like <criterion id="A1" weight_pct="24" max_points="24"/>.
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  let pattern: RegExp;
  if (tagName === 'criterion') {
    // Match opening <criterion> tag with the given id that also has a name= attribute
    // and is NOT self-closing (no /> before the >). Then capture up to </criterion>.
    pattern = new RegExp(
      `(<${tagName}\\s+id="${escapedId}"[^>]*?\\bname="[^"]*"[^/>]*>)([\\s\\S]*?</${tagName}>)`,
    );
  } else {
    // Match opening tag with the given id, then capture up to the closing tag.
    pattern = new RegExp(
      `(<${tagName}\\s+id="${escapedId}"[^>]*>)([\\s\\S]*?</${tagName}>)`,
    );
  }

  const match = source.match(pattern);
  if (!match) {
    throw new Error(`extractBlock: could not find <${tagName} id="${id}"> in source`);
  }
  return match[1] + match[2];
}

/**
 * Extracts multiple <section> blocks by their ids and joins them with double newlines.
 */
export function extractSections(source: string, sectionIds: string[]): string {
  return sectionIds.map((id) => extractBlock(source, 'section', id)).join('\n\n');
}

/**
 * Extracts Sections 1-5 from the dossier template (the full preamble).
 */
export function getDossierPreamble(): string {
  return extractSections(getResearchDossierTemplate(), ['1', '2', '3', '4', '5']);
}

/**
 * Minimal preamble: Section 1 only (role definition + prohibited outputs).
 * For blocks that don't do research or classify evidence: R0, R6, R7, R8.
 */
export function getDossierPreambleMinimal(): string {
  return extractSections(getResearchDossierTemplate(), ['1']);
}

/**
 * Research preamble: Sections 1-3 (role + classification tags + scarcity rules).
 * For blocks that research and classify evidence: R1, R3, R4a, C1-C7, R5.
 */
export function getDossierPreambleResearch(): string {
  return extractSections(getResearchDossierTemplate(), ['1', '2', '3']);
}

/**
 * Routing preamble: Sections 1-4 (research preamble + routing ambiguity protocol).
 * For R2 only, which resolves raise amount ambiguity.
 */
export function getDossierPreambleRouting(): string {
  return extractSections(getResearchDossierTemplate(), ['1', '2', '3', '4']);
}

/**
 * Extracts a specific <output_block> (R0-R8) from the dossier template.
 */
export function getDossierOutputBlock(blockId: string): string {
  return extractBlock(getResearchDossierTemplate(), 'output_block', blockId);
}

/**
 * Extracts a specific <sub_block> (e.g., C1-C7) from the dossier template.
 */
export function getDossierSubBlock(subBlockId: string): string {
  return extractBlock(getResearchDossierTemplate(), 'sub_block', subBlockId);
}

/**
 * Extracts Section 7 (Disqualifier Schema) from the dossier template.
 */
export function getDossierDisqualifierSchema(): string {
  return extractBlock(getResearchDossierTemplate(), 'section', '7');
}

/**
 * Extracts a <section> from the appropriate rubric by rubric type and section id.
 */
export function getRubricSection(rubric: RubricType, sectionId: string): string {
  return extractBlock(getRubricPrompt(rubric), 'section', sectionId);
}

/**
 * Extracts a full criterion definition from the rubric. Matches only the
 * criterion tag with a `name=` attribute (the full definition), not the
 * self-closing summary tag in the weight summary table.
 */
export function getRubricCriterion(rubric: RubricType, criterionId: string): string {
  return extractBlock(getRubricPrompt(rubric), 'criterion', criterionId);
}

/**
 * Extracts a <block> from the rubric's output format section.
 */
export function getRubricOutputBlock(rubric: RubricType, blockId: string): string {
  return extractBlock(getRubricPrompt(rubric), 'block', blockId);
}
