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
});
