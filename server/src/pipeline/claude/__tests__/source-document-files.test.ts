import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Tests for uploading source documents to the Anthropic Files API and referencing
// them from prompts. The Anthropic client is replaced with a fake so no network
// calls are made; Office text extraction runs for real against a fixture.

interface UploadParams {
  file: File;
  expires_in_seconds?: number;
}

const uploadMock = jest.fn<(params: UploadParams) => Promise<{ id: string }>>();
const deleteMock = jest.fn<(fileId: string) => Promise<unknown>>();

jest.unstable_mockModule('../client.js', () => ({
  getClient: () => ({ files: { upload: uploadMock, delete: deleteMock } }),
}));

const { uploadSourceDocument, buildSourceDocumentBlock, deleteSourceDocuments } = await import(
  '../source-document-files.js'
);

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** The single argument the fake upload was called with. */
function uploadedParams(): UploadParams {
  expect(uploadMock).toHaveBeenCalledTimes(1);
  return uploadMock.mock.calls[0][0];
}

beforeEach(() => {
  uploadMock.mockReset();
  deleteMock.mockReset();
  uploadMock.mockResolvedValue({ id: 'file_abc' });
  deleteMock.mockResolvedValue({});
});

describe('uploadSourceDocument', () => {
  it('uploads a PDF unchanged and returns its file id, filename and kind', async () => {
    const uploaded = await uploadSourceDocument({
      filename: 'deck.pdf',
      content: Buffer.from('%PDF-fake'),
    });

    expect(uploaded).toEqual({ fileId: 'file_abc', filename: 'deck.pdf', kind: 'pdf' });
    const { file } = uploadedParams();
    expect(file.name).toBe('deck.pdf');
    expect(file.type).toBe('application/pdf');
    expect(await file.text()).toBe('%PDF-fake');
  });

  it('uploads an image with its image MIME type', async () => {
    const uploaded = await uploadSourceDocument({
      filename: 'slide.PNG',
      content: Buffer.from('png-bytes'),
    });

    expect(uploaded.kind).toBe('image');
    expect(uploadedParams().file.type).toBe('image/png');
  });

  it('uploads a CSV as plain text', async () => {
    const uploaded = await uploadSourceDocument({
      filename: 'financials.csv',
      content: Buffer.from('year,revenue\n2024,1250000'),
    });

    expect(uploaded.kind).toBe('plain-text');
    const { file } = uploadedParams();
    expect(file.type).toBe('text/plain');
    expect(await file.text()).toBe('year,revenue\n2024,1250000');
  });

  it('uploads the extracted text of an Office file, not its raw bytes', async () => {
    const uploaded = await uploadSourceDocument({
      filename: 'memo.docx',
      content: readFileSync(path.join(FIXTURES_DIR, 'memo.docx')),
    });

    expect(uploaded).toEqual({ fileId: 'file_abc', filename: 'memo.docx', kind: 'office' });
    const { file } = uploadedParams();
    expect(file.type).toBe('text/plain');
    expect(file.name).toBe('memo.docx.txt');
    expect(await file.text()).toContain('Acme Robotics investor memo');
  });

  it('sets a one-hour expiry so a crashed run does not leave files behind', async () => {
    await uploadSourceDocument({ filename: 'deck.pdf', content: Buffer.from('x') });

    expect(uploadedParams().expires_in_seconds).toBe(3600);
  });

  it('rejects an unsupported format without uploading anything', async () => {
    await expect(
      uploadSourceDocument({ filename: 'old.doc', content: Buffer.from('x') }),
    ).rejects.toThrow(/"old\.doc" is not a supported file format/);

    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe('buildSourceDocumentBlock', () => {
  it('references a PDF as a document block titled with its filename', () => {
    const block = buildSourceDocumentBlock({ fileId: 'file_1', filename: 'deck.pdf', kind: 'pdf' });

    expect(block).toEqual({
      type: 'document',
      source: { type: 'file', file_id: 'file_1' },
      title: 'deck.pdf',
    });
  });

  it('references an image as an image block', () => {
    const block = buildSourceDocumentBlock({ fileId: 'file_2', filename: 'slide.png', kind: 'image' });

    expect(block).toEqual({ type: 'image', source: { type: 'file', file_id: 'file_2' } });
  });

  it.each(['plain-text', 'office'] as const)('references a %s file as a document block', (kind) => {
    const block = buildSourceDocumentBlock({ fileId: 'file_3', filename: 'notes.txt', kind });

    expect(block.type).toBe('document');
  });
});

describe('deleteSourceDocuments', () => {
  it('deletes every file id', async () => {
    await deleteSourceDocuments(['file_1', 'file_2']);

    expect(deleteMock.mock.calls.map((call) => call[0])).toEqual(['file_1', 'file_2']);
  });

  it('does not throw when a delete fails, and still deletes the others', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    deleteMock.mockRejectedValueOnce(new Error('network down'));

    await expect(deleteSourceDocuments(['file_1', 'file_2'])).resolves.toBeUndefined();

    expect(deleteMock.mock.calls.map((call) => call[0])).toEqual(['file_1', 'file_2']);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('file_1'));
    consoleError.mockRestore();
  });
});
