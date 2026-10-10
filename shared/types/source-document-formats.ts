/**
 * The single list of file formats the pipeline accepts as source documents.
 *
 * The server uses it to validate uploads and to decide how each file is sent to
 * the Anthropic Files API; the client uses it to filter the file picker. Keeping
 * one list here stops the two sides from drifting apart.
 */

/**
 * How a source document reaches the model:
 * - `pdf`: uploaded as a PDF and read with its visuals.
 * - `image`: uploaded as an image.
 * - `plain-text`: already text, uploaded as plain text.
 * - `office`: text is extracted on the server, then uploaded as plain text.
 */
export type SourceDocumentKind = 'pdf' | 'image' | 'plain-text' | 'office';

/** One accepted file format. */
export interface SourceDocumentFormat {
  /** Lowercase file extension, including the leading dot. */
  extension: string;
  kind: SourceDocumentKind;
  /** The MIME type the file is uploaded to the Files API as. */
  uploadMimeType: string;
}

export const SOURCE_DOCUMENT_FORMATS: readonly SourceDocumentFormat[] = [
  { extension: '.pdf', kind: 'pdf', uploadMimeType: 'application/pdf' },
  { extension: '.jpg', kind: 'image', uploadMimeType: 'image/jpeg' },
  { extension: '.jpeg', kind: 'image', uploadMimeType: 'image/jpeg' },
  { extension: '.png', kind: 'image', uploadMimeType: 'image/png' },
  { extension: '.gif', kind: 'image', uploadMimeType: 'image/gif' },
  { extension: '.webp', kind: 'image', uploadMimeType: 'image/webp' },
  { extension: '.txt', kind: 'plain-text', uploadMimeType: 'text/plain' },
  { extension: '.csv', kind: 'plain-text', uploadMimeType: 'text/plain' },
  { extension: '.md', kind: 'plain-text', uploadMimeType: 'text/plain' },
  { extension: '.docx', kind: 'office', uploadMimeType: 'text/plain' },
  { extension: '.xlsx', kind: 'office', uploadMimeType: 'text/plain' },
  { extension: '.pptx', kind: 'office', uploadMimeType: 'text/plain' },
];

/** Every accepted extension, for the file input's `accept` attribute and for error messages. */
export const ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS: readonly string[] = SOURCE_DOCUMENT_FORMATS.map(
  (format) => format.extension,
);

/**
 * Returns the format for a filename, judged by its extension, or `undefined` when
 * the extension is not accepted. The extension is used rather than the browser's
 * MIME type because browsers report unreliable types for `.csv` and `.md` files.
 */
export function findSourceDocumentFormat(filename: string): SourceDocumentFormat | undefined {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return undefined;

  const extension = filename.slice(lastDot).toLowerCase();
  return SOURCE_DOCUMENT_FORMATS.find((format) => format.extension === extension);
}
