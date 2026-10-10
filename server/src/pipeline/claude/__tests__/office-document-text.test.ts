import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractOfficeDocumentText } from '../office-document-text.js';

// Tests for turning Word, Excel and PowerPoint uploads into plain text.
// The fixtures are tiny hand-built Office files whose text is known exactly,
// so these run the real extraction library rather than a mock.

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function readFixture(filename: string): Buffer {
  return readFileSync(path.join(FIXTURES_DIR, filename));
}

describe('extractOfficeDocumentText', () => {
  it('extracts the paragraphs of a Word document', async () => {
    const text = await extractOfficeDocumentText(readFixture('memo.docx'), 'memo.docx');

    expect(text).toContain('Acme Robotics investor memo');
    expect(text).toContain('Founded in 2021 by Dana Reyes.');
  });

  it('extracts the cell values of an Excel workbook', async () => {
    const text = await extractOfficeDocumentText(readFixture('model.xlsx'), 'model.xlsx');

    expect(text).toContain('Year');
    expect(text).toContain('Revenue');
    expect(text).toContain('2024');
    expect(text).toContain('1250000');
  });

  it('extracts the slide text of a PowerPoint deck', async () => {
    const text = await extractOfficeDocumentText(readFixture('deck.pptx'), 'deck.pptx');

    expect(text).toContain('Series A pitch: Acme Robotics');
  });

  it('reads the format from an uppercase extension', async () => {
    const text = await extractOfficeDocumentText(readFixture('memo.docx'), 'MEMO.DOCX');

    expect(text).toContain('Acme Robotics investor memo');
  });

  it('names the file when it cannot be read', async () => {
    await expect(
      extractOfficeDocumentText(readFixture('corrupt.docx'), 'corrupt.docx'),
    ).rejects.toThrow(/Could not read text from "corrupt\.docx"/);
  });

  it('names the file when it contains no text', async () => {
    await expect(
      extractOfficeDocumentText(readFixture('empty.docx'), 'empty.docx'),
    ).rejects.toThrow(/"empty\.docx" contains no text/);
  });

  it('rejects a file that is not a Word, Excel or PowerPoint file', async () => {
    await expect(
      extractOfficeDocumentText(Buffer.from('plain text'), 'notes.txt'),
    ).rejects.toThrow(/"notes\.txt" is not a Word, Excel or PowerPoint file/);
  });
});
