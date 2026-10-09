// Tests for the ingest step's response parsing logic.
// We extract the parsing logic inline since it's not factored into a helper.
// These tests verify the marker-based splitting works correctly.

describe('ingest response parsing', () => {
  const textMarker = '---EXTRACTED TEXT---';
  const manifestMarker = '---ENTITY MANIFEST---';

  function parseIngestResponse(response: string) {
    const textStart = response.indexOf(textMarker);
    const manifestStart = response.indexOf(manifestMarker);

    let extractedText: string;
    let entityManifest: string;

    if (textStart !== -1 && manifestStart !== -1) {
      extractedText = response.slice(textStart + textMarker.length, manifestStart).trim();
      entityManifest = response.slice(manifestStart + manifestMarker.length).trim();
    } else {
      extractedText = response;
      entityManifest = response;
    }

    return { extractedText, entityManifest };
  }

  it('splits response at both markers', () => {
    const response = `${textMarker}\nThe extracted text.\n${manifestMarker}\nThe manifest.`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe('The extracted text.');
    expect(result.entityManifest).toBe('The manifest.');
  });

  it('trims whitespace around extracted sections', () => {
    const response = `${textMarker}\n\n  text with spaces  \n\n${manifestMarker}\n  manifest  \n`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe('text with spaces');
    expect(result.entityManifest).toBe('manifest');
  });

  it('handles multiline content in both sections', () => {
    const response = `${textMarker}
Line 1
Line 2
Line 3
${manifestMarker}
Category 1: Item A
Category 2: Item B`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toContain('Line 1');
    expect(result.extractedText).toContain('Line 3');
    expect(result.entityManifest).toContain('Category 1');
    expect(result.entityManifest).toContain('Category 2');
  });

  it('falls back to full response when text marker is missing', () => {
    const response = `${manifestMarker}\nJust manifest.`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe(response);
    expect(result.entityManifest).toBe(response);
  });

  it('falls back to full response when manifest marker is missing', () => {
    const response = `${textMarker}\nJust text.`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe(response);
    expect(result.entityManifest).toBe(response);
  });

  it('falls back to full response when both markers are missing', () => {
    const response = 'No markers here, just raw text.';
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe(response);
    expect(result.entityManifest).toBe(response);
  });

  it('handles empty sections between markers', () => {
    const response = `${textMarker}\n${manifestMarker}\n`;
    const result = parseIngestResponse(response);
    expect(result.extractedText).toBe('');
    expect(result.entityManifest).toBe('');
  });
});
