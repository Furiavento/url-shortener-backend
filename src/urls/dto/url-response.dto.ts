export class UrlResponseDto {
  /** @example 1 */
  id: number;
  /** @example "ng-docs" */
  code: string;
  /** @example "https://angular.dev/overview" */
  originalUrl: string;
  /** Total clicks since creation. */
  clicks: number;
  createdAt: Date;
  updatedAt: Date;
  /** `null` when the link never expires. */
  expiresAt: Date | null;
  /** @example "http://localhost:3000/ng-docs" */
  shortUrl: string;
}

export class PaginatedUrlsDto {
  items: UrlResponseDto[];
  /** Total matching URLs across all pages. */
  total: number;
  page: number;
  limit: number;
}
