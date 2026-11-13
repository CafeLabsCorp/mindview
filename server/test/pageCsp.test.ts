import { describe, expect, it } from 'vitest';
import { generateNonce, pageCsp } from '../src/io/security.js';

describe('pageCsp', () => {
  const csp = pageCsp('abc123', 4321);

  it('allows scripts only from self and the per-response nonce', () => {
    expect(csp).toContain("script-src 'self' 'nonce-abc123'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
  });

  it('keeps the page unframeable and closes base/form/object escapes', () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain('object-src blob:');
  });

  it('limits the terminal websocket to this loopback port', () => {
    expect(csp).toContain('connect-src \'self\' ws://127.0.0.1:4321 ws://localhost:4321');
  });

  it('generates a fresh nonce each time', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
