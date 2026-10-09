// Tests for the score step's routing_result tag parsing logic.
// This logic lives inline in runRouting (score/sub-steps.ts:55-60).

describe('routing_result tag parsing', () => {
  const tagPattern = /<routing_result\s+profile="([AB])"\s+disqualified="(true|false)"\s*\/>/;

  function parseRoutingResult(response: string) {
    const match = response.match(tagPattern);
    const profile: 'A' | 'B' = match ? (match[1] as 'A' | 'B') : 'B';
    const disqualified: boolean = match ? match[2] === 'true' : false;
    const text = response.replace(tagPattern, '').trimEnd();
    return { text, profile, disqualified };
  }

  it('parses profile A, not disqualified', () => {
    const response = 'Some evaluation text.\n<routing_result profile="A" disqualified="false"/>';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('A');
    expect(result.disqualified).toBe(false);
    expect(result.text).toBe('Some evaluation text.');
  });

  it('parses profile B, disqualified', () => {
    const response = 'Evaluation.\n<routing_result profile="B" disqualified="true"/>';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('B');
    expect(result.disqualified).toBe(true);
  });

  it('removes the tag from the text output', () => {
    const response = 'Block 0 content.\n\nBlock 1 content.\n<routing_result profile="A" disqualified="false"/>';
    const result = parseRoutingResult(response);
    expect(result.text).not.toContain('routing_result');
    expect(result.text).toContain('Block 0 content.');
    expect(result.text).toContain('Block 1 content.');
  });

  it('defaults to profile B when tag is missing', () => {
    const response = 'Claude did not produce the tag.';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('B');
    expect(result.disqualified).toBe(false);
  });

  it('defaults to profile B when tag is malformed', () => {
    const response = 'Text.\n<routing_result profile="C" disqualified="false"/>';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('B');
  });

  it('handles extra whitespace in the tag', () => {
    const response = '<routing_result  profile="A"  disqualified="true"  />';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('A');
    expect(result.disqualified).toBe(true);
  });

  it('handles tag without trailing space before />', () => {
    const response = '<routing_result profile="B" disqualified="false"/>';
    const result = parseRoutingResult(response);
    expect(result.profile).toBe('B');
    expect(result.disqualified).toBe(false);
  });

  it('does not match tag with wrong attribute order', () => {
    const response = '<routing_result disqualified="false" profile="A"/>';
    const result = parseRoutingResult(response);
    // Regex expects profile first — this won't match
    expect(result.profile).toBe('B'); // default
  });

  it('trims trailing whitespace from text', () => {
    const response = 'Content.   \n\n  \n<routing_result profile="A" disqualified="false"/>';
    const result = parseRoutingResult(response);
    expect(result.text).toBe('Content.');
  });
});
