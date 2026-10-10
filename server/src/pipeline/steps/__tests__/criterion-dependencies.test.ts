// Tests for which rubric criteria must wait for another criterion's result before scoring.

import type { RubricType } from '@shared/types/pipeline.js';
import { assertTasksAreRunnable } from '../../dependency-scheduler.js';
import { extractBlock, getRubricProfile } from '../../prompts/loader.js';
import {
  getCriterionResultDependencies,
  getCriterionScoringTasks,
  type RubricProfile,
} from '../score/criterion-dependencies.js';
import { buildCriterionScoringUserContent, buildDossierSystemPart } from '../score/sub-steps.js';

const RUBRICS: RubricType[] = ['life-sciences', 'technology', 'defense'];
const PROFILES: RubricProfile[] = ['A', 'B'];
const RUBRIC_PROFILES = RUBRICS.flatMap((rubric) => PROFILES.map((profile) => [rubric, profile] as const));

describe('getCriterionScoringTasks', () => {
  it.each(RUBRIC_PROFILES)('%s profile %s has one task per criterion, in order', (rubric, profile) => {
    const ids = getCriterionScoringTasks(rubric, profile).map((task) => task.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7].map((n) => `${profile}${n}`));
  });

  it.each(RUBRIC_PROFILES)('%s profile %s dependencies can all be scheduled (no cycles)', (rubric, profile) => {
    expect(() => assertTasksAreRunnable(getCriterionScoringTasks(rubric, profile))).not.toThrow();
  });

  it.each(RUBRIC_PROFILES)('%s profile %s only depends on criteria of the same profile', (rubric, profile) => {
    for (const task of getCriterionScoringTasks(rubric, profile)) {
      for (const dependencyId of task.dependsOn) {
        expect(dependencyId.startsWith(profile)).toBe(true);
      }
    }
  });
});

describe('getCriterionResultDependencies', () => {
  it('returns no dependencies for an independent criterion', () => {
    expect(getCriterionResultDependencies('defense', 'A1')).toEqual([]);
  });

  it.each([
    ['life-sciences', 'A3', ['A2', 'A4']],
    ['life-sciences', 'B3', ['B2', 'B5']],
    ['technology', 'A2', ['A1', 'A3']],
    ['technology', 'B2', ['B1', 'B3']],
    ['defense', 'A2', ['A1', 'A3']],
    ['defense', 'B2', ['B1', 'B3']],
  ] as const)('%s %s waits for its Operational Viability Condition anchors', (rubric, criterionId, anchors) => {
    expect(getCriterionResultDependencies(rubric, criterionId)).toEqual(anchors);
  });

  // Regression: technology moat (6) and exit (7) apply rules keyed to the AI Modifier
  // classification made while scoring market (2). Scored in parallel they could disagree
  // with the classification actually recorded.
  it.each([
    ['A6', 'A2'],
    ['A7', 'A2'],
    ['B6', 'B2'],
    ['B7', 'B2'],
  ])('technology %s waits for the AI classification made in %s', (criterionId, marketCriterionId) => {
    expect(getCriterionResultDependencies('technology', criterionId)).toEqual([marketCriterionId]);
  });
});

describe('declared dependencies match the rubric text', () => {
  /** Ids of same-profile criteria cited inside a criterion's Operational Viability Condition. */
  function findOperationalViabilityAnchors(rubric: RubricType, profile: RubricProfile, criterionId: string): string[] {
    const criterionDef = extractBlock(getRubricProfile(rubric, profile), 'criterion', criterionId);
    const condition = criterionDef.match(/<operational_viability_condition>[\s\S]*?<\/operational_viability_condition>/);
    if (!condition) return [];

    const citedIds = condition[0].match(new RegExp(`\\b${profile}[1-7]\\b`, 'g')) ?? [];
    return [...new Set(citedIds)].filter((id) => id !== criterionId).sort();
  }

  // Guards future rubric revisions: if an Operational Viability Condition is added, moved,
  // or re-anchored in a rubric file, the dependency map must be updated to match.
  it.each(
    RUBRIC_PROFILES.flatMap(([rubric, profile]) =>
      [1, 2, 3, 4, 5, 6, 7].map((n) => [rubric, `${profile}${n}`, profile] as const),
    ),
  )('%s %s depends on every criterion its Operational Viability Condition cites', (rubric, criterionId, profile) => {
    const anchors = findOperationalViabilityAnchors(rubric, profile, criterionId);
    const declared = getCriterionResultDependencies(rubric, criterionId);

    for (const anchorId of anchors) {
      expect(declared).toContain(anchorId);
    }
  });

  it('finds an Operational Viability Condition in every rubric profile', () => {
    for (const [rubric, profile] of RUBRIC_PROFILES) {
      const criteriaWithCondition = [1, 2, 3, 4, 5, 6, 7].filter(
        (n) => findOperationalViabilityAnchors(rubric, profile, `${profile}${n}`).length > 0,
      );
      expect(criteriaWithCondition).toHaveLength(1);
    }
  });
});

describe('buildCriterionScoringUserContent', () => {
  it('is just the scoring instruction when the criterion has no dependencies', () => {
    const content = buildCriterionScoringUserContent('A1', new Map());
    expect(content).toBe(
      'Score criterion A1 according to the rubric. Produce the Block 3 output for this single criterion only.',
    );
  });

  it('includes every dependency score, labeled by criterion, before the instruction', () => {
    const content = buildCriterionScoringUserContent(
      'A2',
      new Map([['A1', 'A1 scored 5'], ['A3', 'A3 scored 4']]),
    );

    expect(content).toContain('<completed_criterion_score id="A1">\nA1 scored 5\n</completed_criterion_score>');
    expect(content).toContain('<completed_criterion_score id="A3">\nA3 scored 4\n</completed_criterion_score>');
    expect(content).toContain('depends on the results of A1, A3');
    expect(content).toContain('Do NOT re-score or revise those criteria.');
    expect(content.indexOf('A3 scored 4')).toBeLessThan(content.indexOf('Score criterion A2'));
    expect(content.trimEnd().endsWith('Produce the Block 3 output for this single criterion only.')).toBe(true);
  });
});

describe('buildDossierSystemPart', () => {
  it('contains the dossier and is cached', () => {
    const part = buildDossierSystemPart('DOSSIER BODY');
    expect(part.cache).toBe(true);
    expect(part.text).toContain('Research dossier to evaluate:\n\nDOSSIER BODY');
  });

  // Regression: the dossier's C4/C6/C7 are Capital Efficiency / Moat / Exit, while the
  // defense rubric's C4/C6/C7 are Government Access / Capital Efficiency / Moat + Exit.
  it('warns that dossier C1-C7 labels are not rubric criterion numbers, ahead of the dossier', () => {
    const part = buildDossierSystemPart('DOSSIER BODY');
    expect(part.text).toContain('NOT this rubric\'s criterion numbers');
    expect(part.text).toContain('never dossier block C<n>');
    expect(part.text.indexOf('NOT this rubric')).toBeLessThan(part.text.indexOf('DOSSIER BODY'));
  });

  it('produces identical text for the same dossier so every score call shares one cache entry', () => {
    expect(buildDossierSystemPart('same').text).toBe(buildDossierSystemPart('same').text);
  });
});
