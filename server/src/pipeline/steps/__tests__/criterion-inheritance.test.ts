// Tests for how a Profile B criterion pulls in the Profile A definition it is written against.
// Profile B criteria are scored in their own call, so a "refer to the A1 block" reference is
// only usable if the A1 definition is sent with it.

import { getRubricProfile } from '../../prompts/loader.js';
import {
  findInheritedProfileACriterionId,
  buildCriterionDefinitionText,
} from '../score/sub-steps.js';

const PROFILE_A = [
  '<criterion id="A1" name="Team" max_points="22">A1 halo taxonomy text</criterion>',
  '<criterion id="A6" name="Capital" max_points="8">A6 band text</criterion>',
].join('\n');

const PROFILE_B = [
  '<criterion id="B1" name="Team" max_points="26">Per A1 top-band definition. Refer to the A1 block.</criterion>',
  '<criterion id="B6" name="Capital" max_points="10">Standalone Profile B text.</criterion>',
].join('\n');

describe('findInheritedProfileACriterionId', () => {
  it('returns the Profile A counterpart when a Profile B criterion cites it', () => {
    expect(findInheritedProfileACriterionId('B1', 'Per A1 top-band definition')).toBe('A1');
  });

  it('returns null when a Profile B criterion does not cite its counterpart', () => {
    expect(findInheritedProfileACriterionId('B6', 'Standalone Profile B text.')).toBeNull();
  });

  it('returns null when a Profile B criterion only cites a different Profile A criterion', () => {
    expect(findInheritedProfileACriterionId('B5', 'See the A1 NCSP list.')).toBeNull();
  });

  it('returns null for Profile A criteria even when they mention themselves or Profile B', () => {
    expect(findInheritedProfileACriterionId('A1', 'A1 differs from B1 here.')).toBeNull();
  });

  it('does not treat a longer token such as A10 or DA1 as a citation of A1', () => {
    expect(findInheritedProfileACriterionId('B1', 'Tier A10 and code DA1 only.')).toBeNull();
  });
});

describe('buildCriterionDefinitionText', () => {
  it('appends the cited Profile A definition as reference-only material', () => {
    const text = buildCriterionDefinitionText(PROFILE_A, PROFILE_B, 'B1');
    expect(text).toContain('<criterion id="B1"');
    expect(text).toContain('<referenced_criterion_definition id="A1">');
    expect(text).toContain('A1 halo taxonomy text');
    expect(text).toContain('Do NOT score A1');
    expect(text).not.toContain('A6 band text');
  });

  it('puts the criterion being scored before the referenced definition', () => {
    const text = buildCriterionDefinitionText(PROFILE_A, PROFILE_B, 'B1');
    expect(text.indexOf('<criterion id="B1"')).toBeLessThan(text.indexOf('<criterion id="A1"'));
  });

  it('returns only the criterion itself when nothing is inherited', () => {
    const text = buildCriterionDefinitionText(PROFILE_A, PROFILE_B, 'B6');
    expect(text).toBe('<criterion id="B6" name="Capital" max_points="10">Standalone Profile B text.</criterion>');
  });

  it('returns only the criterion itself for Profile A', () => {
    const text = buildCriterionDefinitionText(PROFILE_A, PROFILE_A, 'A1');
    expect(text).toBe('<criterion id="A1" name="Team" max_points="22">A1 halo taxonomy text</criterion>');
  });
});

describe('criterion inheritance in the real rubrics', () => {
  // Regression: the defense rubric states B1, B2, B4, B5 and B7 reference the Profile A
  // band text, and B3 reuses A3 sub-components. B6 is defined entirely on its own.
  it.each(['B1', 'B2', 'B3', 'B4', 'B5', 'B7'])(
    'defense %s is sent with its Profile A counterpart',
    (id) => {
      const text = buildCriterionDefinitionText(
        getRubricProfile('defense', 'A'),
        getRubricProfile('defense', 'B'),
        id,
      );
      expect(text).toContain(`<referenced_criterion_definition id="A${id.slice(1)}">`);
    },
  );

  it('defense B6 is sent on its own', () => {
    const text = buildCriterionDefinitionText(
      getRubricProfile('defense', 'A'),
      getRubricProfile('defense', 'B'),
      'B6',
    );
    expect(text).not.toContain('referenced_criterion_definition');
  });

  it.each(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'])(
    'technology %s is sent with its Profile A counterpart',
    (id) => {
      const text = buildCriterionDefinitionText(
        getRubricProfile('technology', 'A'),
        getRubricProfile('technology', 'B'),
        id,
      );
      expect(text).toContain(`<referenced_criterion_definition id="A${id.slice(1)}">`);
    },
  );

  it.each(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])(
    'defense %s (Profile A) is sent on its own',
    (id) => {
      const profileA = getRubricProfile('defense', 'A');
      const text = buildCriterionDefinitionText(profileA, profileA, id);
      expect(text).not.toContain('referenced_criterion_definition');
    },
  );
});
