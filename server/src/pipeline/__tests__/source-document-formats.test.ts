import {
  findSourceDocumentFormat,
  ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS,
} from '@shared/types/source-document-formats.js';

// Tests for the shared list of upload formats. The server uses it to validate
// uploads and pick the MIME type sent to the Files API; the client uses it to
// filter the file picker.

describe('findSourceDocumentFormat', () => {
  it.each([
    ['deck.pdf', 'pdf', 'application/pdf'],
    ['photo.jpg', 'image', 'image/jpeg'],
    ['photo.jpeg', 'image', 'image/jpeg'],
    ['slide.png', 'image', 'image/png'],
    ['anim.gif', 'image', 'image/gif'],
    ['slide.webp', 'image', 'image/webp'],
    ['notes.txt', 'plain-text', 'text/plain'],
    ['financials.csv', 'plain-text', 'text/plain'],
    ['readme.md', 'plain-text', 'text/plain'],
    ['memo.docx', 'office', 'text/plain'],
    ['model.xlsx', 'office', 'text/plain'],
    ['deck.pptx', 'office', 'text/plain'],
  ])('maps %s to kind %s uploaded as %s', (filename, kind, uploadMimeType) => {
    const format = findSourceDocumentFormat(filename);

    expect(format?.kind).toBe(kind);
    expect(format?.uploadMimeType).toBe(uploadMimeType);
  });

  it('ignores the case of the extension', () => {
    expect(findSourceDocumentFormat('DECK.PDF')?.kind).toBe('pdf');
  });

  it('uses only the last extension of a dotted filename', () => {
    expect(findSourceDocumentFormat('q3.report.final.docx')?.kind).toBe('office');
  });

  it.each(['old.doc', 'old.xls', 'old.ppt', 'archive.zip', 'program.exe', 'no-extension', ''])(
    'returns undefined for unsupported file %p',
    (filename) => {
      expect(findSourceDocumentFormat(filename)).toBeUndefined();
    },
  );

  it('does not treat a filename that merely ends in an extension name as that format', () => {
    expect(findSourceDocumentFormat('notapdf')).toBeUndefined();
  });
});

describe('ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS', () => {
  it('lists every accepted extension with its leading dot', () => {
    expect([...ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS].sort()).toEqual([
      '.csv', '.docx', '.gif', '.jpeg', '.jpg', '.md', '.pdf', '.png', '.pptx', '.txt', '.webp', '.xlsx',
    ]);
  });
});
