import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

describe('URL shortener (e2e)', () => {
  let app: NestExpressApplication<App>;
  let http: App;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication<App>>();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(email: string): Promise<string> {
    const res = await request(http)
      .post('/api/auth/register')
      .send({ email, password: 'supersecret1', name: 'Tester' })
      .expect(201);
    return res.body.accessToken;
  }

  it('reports health', () => {
    return request(http)
      .get('/api/health')
      .expect(200, { status: 'ok', db: 'up' });
  });

  it('shortens, redirects and tracks clicks for the owner only', async () => {
    const token = await register('Owner@Example.com');
    const auth = { Authorization: `Bearer ${token}` };

    const login = await request(http)
      .post('/api/auth/login')
      .send({ email: 'owner@example.com', password: 'supersecret1' })
      .expect(200);
    expect(login.body.user).toMatchObject({ email: 'owner@example.com' });
    expect(login.body.user).not.toHaveProperty('passwordHash');

    await request(http)
      .post('/api/urls')
      .send({ url: 'https://a.io' })
      .expect(401);

    const created = await request(http)
      .post('/api/urls')
      .set(auth)
      .send({ url: 'https://angular.dev/overview', alias: 'ng-docs' })
      .expect(201);
    expect(created.body).toMatchObject({
      code: 'ng-docs',
      shortUrl: expect.stringMatching(/\/ng-docs$/),
    });
    const id: number = created.body.id;

    await request(http)
      .post('/api/urls')
      .set(auth)
      .send({ url: 'https://other.dev', alias: 'ng-docs' })
      .expect(409);

    await request(http)
      .get('/ng-docs')
      .set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      )
      .set('Referer', 'https://news.ycombinator.com/item?id=1')
      .expect(302)
      .expect('Location', 'https://angular.dev/overview');

    // Clicks are recorded after the redirect is sent.
    await vi.waitFor(async () => {
      const stats = await request(http)
        .get(`/api/analytics/urls/${id}`)
        .set(auth)
        .expect(200);
      expect(stats.body.totalClicks).toBe(1);
      expect(stats.body.topReferrers).toEqual([
        { label: 'news.ycombinator.com', clicks: 1 },
      ]);
      expect(stats.body.browsers).toEqual([{ label: 'Chrome', clicks: 1 }]);
      expect(stats.body.clicksByDay.at(-1).clicks).toBe(1);
    });

    const list = await request(http).get('/api/urls').set(auth).expect(200);
    expect(list.body).toMatchObject({ total: 1, page: 1 });
    expect(list.body.items[0]).toMatchObject({ id, clicks: 1 });

    const overview = await request(http)
      .get('/api/analytics/overview')
      .set(auth)
      .expect(200);
    expect(overview.body).toMatchObject({
      totalUrls: 1,
      totalClicks: 1,
      clicksLast30Days: 1,
    });

    const intruder = {
      Authorization: `Bearer ${await register('intruder@example.com')}`,
    };
    await request(http).get(`/api/urls/${id}`).set(intruder).expect(404);
    await request(http)
      .get(`/api/analytics/urls/${id}`)
      .set(intruder)
      .expect(404);
    await request(http).delete(`/api/urls/${id}`).set(intruder).expect(404);

    await request(http).delete(`/api/urls/${id}`).set(auth).expect(204);
    await request(http).get('/ng-docs').expect(404);
  });

  it('returns 404 for unknown short codes', () => {
    return request(http).get('/does-not-exist').expect(404);
  });

  describe('refresh tokens', () => {
    const credentials = {
      email: 'session@example.com',
      password: 'supersecret1',
    };

    /** Returns the raw `refresh_token=...` pair from a Set-Cookie header. */
    function refreshCookie(res: request.Response): string {
      const header = ([] as string[])
        .concat(res.headers['set-cookie'] ?? [])
        .find((cookie) => cookie.startsWith('refresh_token='));
      expect(header).toBeDefined();
      return header!.split(';')[0];
    }

    beforeAll(async () => {
      await request(http)
        .post('/api/auth/register')
        .send({ ...credentials, name: 'Session' })
        .expect(201);
    });

    it('sets an httpOnly cookie scoped to /api/auth on login', async () => {
      const res = await request(http)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);

      expect(res.body).toMatchObject({ expiresIn: expect.any(Number) });
      expect(res.body).not.toHaveProperty('refresh');
      const header = ([] as string[]).concat(res.headers['set-cookie']);
      expect(header[0]).toMatch(/^refresh_token=[\w-]{43};/);
      expect(header[0]).toMatch(/; Path=\/api\/auth/);
      expect(header[0]).toMatch(/; HttpOnly/);
      expect(header[0]).toMatch(/; SameSite=Strict/);
    });

    it('rotates the token and revokes the session when an old one is reused', async () => {
      const login = await request(http)
        .post('/api/auth/login')
        .send(credentials)
        .expect(200);
      const first = refreshCookie(login);

      const refreshed = await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', first)
        .expect(200);
      const second = refreshCookie(refreshed);
      expect(second).not.toBe(first);
      await request(http)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(200)
        .expect((res) => expect(res.body.email).toBe(credentials.email));

      // Reusing the rotated token is treated as theft: it fails and clears the cookie...
      const reused = await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', first)
        .expect(401);
      expect(refreshCookie(reused)).toBe('refresh_token=');

      // ...and the newest token of the same session is revoked as well.
      await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', second)
        .expect(401);
    });

    it('keeps other sessions alive when one is revoked', async () => {
      const a = refreshCookie(
        await request(http).post('/api/auth/login').send(credentials),
      );
      const b = refreshCookie(
        await request(http).post('/api/auth/login').send(credentials),
      );

      await request(http).post('/api/auth/logout').set('Cookie', a).expect(204);

      await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', a)
        .expect(401);
      await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', b)
        .expect(200);
    });

    it('rejects refresh without a cookie or with an unknown token', async () => {
      await request(http).post('/api/auth/refresh').expect(401);
      await request(http)
        .post('/api/auth/refresh')
        .set('Cookie', 'refresh_token=not-a-real-token')
        .expect(401);
    });

    it('accepts logout without a session', () => {
      return request(http).post('/api/auth/logout').expect(204);
    });
  });
});
