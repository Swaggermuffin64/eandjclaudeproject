import type { PipelineEmitter, DossierInput, DossierOutput } from '../types.js';
import { callOpus } from '../claude/client.js';
import { getResearchDossierTemplate } from '../prompts/loader.js';

export async function runDossier(input: DossierInput, emitter: PipelineEmitter): Promise<DossierOutput> {
  const dossierTemplate = getResearchDossierTemplate();

  const userMessage = `Here are the prepared operator inputs for this company evaluation:

<operator_inputs>
${input.filledTemplate}
</operator_inputs>

Produce the complete research dossier (blocks R0 through R8) following the template instructions exactly. Use the web_search tool to verify claims, research founders, check patents, validate customer relationships, and gather competitive intelligence as the template requires.`;

  const response = await callOpus({
    systemPrompt: dossierTemplate,
    userContent: userMessage,
    emitter,
    step: 'dossier',
    tools: [
      {
        type: 'web_search' as const,
        name: 'web_search',
        max_uses: 50,
      } as unknown as import('@anthropic-ai/sdk').Tool,
    ],
    maxTokens: 32768,
  });

  return { dossier: response };
}
