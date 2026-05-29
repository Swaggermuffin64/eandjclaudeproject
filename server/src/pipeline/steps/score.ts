import type { PipelineEmitter, ScoreInput, ScoreOutput } from '../types.js';
import { callOpus } from '../claude/client.js';
import { getRubricPrompt } from '../prompts/loader.js';

export async function runScore(input: ScoreInput, emitter: PipelineEmitter): Promise<ScoreOutput> {
  const rubricPrompt = getRubricPrompt(input.rubric);

  const userMessage = `Here is the completed research dossier to evaluate:

<research_dossier>
${input.dossier}
</research_dossier>

Score this company according to the rubric. Follow the routing logic to assign the correct profile (A or B), run the disqualifier screen, score all criteria, and produce the complete 7-block standardized scoring output as specified in Section 5 of the rubric.`;

  const response = await callOpus({
    systemPrompt: rubricPrompt,
    userContent: userMessage,
    emitter,
    step: 'score',
    maxTokens: 16384,
  });

  return { score: response };
}
