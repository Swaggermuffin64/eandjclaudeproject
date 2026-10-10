import { toFile } from '@anthropic-ai/sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { findSourceDocumentFormat } from '@shared/types/source-document-formats.js';
import type { SourceDocument, UploadedSourceDocument } from '../types.js';
import { getClient } from './client.js';
import { extractOfficeDocumentText } from './office-document-text.js';

/**
 * Owns every Anthropic Files API call for source documents.
 *
 * The orchestrator uploads each document once at the start of a run, steps reference
 * the upload by file id instead of resending the bytes, and the orchestrator deletes
 * the uploads when they are no longer needed. Sending bytes inline is what used to
 * push large PDFs past the API's request size limit.
 */

/**
 * How long an upload lives if it is never deleted. Normal cleanup is the explicit
 * delete; this only catches files left behind by a crashed run.
 */
const UPLOAD_EXPIRY_SECONDS = 3600;

/**
 * Uploads one source document to the Files API and returns a reference to it.
 *
 * PDFs, images and plain-text files are uploaded as they are. Office files are
 * converted to plain text first, because the model cannot read them directly.
 * Throws when the file's format is not supported or its text cannot be extracted.
 */
export async function uploadSourceDocument(document: SourceDocument): Promise<UploadedSourceDocument> {
  const { filename, content } = document;
  const format = findSourceDocumentFormat(filename);
  if (!format) {
    throw new Error(`"${filename}" is not a supported file format`);
  }

  const isOfficeDocument = format.kind === 'office';
  const uploadContent = isOfficeDocument
    ? Buffer.from(await extractOfficeDocumentText(content, filename), 'utf-8')
    : content;
  const uploadFilename = isOfficeDocument ? `${filename}.txt` : filename;

  const uploadedFile = await getClient().files.upload({
    file: await toFile(uploadContent, uploadFilename, { type: format.uploadMimeType }),
    expires_in_seconds: UPLOAD_EXPIRY_SECONDS,
  });

  return { fileId: uploadedFile.id, filename, kind: format.kind };
}

/**
 * Builds the content block that lets a prompt reference an uploaded source document:
 * an image block for images, and a document block titled with the original filename
 * for everything else.
 */
export function buildSourceDocumentBlock(
  uploaded: UploadedSourceDocument,
): Anthropic.DocumentBlockParam | Anthropic.ImageBlockParam {
  if (uploaded.kind === 'image') {
    return { type: 'image', source: { type: 'file', file_id: uploaded.fileId } };
  }
  return {
    type: 'document',
    source: { type: 'file', file_id: uploaded.fileId },
    title: uploaded.filename,
  };
}

/**
 * Deletes uploaded source documents from the Files API.
 *
 * A failed delete is logged and never thrown, so cleanup cannot hide the result of
 * the pipeline run. Any file that survives expires on its own.
 */
export async function deleteSourceDocuments(fileIds: string[]): Promise<void> {
  await Promise.all(
    fileIds.map(async (fileId) => {
      try {
        await getClient().files.delete(fileId);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.error(`[source-documents] Could not delete uploaded file ${fileId}: ${reason}`);
      }
    }),
  );
}
