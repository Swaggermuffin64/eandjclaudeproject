import { OfficeParser } from 'officeparser';

/** The Office formats whose text can be extracted, keyed by lowercase file extension. */
const OFFICE_FILE_TYPE_BY_EXTENSION: Record<string, 'docx' | 'xlsx' | 'pptx'> = {
  '.docx': 'docx',
  '.xlsx': 'xlsx',
  '.pptx': 'pptx',
};

/**
 * Returns the plain text of a Word (.docx), Excel (.xlsx) or PowerPoint (.pptx) file.
 *
 * The model cannot read Office files directly, so source-document-files.ts calls this
 * to turn an Office upload into text before sending it to the Files API. Only text is
 * kept: charts, images and slide layouts in the original are lost.
 *
 * Throws an error naming the file when it is not an Office file, cannot be read
 * (for example corrupt or password-protected), or contains no text.
 */
export async function extractOfficeDocumentText(content: Buffer, filename: string): Promise<string> {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const fileType = OFFICE_FILE_TYPE_BY_EXTENSION[extension];
  if (!fileType) {
    throw new Error(`"${filename}" is not a Word, Excel or PowerPoint file`);
  }

  let text: string;
  try {
    const parsedDocument = await OfficeParser.parseOffice(content, { fileType });
    const { value } = await parsedDocument.to('text');
    text = value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read text from "${filename}": ${reason}`);
  }

  if (text.trim() === '') {
    throw new Error(`"${filename}" contains no text`);
  }
  return text;
}
