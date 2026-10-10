import {
  findSourceDocumentFormat,
  ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS,
} from '@shared/types/source-document-formats';

/** The file input's `accept` attribute: every extension the pipeline can read. */
export const SOURCE_DOCUMENT_ACCEPT_ATTRIBUTE = ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS.join(',');

/**
 * Returns only the files the pipeline can read, in their original order.
 *
 * FileUpload uses this for both drag-and-drop and the file picker, so unsupported
 * files are dropped in the browser. The server checks the same shared format list.
 */
export function keepAcceptedSourceDocuments(files: File[]): File[] {
  return files.filter((file) => findSourceDocumentFormat(file.name) !== undefined);
}
