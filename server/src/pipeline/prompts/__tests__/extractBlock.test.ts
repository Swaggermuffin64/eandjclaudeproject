import { extractBlock, extractSections } from '../loader.js';

// ---------------------------------------------------------------------------
// extractBlock
// ---------------------------------------------------------------------------

describe('extractBlock', () => {
  it('extracts a simple output_block by id', () => {
    const source = `
<output_block id="R1" name="Entity Identification">
  <purpose>Establishes what is being evaluated.</purpose>
</output_block>`;
    const result = extractBlock(source, 'output_block', 'R1');
    expect(result).toContain('Entity Identification');
    expect(result).toContain('</output_block>');
  });

  it('extracts a section by id', () => {
    const source = `
<section id="1" name="Role Definition">
  Some content here.
</section>
<section id="2" name="Classification">
  Other content.
</section>`;
    const result = extractBlock(source, 'section', '2');
    expect(result).toContain('Classification');
    expect(result).not.toContain('Role Definition');
  });

  it('extracts a sub_block by id', () => {
    const source = `
<sub_block id="C1" name="Team Quality">
  <purpose>Evaluates team.</purpose>
</sub_block>`;
    const result = extractBlock(source, 'sub_block', 'C1');
    expect(result).toContain('Team Quality');
    expect(result).toContain('</sub_block>');
  });

  it('extracts a block by id', () => {
    const source = `
<block id="1.1" name="Role">
  You are Claude Opus.
</block>`;
    const result = extractBlock(source, 'block', '1.1');
    expect(result).toContain('You are Claude Opus');
    expect(result).toContain('</block>');
  });

  it('returns opening tag + inner content + closing tag', () => {
    const source = `<section id="X" name="Test">inner content</section>`;
    const result = extractBlock(source, 'section', 'X');
    expect(result).toBe('<section id="X" name="Test">inner content</section>');
  });

  it('throws when block is not found', () => {
    const source = '<section id="1">content</section>';
    expect(() => extractBlock(source, 'section', '99')).toThrow(
      'extractBlock: could not find <section id="99"> in source',
    );
  });

  it('throws when tag name does not match', () => {
    const source = '<section id="1">content</section>';
    expect(() => extractBlock(source, 'output_block', '1')).toThrow();
  });

  it('handles multiline content between tags', () => {
    const source = `<section id="3" name="Rules">
  Line one.
  Line two.
  Line three.
</section>`;
    const result = extractBlock(source, 'section', '3');
    expect(result).toContain('Line one.');
    expect(result).toContain('Line three.');
  });

  it('matches the first block when multiple blocks share the same tag name', () => {
    const source = `
<output_block id="R0" name="Research Plan">R0 content</output_block>
<output_block id="R1" name="Entity ID">R1 content</output_block>
<output_block id="R2" name="Capital">R2 content</output_block>`;
    const r1 = extractBlock(source, 'output_block', 'R1');
    expect(r1).toContain('R1 content');
    expect(r1).not.toContain('R0 content');
    expect(r1).not.toContain('R2 content');
  });

  it('escapes special regex characters in ids', () => {
    const source = '<block id="1.1" name="Role">content</block>';
    // "1.1" contains a dot which is a regex special char
    const result = extractBlock(source, 'block', '1.1');
    expect(result).toContain('content');
  });

  it('does not match id="1X1" when searching for "1.1" (dot is escaped)', () => {
    const source = '<block id="1X1" name="Role">content</block>';
    expect(() => extractBlock(source, 'block', '1.1')).toThrow();
  });

  // --- Criterion-specific tests ---

  it('extracts a criterion with name attribute, skipping self-closing summary', () => {
    const source = `
<criterion id="B1" weight_pct="25" max_points="25"/>
<criterion id="B1" name="Team Quality" weight_pct="25" max_points="25">
  <purpose>Evaluates team.</purpose>
</criterion>`;
    const result = extractBlock(source, 'criterion', 'B1');
    expect(result).toContain('name="Team Quality"');
    expect(result).toContain('<purpose>');
    expect(result).toContain('</criterion>');
  });

  it('skips self-closing criterion tags without name attribute', () => {
    const source = `<criterion id="A1" weight_pct="24" max_points="24"/>`;
    expect(() => extractBlock(source, 'criterion', 'A1')).toThrow();
  });

  it('handles criterion attributes containing forward slashes', () => {
    const source = `
<criterion id="B2" weight_pct="19" max_points="19"/>
<criterion id="B2" name="Scientific Foundation" weight_pct="19" max_points="19" status="Revised — 42 Genetics Finding C-3/S-2">
  <purpose>Evaluates scientific foundation.</purpose>
</criterion>`;
    const result = extractBlock(source, 'criterion', 'B2');
    expect(result).toContain('name="Scientific Foundation"');
    expect(result).toContain('C-3/S-2');
    expect(result).toContain('</criterion>');
  });

  it('handles multiple forward slashes in attribute values', () => {
    const source = `
<criterion id="X1" name="Test Criterion" status="A/B/C revision">
  <purpose>Content.</purpose>
</criterion>`;
    const result = extractBlock(source, 'criterion', 'X1');
    expect(result).toContain('A/B/C revision');
  });

  it('does not match a non-criterion self-closing tag (non-criterion tags use simpler regex)', () => {
    // Non-criterion regex uses [^>]* which matches self-closing tags too.
    // This is expected — only criterion tags need the self-closing guard.
    const source = `<output_block id="R0" name="Plan">content</output_block>`;
    const result = extractBlock(source, 'output_block', 'R0');
    expect(result).toContain('content');
  });
});

// ---------------------------------------------------------------------------
// extractSections
// ---------------------------------------------------------------------------

describe('extractSections', () => {
  const source = `
<section id="1" name="Role">Role content</section>
<section id="2" name="Classification">Classification content</section>
<section id="3" name="Scarcity">Scarcity content</section>
<section id="4" name="Routing">Routing content</section>
<section id="5" name="Output">Output content</section>`;

  it('extracts a single section', () => {
    const result = extractSections(source, ['2']);
    expect(result).toContain('Classification content');
    expect(result).not.toContain('Role content');
  });

  it('extracts multiple sections joined with double newlines', () => {
    const result = extractSections(source, ['1', '2']);
    expect(result).toContain('Role content');
    expect(result).toContain('Classification content');
    expect(result.indexOf('</section>\n\n<section')).toBeGreaterThan(-1);
  });

  it('preserves order of requested ids', () => {
    const result = extractSections(source, ['3', '1']);
    const idx3 = result.indexOf('Scarcity content');
    const idx1 = result.indexOf('Role content');
    expect(idx3).toBeLessThan(idx1);
  });

  it('throws if any requested section is missing', () => {
    expect(() => extractSections(source, ['1', '99'])).toThrow();
  });
});
