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
