import { createHash } from 'node:crypto';

/** Salted SHA-256 so unique visitors can be counted without storing IPs. */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256')
    .update(ip + salt)
    .digest('hex');
}
