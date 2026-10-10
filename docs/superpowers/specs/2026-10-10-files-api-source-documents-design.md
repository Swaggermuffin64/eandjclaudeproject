# Files API Source Documents Design

## Overview

Large uploads fail with `413 request_too_large` from the Anthropic API. The server accepts PDFs up to 32 MB, then sends them inline as base64, which inflates them by about a third and pushes the request past the API's 32 MB limit.

This change uploads each PDF once through the Anthropic Files API and references it by `file_id`. It also removes the ingest step: the template step reads the PDFs directly and produces the operator inputs in one call.

## Goals

- A PDF up to the 32 MB upload cap runs through the pipeline without a 413.
- The template step works from the source PDFs, not from a text transcription that is capped at 16,384 output tokens and can be silently truncated.
- Uploaded files do not outlive the step that needs them.

## Non-goals

- The dossier step, the score step and the score-only endpoint do not change. Dossier blocks keep working only from the filled template.
- No new upload file types. Uploads stay PDF-only.
- No change to the 32 MB per-file upload cap.
- No model changes.

## Current flow

1. `ingest` (Sonnet) receives the PDFs as base64 and returns `extractedText` and `entityManifest`.
2. `template` (Sonnet) receives both strings and returns `filledTemplate` (OI-1, OI-2, OI-3).
3. `dossier` (Opus, 15 blocks) receives `filledTemplate`.
4. `score` receives the dossier and a rubric.

Only ingest ever sees the PDFs.

## New flow

1. The orchestrator uploads the PDFs and gets one `file_id` per PDF.
2. `template` (Sonnet) receives the `file_id`s and returns `filledTemplate`.
3. The orchestrator deletes the uploaded files, whether the template step succeeded or failed.
4. `dossier` and `score` run as today.

## Components

### `server/src/pipeline/claude/source-document-files.ts` (new)

Owns every Files API call for source documents.

- `uploadSourceDocument(pdf: Buffer): Promise<string>` uploads one PDF as `application/pdf` with `expires_in_seconds: 3600` and returns its `file_id`. The expiry is a backstop for a crashed run; normal cleanup is the explicit delete.
- `buildSourceDocumentBlock(fileId: string): Anthropic.DocumentBlockParam` returns `{ type: 'document', source: { type: 'file', file_id } }`.
- `deleteSourceDocuments(fileIds: string[]): Promise<void>` deletes each file. A failed delete is logged and does not throw, so cleanup can never mask the pipeline's real result.

`getClient()` in `client.ts` is exported so this module shares the one Anthropic client.

### `server/src/pipeline/claude/client.ts`

- `buildPdfContentBlock` is removed. Nothing sends base64 PDFs any more.
- `callModel` is unchanged apart from anything the SDK upgrade requires.

### `server/src/pipeline/types.ts`

- `IngestInput` and `IngestOutput` are removed.
- `TemplateInput` becomes `{ primaryFileId: string; supplementaryFileIds: string[] }`.

### `server/src/pipeline/steps/template.ts`

- The system prompt absorbs the 16-category entity manifest instructions from the ingest prompt, including the instruction to note the source page or section of each entity. It no longer asks for a full text extraction.
- The user content is a block array: the research dossier template for reference, then `PRIMARY DOCUMENT:` and its file block, then `SUPPLEMENTARY DOCUMENT n:` and its file block for each supplementary PDF, then the instruction to produce OI-1, OI-2 and OI-3.
- The output is still `{ filledTemplate }`.

### `server/src/pipeline/steps/ingest.ts`

Deleted, along with `__tests__/ingest.test.ts`.

### `server/src/pipeline/orchestrator.ts`

- Emits `step:start` for `template`, uploads the PDFs, runs the template step, and deletes the files in a `finally`.
- Upload happens inside the template step's start and complete events, so an upload failure is reported like any other template failure.

### `server/src/routes/pipeline.ts`

`/api/pipeline/run` rejects any uploaded part whose mimetype is not `application/pdf` with a 400. Today only the browser checks this.

### Shared and client

- `shared/types/pipeline.ts`: `'ingest'` is removed from `PipelineStepName`.
- `client/src/components/StepStatus.tsx`: three steps, renumbered Template, Dossier, Score.
- `client/src/hooks/usePipeline.ts`: `STEPS`, the initial step states and the score-only step states drop `ingest`.
- `client/src/api/client.ts`: errors raised before the stream opens are attributed to `'template'`.

### SDK

`@anthropic-ai/sdk` moves from `^0.39.0` to `^0.133.0` in `server/package.json` to get the stable `client.files` namespace. Anything the upgrade breaks in the streaming loop or the web search tool definition is fixed as part of this work.

## Error handling

- Upload failure: the template step fails, the pipeline emits `pipeline:error`, and any files already uploaded are deleted.
- Template call failure: files are deleted, then the error propagates as today.
- Delete failure: logged; the files expire after one hour.
- `file_id`s never leave the server. They are not sent to the browser and are never accepted from it, because uploaded files are readable by every API key in the workspace.

## Testing

- `source-document-files`: upload returns the id and sends the PDF mimetype and expiry; the block has the file-source shape; delete calls the API once per id and swallows a rejected delete. All against a mocked Anthropic client.
- `template`: the user content holds one file block per PDF with the primary and supplementary labels in order, and the response is returned as `filledTemplate`. `callSonnet` is mocked.
- `orchestrator`: files are deleted after a successful template step and after a failing one; a failing upload deletes the files uploaded before it.
- `routes/pipeline`: a non-PDF part returns 400.
- The existing Jest and Vitest suites and both typechecks pass.

## Risks

- **Output quality may shift.** The template step now reads the PDFs instead of a transcription. This is expected to improve fidelity, but the repo has no evals; `prompts/medphlow_*_output.txt` are the nearest reference.
- **The SDK jump is large.** 0.39.0 to 0.133.0 crosses many releases. Typecheck and the existing tests are the safety net.
- **Mocked tests cannot prove the 413 is gone.** Only a live run with a large PDF can, and that uses a real API key and costs money. It is run only on request.
- **Limits that still apply.** 600 PDF pages per request (100 when the request's context window is under 1M tokens), and no password-protected or encrypted PDFs.
