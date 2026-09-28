import { customAlphabet } from 'nanoid';

export const SHORT_CODE_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_CODE_LENGTH = 7;

export const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,16}$/;

/** Codes that would collide with routes or static files served at the root. */
export const RESERVED_CODES = new Set([
  'api',
  'health',
  'favicon.ico',
  'robots.txt',
  'assets',
]);

export const generateShortCode = customAlphabet(
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
);
