import { describe, it, expect } from 'vitest';
import { keepAcceptedSourceDocuments, SOURCE_DOCUMENT_ACCEPT_ATTRIBUTE } from '../accepted-source-documents';

// Tests for the upload filter: files the pipeline cannot read are dropped in the
// browser, before they are ever sent to the server.

function fileNamed(name: string): File {
  return new File(['content'], name);
}

describe('keepAcceptedSourceDocuments', () => {
  it('keeps PDFs, images, plain-text files and Office files', () => {
    const files = ['deck.pdf', 'shot.png', 'data.csv', 'memo.docx', 'model.xlsx', 'deck.pptx'].map(fileNamed);

    expect(keepAcceptedSourceDocuments(files).map((file) => file.name)).toEqual([
      'deck.pdf', 'shot.png', 'data.csv', 'memo.docx', 'model.xlsx', 'deck.pptx',
    ]);
  });

  it('drops files in unsupported formats and keeps the rest in order', () => {
    const files = ['deck.pdf', 'old.doc', 'archive.zip', 'notes.md'].map(fileNamed);

    expect(keepAcceptedSourceDocuments(files).map((file) => file.name)).toEqual(['deck.pdf', 'notes.md']);
  });

  it('accepts a file whose browser MIME type is empty, judging by extension', () => {
    const markdown = new File(['# notes'], 'notes.md', { type: '' });

    expect(keepAcceptedSourceDocuments([markdown])).toEqual([markdown]);
  });
});

describe('SOURCE_DOCUMENT_ACCEPT_ATTRIBUTE', () => {
  it('is a comma-separated extension list usable as an input accept attribute', () => {
    const extensions = SOURCE_DOCUMENT_ACCEPT_ATTRIBUTE.split(',');

    expect(extensions).toContain('.pdf');
    expect(extensions).toContain('.docx');
    expect(extensions.every((extension) => extension.startsWith('.'))).toBe(true);
  });
});
