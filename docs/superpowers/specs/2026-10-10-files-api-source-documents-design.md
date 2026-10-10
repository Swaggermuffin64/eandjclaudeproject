# Files API Source Documents Design

## Overview

Large uploads fail with `413 request_too_large` from the Anthropic API. The server accepts PDFs up to 32 MB, then sends them inline as base64, which inflates them by about a third and pushes the request past the API's 32 MB limit.

This change uploads each source document once through the Anthropic Files API and references it by `file_id`. It removes the ingest step: the template step reads the documents directly and produces the operator inputs in one call. It also widens uploads from PDF-only to images, plain-text files and Office files.

## Goals

- A document up to the 32 MB upload cap runs through the pipeline without a 413.
- The template step works from the source documents, not from a text transcription that is capped at 16,384 output tokens and can be silently truncated.
- Uploaded files do not outlive the step that needs them.
- The pipeline accepts the file formats in the table below.

## Non-goals

- The dossier step, the score step and the score-only endpoint do not change. Dossier blocks keep working only from the filled template.
- No change to the 32 MB per-file upload cap.
- No model changes.
- No legacy binary Office formats (`.doc`, `.xls`, `.ppt`) and no OpenDocument formats.
- No conversion of Office files to PDF. Their charts, images and slide layouts are not seen by the model.

## Supported formats

| Extension | Kind | Sent to the Files API as | Content block |
|---|---|---|---|
| `.pdf` | PDF | `application/pdf` | `document` |
| `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp` | Image | its image MIME type | `image` |
| `.txt`, `.csv`, `.md` | Plain text | `text/plain` | `document` |
| `.docx`, `.xlsx`, `.pptx` | Office | text extracted on the server, then `text/plain` | `document` |

The kind is decided by file extension, because browsers report unreliable MIME types for `.csv` and `.md`.

## Current flow

1. `ingest` (Sonnet) receives the PDFs as base64 and returns `extractedText` and `entityManifest`.
2. `template` (Sonnet) receives both strings and returns `filledTemplate` (OI-1, OI-2, OI-3).
3. `dossier` (Opus, 15 blocks) receives `filledTemplate`.
4. `score` receives the dossier and a rubric.

Only ingest ever sees the PDFs.

## New flow

1. The route validates each uploaded file's extension and passes the documents to the orchestrator with their filenames.
2. The orchestrator prepares and uploads each document and gets one uploaded-document reference per file.
3. `template` (Sonnet) receives the references and returns `filledTemplate`.
4. The orchestrator deletes the uploaded files, whether the template step succeeded or failed.
5. `dossier` and `score` run as today.

## Components

### `shared/types/source-document-formats.ts` (new)

The single list of accepted formats, used by both the server and the client.

- `SourceDocumentKind = 'pdf' | 'image' | 'plain-text' | 'office'`.
- `SOURCE_DOCUMENT_FORMATS`: one entry per extension with its kind and the MIME type to upload it as.
- `findSourceDocumentFormat(filename)` returns the entry for a filename, or `undefined` when the extension is not accepted. Matching is case-insensitive.
- `ACCEPTED_SOURCE_DOCUMENT_EXTENSIONS`: the extension list, for the file input's `accept` attribute and for error messages.

### `server/src/pipeline/claude/office-document-text.ts` (new)

- `extractOfficeDocumentText(content: Buffer, filename: string): Promise<string>` returns the plain text of a `.docx`, `.xlsx` or `.pptx` file, using the `officeparser` package.
- It throws a clear error naming the file when extraction fails (for example a password-protected or corrupt file) or yields no text.

`officeparser` is chosen because one actively maintained MIT library covers all three formats. It is heavy (about 31 MB unpacked, and it pulls in `pdfjs-dist` and `tesseract.js`); its exact API is confirmed against its README during implementation.

### `server/src/pipeline/claude/source-document-files.ts` (new)

Owns every Files API call for source documents.

- `uploadSourceDocument(document: SourceDocument): Promise<UploadedSourceDocument>` looks up the format, extracts text first when the kind is `office`, uploads the bytes with the format's MIME type and `expires_in_seconds: 3600`, and returns `{ fileId, filename, kind }`. The expiry is a backstop for a crashed run; normal cleanup is the explicit delete.
- `buildSourceDocumentBlock(uploaded: UploadedSourceDocument)` returns an `image` block for the `image` kind and a `document` block for every other kind, each with `source: { type: 'file', file_id }`. Document blocks carry the original filename as `title`.
- `deleteSourceDocuments(fileIds: string[]): Promise<void>` deletes each file. A failed delete is logged and does not throw, so cleanup can never mask the pipeline's real result.

`getClient()` in `client.ts` is exported so this module shares the one Anthropic client.

### `server/src/pipeline/claude/client.ts`

- `buildPdfContentBlock` is removed. Nothing sends base64 PDFs any more.
- `callModel` is unchanged apart from anything the SDK upgrade requires.

### `server/src/pipeline/types.ts`

- `SourceDocument` is `{ filename: string; content: Buffer }`.
- `UploadedSourceDocument` is `{ fileId: string; filename: string; kind: SourceDocumentKind }`.
- `PipelineRunInput` becomes `{ primaryDocument: SourceDocument; supplementaryDocuments: SourceDocument[]; rubric }`.
- `IngestInput` and `IngestOutput` are removed.
- `TemplateInput` becomes `{ primaryDocument: UploadedSourceDocument; supplementaryDocuments: UploadedSourceDocument[] }`.

### `server/src/pipeline/steps/template.ts`

- The system prompt absorbs the 16-category entity manifest instructions from the ingest prompt, including the instruction to note the source page or section of each entity. It no longer asks for a full text extraction, and it says "documents" where it said "PDFs".
- The user content is a block array: the research dossier template for reference, then `PRIMARY DOCUMENT (<filename>):` and its block, then `SUPPLEMENTARY DOCUMENT n (<filename>):` and its block for each supplementary document, then the instruction to produce OI-1, OI-2 and OI-3.
- For a document of the `office` kind, the label adds that it is a text-only extraction and that charts and images from the original are not included, so the model does not treat missing visuals as missing information.
- The output is still `{ filledTemplate }`.

### `server/src/pipeline/steps/ingest.ts`

Deleted, along with `__tests__/ingest.test.ts`.

### `server/src/pipeline/orchestrator.ts`

- Emits `step:start` for `template`, uploads the documents, runs the template step, and deletes the files in a `finally`.
- Upload happens inside the template step's start and complete events, so an upload or extraction failure is reported like any other template failure.

### `server/src/routes/pipeline.ts`

- The multipart fields are renamed from `primaryPdf` and `supplementaryPdfs` to `primaryDocument` and `supplementaryDocuments`.
- Each file part keeps its filename alongside its bytes.
- A file whose extension is not in the accepted list is rejected with a 400 that names the file and lists the accepted extensions. Today only the browser checks the type.

### Client

- `shared/types/pipeline.ts`: `'ingest'` is removed from `PipelineStepName`.
- `client/src/components/FileUpload.tsx`: drag-and-drop and the file picker filter with `findSourceDocumentFormat`, the `accept` attribute comes from the shared list, and the copy says "documents" and lists the accepted types.
- `client/src/api/client.ts`: sends the renamed form fields, and attributes errors raised before the stream opens to `'template'`.
- `client/src/components/StepStatus.tsx`: three steps, renumbered Template, Dossier, Score.
- `client/src/hooks/usePipeline.ts`: `STEPS`, the initial step states and the score-only step states drop `ingest`.

### Dependencies

- `@anthropic-ai/sdk` moves from `^0.39.0` to `^0.133.0` in `server/package.json` to get the stable `client.files` namespace. Anything the upgrade breaks in the streaming loop or the web search tool definition is fixed as part of this work.
- `officeparser` is added to `server/package.json`.

## Error handling

- Unsupported extension: 400 from the route before the pipeline starts.
- Extraction failure or upload failure: the template step fails, the pipeline emits `pipeline:error`, and any files already uploaded are deleted.
- Template call failure: files are deleted, then the error propagates as today. This includes API rejections such as a text file too large for the context window, an image over the API's size limits, or an encrypted PDF.
- Delete failure: logged; the files expire after one hour.
- `file_id`s never leave the server. They are not sent to the browser and are never accepted from it, because uploaded files are readable by every API key in the workspace.

## Testing

- `source-document-formats`: each accepted extension maps to the right kind and MIME type, matching ignores case, and unknown or legacy extensions return `undefined`.
- `office-document-text`: small `.docx`, `.xlsx` and `.pptx` fixtures yield their known text; a corrupt file throws an error naming the file.
- `source-document-files`: upload sends the right MIME type and expiry for each kind and extracts text first for Office files; the block is an `image` block for images and a titled `document` block otherwise; delete calls the API once per id and swallows a rejected delete. All against a mocked Anthropic client.
- `template`: the user content holds one block per document with the primary and supplementary labels in order, Office documents carry the text-only note, and the response is returned as `filledTemplate`. `callSonnet` is mocked.
- `orchestrator`: files are deleted after a successful template step and after a failing one; a failing upload deletes the files uploaded before it.
- `routes/pipeline`: an unsupported extension returns 400; an accepted non-PDF file is passed through with its filename.
- Client: the upload filter keeps accepted files and drops others.
- The existing Jest and Vitest suites and both typechecks pass.

## Risks

- **Output quality may shift.** The template step now reads the documents instead of a transcription. This is expected to improve fidelity, but the repo has no evals; `prompts/medphlow_*_output.txt` are the nearest reference.
- **Office files lose their visuals.** A `.pptx` deck that is mostly charts and images will give the model little to work with. Exporting it to PDF before upload remains the better route.
- **Memory on the 512 MB Fly machine.** Extracting text from a large Office file is unmeasured there.
- **The SDK jump is large.** 0.39.0 to 0.133.0 crosses many releases. Typecheck and the existing tests are the safety net.
- **Mocked tests cannot prove the 413 is gone.** Only a live run with a large PDF can, and that uses a real API key and costs money. It is run only on request.
- **API limits that still apply.** 600 PDF pages per request (100 when the request's context window is under 1M tokens); no password-protected or encrypted PDFs; images up to 8000×8000 px, and the docs' 10 MB per-image limit is stated for base64 so it is unconfirmed for uploaded files.
