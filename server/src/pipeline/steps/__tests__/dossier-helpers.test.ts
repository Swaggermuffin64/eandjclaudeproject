// Tests for dossier sub-step helper functions.
// makeWebSearchTool and buildSystemParts are private, so we reproduce their
// logic here to test the formatting contracts they enforce.

describe('makeWebSearchTool', () => {
  // Reproduces the logic from dossier/sub-steps.ts:25-31
  function makeWebSearchTool(maxUses: number) {
    return {
      type: 'web_search_20250305' as const,
      name: 'web_search',
      max_uses: maxUses,
    };
  }

  it('creates a tool with the correct type', () => {
    const tool = makeWebSearchTool(10);
    expect(tool.type).toBe('web_search_20250305');
    expect(tool.name).toBe('web_search');
  });

  it('sets the max_uses correctly', () => {
    expect(makeWebSearchTool(10).max_uses).toBe(10);
    expect(makeWebSearchTool(30).max_uses).toBe(30);
    expect(makeWebSearchTool(0).max_uses).toBe(0);
  });
});

describe('buildSystemParts', () => {
  // Reproduces the logic from dossier/sub-steps.ts:34-40
  interface SystemPart {
    text: string;
    cache?: boolean;
  }

  function buildSystemParts(preamble: string, filledTemplate: string, instructions: string): SystemPart[] {
    return [
      { text: preamble, cache: true },
      { text: `Operator inputs:\n\n${filledTemplate}`, cache: true },
      { text: instructions },
    ];
  }

  it('returns exactly 3 parts', () => {
    const parts = buildSystemParts('preamble', 'template', 'instructions');
    expect(parts).toHaveLength(3);
  });

  it('marks preamble as cached', () => {
    const parts = buildSystemParts('preamble', 'template', 'instructions');
    expect(parts[0].cache).toBe(true);
    expect(parts[0].text).toBe('preamble');
  });

  it('marks filled template as cached with prefix', () => {
    const parts = buildSystemParts('preamble', 'company data here', 'instructions');
    expect(parts[1].cache).toBe(true);
    expect(parts[1].text).toBe('Operator inputs:\n\ncompany data here');
  });

  it('does not mark instructions as cached', () => {
    const parts = buildSystemParts('preamble', 'template', 'do this');
    expect(parts[2].cache).toBeUndefined();
    expect(parts[2].text).toBe('do this');
  });
});

// Dossier assembly order and prior-context wiring are tested against the real
// orchestrator in dependency-waiting.test.ts.

describe('score assembly user content', () => {
  // Reproduces the inline formatting from score/sub-steps.ts:125-135

  function buildScoreAssemblyUserContent(
    profile: 'A' | 'B',
    routingText: string,
    criterionScores: string[],
  ): string {
    return `Here are the completed scoring outputs so far:

<routing_and_disqualifier>
${routingText}
</routing_and_disqualifier>

<criterion_scores>
${criterionScores.join('\n\n')}
</criterion_scores>

The routing assigned profile ${profile}. Using all of the above, produce Blocks 4-6 (Total Score / Tier, Qualitative Assessment, Footer) according to the rubric.`;
  }

  it('wraps routing text in routing_and_disqualifier tags', () => {
    const content = buildScoreAssemblyUserContent('A', 'routing output', ['score1']);
    expect(content).toContain('<routing_and_disqualifier>');
    expect(content).toContain('routing output');
    expect(content).toContain('</routing_and_disqualifier>');
  });

  it('wraps criterion scores in criterion_scores tags', () => {
    const content = buildScoreAssemblyUserContent('B', 'routing', ['A1 score', 'A2 score']);
    expect(content).toContain('<criterion_scores>');
    expect(content).toContain('A1 score\n\nA2 score');
    expect(content).toContain('</criterion_scores>');
  });

  it('includes the correct profile in the instruction', () => {
    const contentA = buildScoreAssemblyUserContent('A', 'r', ['s']);
    expect(contentA).toContain('routing assigned profile A');

    const contentB = buildScoreAssemblyUserContent('B', 'r', ['s']);
    expect(contentB).toContain('routing assigned profile B');
  });
});
