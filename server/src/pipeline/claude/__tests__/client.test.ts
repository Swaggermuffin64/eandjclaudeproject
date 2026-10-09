import { buildPdfContentBlock } from '../client.js';

/**
 * Returns the block's source narrowed to the base64 variant, so tests can read
 * `data` and `media_type`. Fails the test if the block isn't base64-encoded.
 */
function base64SourceOf(block: ReturnType<typeof buildPdfContentBlock>) {
  if (block.source.type !== 'base64') {
    throw new Error(`expected base64 source, got ${block.source.type}`);
  }
  return block.source;
}

// buildSystemParam is private — we test it indirectly through the public API.
// buildPdfContentBlock is the only directly testable exported formatting function.

describe('buildPdfContentBlock', () => {
  it('returns a DocumentBlockParam with base64-encoded content', () => {
    const pdf = Buffer.from('fake-pdf-bytes');
    const result = buildPdfContentBlock(pdf);

    expect(result.type).toBe('document');
    const source = base64SourceOf(result);
    expect(source.media_type).toBe('application/pdf');
    expect(typeof source.data).toBe('string');
  });

  it('base64 data round-trips correctly', () => {
    const original = Buffer.from('test pdf content 12345');
    const result = buildPdfContentBlock(original);
    const decoded = Buffer.from(base64SourceOf(result).data, 'base64');
    expect(decoded.toString()).toBe('test pdf content 12345');
  });

  it('handles empty buffer', () => {
    const result = buildPdfContentBlock(Buffer.alloc(0));
    expect(base64SourceOf(result).data).toBe('');
  });

  it('handles large buffer', () => {
    const large = Buffer.alloc(1024 * 1024, 0x41); // 1MB of 'A'
    const result = buildPdfContentBlock(large);
    const decoded = Buffer.from(base64SourceOf(result).data, 'base64');
    expect(decoded.length).toBe(1024 * 1024);
  });
});
