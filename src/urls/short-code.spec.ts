import {
  ALIAS_PATTERN,
  generateShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from './short-code.js';

describe('generateShortCode', () => {
  it('generates base62 codes of the configured length', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateShortCode();
      expect(code).toHaveLength(SHORT_CODE_LENGTH);
      expect(code).toMatch(new RegExp(`^[${SHORT_CODE_ALPHABET}]+$`));
    }
  });

  it('generates codes that are valid aliases', () => {
    expect(ALIAS_PATTERN.test(generateShortCode())).toBe(true);
  });
});
