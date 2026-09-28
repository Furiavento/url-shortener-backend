const PG_UNIQUE_VIOLATION = '23505';

/**
 * Drizzle wraps driver errors in a DrizzleQueryError whose `cause` is the
 * original pg error, so check both levels.
 */
export function isUniqueViolation(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown } | null)?.cause];
  return candidates.some(
    (e) =>
      typeof e === 'object' &&
      e !== null &&
      (e as { code?: unknown }).code === PG_UNIQUE_VIOLATION,
  );
}
