import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import type Anthropic from '@anthropic-ai/sdk';
import type { UploadedSourceDocument } from '../../types.js';

// Tests for the template step, which reads the uploaded source documents and
// produces the operator inputs. callSonnet is mocked so no Claude call is made;
// the tests check what the step sends and what it returns.

interface SonnetCallOptions {
  systemPrompt: string;
  userContent: Anthropic.ContentBlockParam[];
  step: string;
}

const callSonnetMock = jest.fn<(options: SonnetCallOptions) => Promise<string>>();

jest.unstable_mockModule('../../claude/client.js', () => ({
  callSonnet: callSonnetMock,
  getClient: () => {
    throw new Error('the template step must not call the Files API itself');
  },
}));

const { runTemplate } = await import('../template.js');

const PRIMARY_PDF: UploadedSourceDocument = { fileId: 'file_primary', filename: 'deck.pdf', kind: 'pdf' };
const OFFICE_MEMO: UploadedSourceDocument = { fileId: 'file_memo', filename: 'memo.docx', kind: 'office' };
const SCREENSHOT: UploadedSourceDocument = { fileId: 'file_shot', filename: 'traction.png', kind: 'image' };

/** Runs the step and returns the user content blocks it sent to Claude. */
async function userContentSentFor(
  primaryDocument: UploadedSourceDocument,
  supplementaryDocuments: UploadedSourceDocument[],
): Promise<Anthropic.ContentBlockParam[]> {
  await runTemplate({ primaryDocument, supplementaryDocuments }, new EventEmitter());
  return callSonnetMock.mock.calls[0][0].userContent;
}

/** The text of the block directly before the block that references `fileId`. */
function labelBefore(blocks: Anthropic.ContentBlockParam[], fileId: string): string {
  const index = blocks.findIndex(
    (block) =>
      (block.type === 'document' || block.type === 'image') &&
      block.source.type === 'file' &&
      block.source.file_id === fileId,
  );
  const label = blocks[index - 1];
  if (!label || label.type !== 'text') {
    throw new Error(`no text label directly before the block for ${fileId}`);
  }
  return label.text;
}

beforeEach(() => {
  callSonnetMock.mockReset();
  callSonnetMock.mockResolvedValue('OI-1 ... OI-2 ... OI-3 ...');
});

describe('runTemplate', () => {
  it('returns the model response as the filled template', async () => {
    const result = await runTemplate(
      { primaryDocument: PRIMARY_PDF, supplementaryDocuments: [] },
      new EventEmitter(),
    );

    expect(result).toEqual({ filledTemplate: 'OI-1 ... OI-2 ... OI-3 ...' });
  });

  it('references every document by file id, primary first', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO, SCREENSHOT]);

    const referencedFileIds = blocks.flatMap((block) =>
      (block.type === 'document' || block.type === 'image') && block.source.type === 'file'
        ? [block.source.file_id]
        : [],
    );
    expect(referencedFileIds).toEqual(['file_primary', 'file_memo', 'file_shot']);
  });

  it('never sends document bytes inline', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO, SCREENSHOT]);

    const inlineBlocks = blocks.filter(
      (block) => (block.type === 'document' || block.type === 'image') && block.source.type !== 'file',
    );
    expect(inlineBlocks).toEqual([]);
  });

  it('labels the primary document with its filename', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO]);

    expect(labelBefore(blocks, 'file_primary')).toBe('PRIMARY DOCUMENT (deck.pdf):');
  });

  it('numbers supplementary documents from 1 and labels them with their filenames', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO, SCREENSHOT]);

    expect(labelBefore(blocks, 'file_memo')).toContain('SUPPLEMENTARY DOCUMENT 1 (memo.docx)');
    expect(labelBefore(blocks, 'file_shot')).toBe('SUPPLEMENTARY DOCUMENT 2 (traction.png):');
  });

  it('tells the model an Office document is a text-only extraction', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO]);

    expect(labelBefore(blocks, 'file_memo')).toContain('text-only extraction');
    expect(labelBefore(blocks, 'file_primary')).not.toContain('text-only extraction');
  });

  it('sends an image document as an image block', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [SCREENSHOT]);

    const imageBlocks = blocks.filter((block) => block.type === 'image');
    expect(imageBlocks).toEqual([{ type: 'image', source: { type: 'file', file_id: 'file_shot' } }]);
  });

  it('ends with the instruction, after every document', async () => {
    const blocks = await userContentSentFor(PRIMARY_PDF, [OFFICE_MEMO]);

    const lastBlock = blocks[blocks.length - 1];
    expect(lastBlock.type === 'text' && lastBlock.text).toContain('OI-1, OI-2, OI-3');
  });

  it('runs as the template step', async () => {
    await runTemplate({ primaryDocument: PRIMARY_PDF, supplementaryDocuments: [] }, new EventEmitter());

    expect(callSonnetMock.mock.calls[0][0].step).toBe('template');
  });
});
