import { PublicUserDto } from '../../users/dto/public-user.dto.js';

/**
 * Returned by register, login and refresh. The refresh token is not part of
 * the body: it is set as the httpOnly `refresh_token` cookie.
 */
export class AuthResponseDto {
  /** JWT to send as `Authorization: Bearer <token>`. */
  accessToken: string;
  /**
   * Access token lifetime in seconds.
   * @example 900
   */
  expiresIn: number;
  user: PublicUserDto;
}
