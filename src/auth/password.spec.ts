import { hashPassword, verifyPassword } from './password.js';

describe('password hashing', () => {
  it('verifies the original password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    await expect(verifyPassword('correct horse', hash)).resolves.toBe(true);
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct horse');
    await expect(verifyPassword('battery staple', hash)).resolves.toBe(false);
  });

  it('salts each hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored hashes', async () => {
    await expect(verifyPassword('x', 'not-a-hash')).resolves.toBe(false);
  });
});
