import Anthropic from '@anthropic-ai/sdk';
import type { PipelineStepName } from '@shared/types/pipeline.js';
import { emitTextDelta, emitToolCall, emitToolResult, type PipelineEmitter } from '../types.js';

const SONNET_MODEL = 'claude-sonnet-4-6';
const OPUS_MODEL = 'claude-opus-4-6';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface SystemPart {
  text: string;
  cache?: boolean;
}

export interface ClaudeCallOptions {
  /** Simple string system prompt (no caching). */
  systemPrompt?: string;
  /** Structured system prompt with per-part cache control. Takes precedence over systemPrompt. */
  systemParts?: SystemPart[];
  userContent: Anthropic.MessageCreateParams['messages'][0]['content'];
  emitter: PipelineEmitter;
  step: PipelineStepName;
  tools?: Anthropic.Tool[];
  maxTokens?: number;
  subcall?: string;
}

function buildSystemParam(options: ClaudeCallOptions): string | Anthropic.TextBlockParam[] {
  if (options.systemParts) {
    return options.systemParts.map((part) => ({
      type: 'text' as const,
      text: part.text,
      ...(part.cache ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
  }
  return options.systemPrompt ?? '';
}

export async function callSonnet(options: ClaudeCallOptions): Promise<string> {
  return callModel(SONNET_MODEL, options);
}

export async function callOpus(options: ClaudeCallOptions): Promise<string> {
  return callModel(OPUS_MODEL, options);
}

async function callModel(model: string, options: ClaudeCallOptions): Promise<string> {
  const { userContent, emitter, step, tools, maxTokens = 16384, subcall } = options;
  const anthropic = getClient();
  const system = buildSystemParam(options);

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userContent },
  ];

  let fullResponse = '';

  while (true) {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      system,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
    });

    const toolUseBlocks: Array<{ id: string; name: string; input: unknown }> = [];
    let currentText = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          currentText += event.delta.text;
          emitTextDelta(emitter, step, event.delta.text, subcall);
        }
      } else if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          toolUseBlocks.push({
            id: event.content_block.id,
            name: event.content_block.name,
            input: {},
          });
        }
      } else if (event.type === 'content_block_stop') {
        // tool_use input is accumulated by the SDK
      }
    }

    const finalMessage = await stream.finalMessage();
    fullResponse += currentText;

    // Check if there are tool use blocks in the final message
    const toolBlocks = finalMessage.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );

    if (toolBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
      break;
    }

    // Process tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolBlock of toolBlocks) {
      const inputStr = typeof toolBlock.input === 'string'
        ? toolBlock.input
        : JSON.stringify(toolBlock.input);
      emitToolCall(emitter, step, toolBlock.name, inputStr, subcall);

      // For server-side tools like web_search, the API handles them internally.
      // For tools that need client-side execution, we'd handle them here.
      // Currently we rely on Claude's built-in web_search tool which is server-side.
      const resultContent = `Tool ${toolBlock.name} executed by API`;
      emitToolResult(emitter, step, toolBlock.name, resultContent, subcall);

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolBlock.id,
        content: resultContent,
      });
    }

    // Add assistant message and tool results to conversation for next turn
    messages.push({ role: 'assistant', content: finalMessage.content });
    messages.push({ role: 'user', content: toolResults });
  }

  return fullResponse;
}

export function buildPdfContentBlock(pdfBuffer: Buffer): Anthropic.DocumentBlockParam {
  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    },
  };
}
