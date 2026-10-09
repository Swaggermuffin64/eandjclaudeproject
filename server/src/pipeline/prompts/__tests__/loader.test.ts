import {
  getResearchDossierTemplate,
  getRubricPrompt,
  getRubricShared,
  getRubricProfile,
  getDossierPreamble,
  getDossierPreambleMinimal,
  getDossierPreambleResearch,
  getDossierPreambleRouting,
  getDossierOutputBlock,
  getDossierSubBlock,
  getDossierDisqualifierSchema,
  getRubricSection,
  getRubricCriterion,
  getRubricOutputBlock,
} from '../loader.js';

// ---------------------------------------------------------------------------
// Dossier template loading
// ---------------------------------------------------------------------------

describe('getResearchDossierTemplate', () => {
  it('returns a non-empty string', () => {
    const template = getResearchDossierTemplate();
    expect(typeof template).toBe('string');
    expect(template.length).toBeGreaterThan(0);
  });

  it('contains expected section markers', () => {
    const template = getResearchDossierTemplate();
    expect(template).toContain('<section id="1"');
    expect(template).toContain('<section id="2"');
    expect(template).toContain('<section id="3"');
    expect(template).toContain('<output_block id="R0"');
    expect(template).toContain('<output_block id="R1"');
  });

  it('returns the same reference on repeated calls (caching)', () => {
    const a = getResearchDossierTemplate();
    const b = getResearchDossierTemplate();
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Rubric access
// ---------------------------------------------------------------------------

describe('getRubricPrompt', () => {
  it('returns life-sciences rubric containing shared + both profiles', () => {
    const rubric = getRubricPrompt('life-sciences');
    expect(rubric).toContain('<section id="1"');     // shared
    expect(rubric).toContain('id="A1"');              // profile A
    expect(rubric).toContain('id="B1"');              // profile B
  });

  it('returns technology rubric containing shared + both profiles', () => {
    const rubric = getRubricPrompt('technology');
    expect(rubric).toContain('id="A1"');
    expect(rubric).toContain('id="B1"');
  });
});

describe('getRubricShared', () => {
  it('returns life-sciences shared sections', () => {
    const shared = getRubricShared('life-sciences');
    expect(shared.length).toBeGreaterThan(0);
    // Shared should not contain profile-specific full criterion definitions
    // (it may contain summary weight tables with criterion ids)
  });

  it('returns technology shared sections', () => {
    const shared = getRubricShared('technology');
    expect(shared.length).toBeGreaterThan(0);
  });

  it('returns different content for different rubric types', () => {
    const ls = getRubricShared('life-sciences');
    const tech = getRubricShared('technology');
    expect(ls).not.toBe(tech);
  });
});

describe('getRubricProfile', () => {
  it.each([
    ['life-sciences', 'A'] as const,
    ['life-sciences', 'B'] as const,
    ['technology', 'A'] as const,
    ['technology', 'B'] as const,
  ])('returns non-empty content for %s profile %s', (rubric, profile) => {
    const content = getRubricProfile(rubric, profile);
    expect(content.length).toBeGreaterThan(0);
  });

  it('profile A and B return different content', () => {
    const a = getRubricProfile('life-sciences', 'A');
    const b = getRubricProfile('life-sciences', 'B');
    expect(a).not.toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Dossier preamble variants
// ---------------------------------------------------------------------------

describe('dossier preamble functions', () => {
  it('getDossierPreambleMinimal contains only Section 1', () => {
    const minimal = getDossierPreambleMinimal();
    expect(minimal).toContain('<section id="1"');
    expect(minimal).not.toContain('<section id="2"');
  });

  it('getDossierPreambleResearch contains Sections 1-3', () => {
    const research = getDossierPreambleResearch();
    expect(research).toContain('<section id="1"');
    expect(research).toContain('<section id="2"');
    expect(research).toContain('<section id="3"');
    expect(research).not.toContain('<section id="4"');
  });

  it('getDossierPreambleRouting contains Sections 1-4', () => {
    const routing = getDossierPreambleRouting();
    expect(routing).toContain('<section id="1"');
    expect(routing).toContain('<section id="2"');
    expect(routing).toContain('<section id="3"');
    expect(routing).toContain('<section id="4"');
    expect(routing).not.toContain('<section id="5"');
  });

  it('getDossierPreamble contains Sections 1-5', () => {
    const full = getDossierPreamble();
    expect(full).toContain('<section id="1"');
    expect(full).toContain('<section id="2"');
    expect(full).toContain('<section id="3"');
    expect(full).toContain('<section id="4"');
    expect(full).toContain('<section id="5"');
  });

  it('minimal is a subset of research', () => {
    const minimal = getDossierPreambleMinimal();
    const research = getDossierPreambleResearch();
    expect(research.length).toBeGreaterThan(minimal.length);
    expect(research).toContain(minimal);
  });

  it('research is a subset of routing', () => {
    const research = getDossierPreambleResearch();
    const routing = getDossierPreambleRouting();
    expect(routing.length).toBeGreaterThan(research.length);
    expect(routing).toContain(research);
  });
});

// ---------------------------------------------------------------------------
// Dossier block extraction
// ---------------------------------------------------------------------------

describe('getDossierOutputBlock', () => {
  it.each(['R0', 'R1', 'R2', 'R3', 'R5'])('extracts output_block %s', (blockId) => {
    const block = getDossierOutputBlock(blockId);
    expect(block).toContain(`id="${blockId}"`);
    expect(block).toContain('</output_block>');
  });

  it('throws for non-existent block', () => {
    expect(() => getDossierOutputBlock('R99')).toThrow();
  });
});

describe('getDossierSubBlock', () => {
  it.each(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'])('extracts sub_block %s', (subBlockId) => {
    const block = getDossierSubBlock(subBlockId);
    expect(block).toContain(`id="${subBlockId}"`);
    expect(block).toContain('</sub_block>');
  });

  it('throws for non-existent sub_block', () => {
    expect(() => getDossierSubBlock('C99')).toThrow();
  });
});

describe('getDossierDisqualifierSchema', () => {
  it('returns Section 7', () => {
    const schema = getDossierDisqualifierSchema();
    expect(schema).toContain('<section id="7"');
    expect(schema).toContain('</section>');
  });
});

// ---------------------------------------------------------------------------
// Rubric block extraction
// ---------------------------------------------------------------------------

describe('getRubricSection', () => {
  it('extracts a section from life-sciences rubric', () => {
    const section = getRubricSection('life-sciences', '1');
    expect(section).toContain('<section id="1"');
    expect(section).toContain('</section>');
  });

  it('extracts a section from technology rubric', () => {
    const section = getRubricSection('technology', '2');
    expect(section).toContain('<section id="2"');
  });
});

describe('getRubricCriterion', () => {
  it.each(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])(
    'extracts life-sciences criterion %s',
    (id) => {
      const crit = getRubricCriterion('life-sciences', id);
      expect(crit).toContain(`id="${id}"`);
      expect(crit).toContain('name=');
      expect(crit).toContain('</criterion>');
    },
  );

  it.each(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'])(
    'extracts life-sciences criterion %s',
    (id) => {
      const crit = getRubricCriterion('life-sciences', id);
      expect(crit).toContain(`id="${id}"`);
      expect(crit).toContain('name=');
      expect(crit).toContain('</criterion>');
    },
  );

  it.each(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])(
    'extracts technology criterion %s',
    (id) => {
      const crit = getRubricCriterion('technology', id);
      expect(crit).toContain(`id="${id}"`);
      expect(crit).toContain('</criterion>');
    },
  );

  it.each(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7'])(
    'extracts technology criterion %s',
    (id) => {
      const crit = getRubricCriterion('technology', id);
      expect(crit).toContain(`id="${id}"`);
      expect(crit).toContain('</criterion>');
    },
  );
});

describe('getRubricOutputBlock', () => {
  it('extracts a block from the rubric', () => {
    // Both rubrics should have output format blocks
    const block = getRubricOutputBlock('life-sciences', '3');
    expect(block).toContain('id="3"');
    expect(block).toContain('</block>');
  });
});
