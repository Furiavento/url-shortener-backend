# URL Shortener: backend

API del acortador de URLs: cuentas de usuario, creación y gestión de links cortos, redirección y estadísticas de clics para el dashboard Angular.

**Stack:** NestJS 12 (ESM) · PostgreSQL 18 · Drizzle ORM · JWT con refresh tokens en cookie httpOnly · Vitest · Swagger/OpenAPI

## Índice

- [Puesta en marcha](#puesta-en-marcha)
- [Configuración](#configuración)
- [Scripts](#scripts)
- [Estructura](#estructura)
- [API](#api)
  - [Autenticación](#cómo-funciona-la-autenticación)
  - [Auth](#auth-apiauth)
  - [URLs](#urls-apiurls)
  - [Estadísticas](#estadísticas-apianalytics)
  - [Health y redirección](#otros)
  - [Errores](#errores)
  - [Flujo típico en Angular](#flujo-típico-en-angular)
- [Producción](#producción)

## Puesta en marcha

Requisitos: Node.js 24, pnpm 12 y PostgreSQL (por ejemplo en un contenedor podman).

```bash
pnpm install

# Variables de entorno: copia la plantilla y genera los secretos que indica
cp .env.example .env

# Bases de datos: desarrollo y la de los tests e2e (el sufijo _test es obligatorio)
podman exec postgres-18 psql -U postgres -c "CREATE DATABASE url_shortener"
podman exec postgres-18 psql -U postgres -c "CREATE DATABASE url_shortener_test"

pnpm db:migrate   # aplica las migraciones de drizzle/
pnpm db:seed      # opcional: usuario demo@example.com / demo12345 con datos de ejemplo
pnpm start:dev
```

La API queda en `http://localhost:3000/api` y la documentación interactiva en `http://localhost:3000/api/docs`.

## Configuración

Las variables se validan al arrancar: si falta alguna o no es válida, la app no inicia y dice cuál es.

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | (obligatoria) | `postgres://usuario:clave@host:5432/url_shortener` |
| `JWT_SECRET` | (obligatoria) | Mínimo 32 caracteres (`openssl rand -base64 48`) |
| `IP_HASH_SALT` | (obligatoria) | Mínimo 16 caracteres (`openssl rand -hex 16`). Sal para el hash de las IPs de los clics |
| `PORT` | `3000` | |
| `NODE_ENV` | `development` | `development`, `production` o `test` |
| `JWT_EXPIRES_IN` | `900` | Duración del access token, en segundos |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Duración de la sesión; se renueva en cada refresh |
| `COOKIE_SECURE` | `true` en producción | Cookie solo por HTTPS. En desarrollo va en `false` para funcionar en `http://localhost` |
| `COOKIE_SAMESITE` | `strict` | `strict`, `lax` o `none` (`none` exige `COOKIE_SECURE=true`) |
| `CORS_ORIGIN` | `http://localhost:4200` | Origen del frontend; admite varios separados por coma |
| `SHORT_URL_BASE` | `http://localhost:3000` | Dominio con el que se arman los links cortos (`shortUrl`) |
| `TEST_DATABASE_URL` | `DATABASE_URL` + `_test` | Base de los tests e2e. Tiene que terminar en `_test` |

## Scripts

| Comando | Qué hace |
|---|---|
| `pnpm start:dev` | Levanta la API recompilando al guardar |
| `pnpm build` / `pnpm start:prod` | Compila a `dist/` y lo ejecuta |
| `pnpm test` | Tests unitarios |
| `pnpm test:e2e` | Tests e2e contra la base `_test` (la migra y la vacía antes de correr) |
| `pnpm lint` / `pnpm format` | oxlint / Prettier |
| `pnpm db:generate --name <nombre>` | Genera una migración a partir de `src/database/schema.ts` |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:studio` | Abre Drizzle Studio para explorar la base |
| `pnpm db:seed` | Recrea el usuario demo con 12 URLs y ~90 días de clics. No corre en producción |
| `pnpm openapi` | Regenera `openapi.json` (hazlo cada vez que cambie la API) |

## Estructura

```
src/
  auth/        registro, login, JWT, refresh tokens y guard global
  users/       acceso a usuarios
  urls/        CRUD de URLs cortas
  redirect/    GET /:code, fuera de /api
  analytics/   registro de clics y estadísticas
  health/      GET /api/health
  database/    esquema de Drizzle y módulo de conexión
  config/      validación de variables de entorno
  scripts/     seed y generador de OpenAPI
drizzle/       migraciones SQL
test/          tests e2e
openapi.json   especificación para generar el cliente de Angular
```

---

## API

Todo lo que usa el frontend está bajo `/api`. La única excepción es la redirección de los links cortos, que vive en la raíz del dominio de links.

- **Documentación interactiva:** `/api/docs` (Swagger UI, solo fuera de producción). El JSON está en `/api/docs-json`.
- **Especificación:** [`openapi.json`](./openapi.json). Sirve para generar tipos o el cliente de Angular (por ejemplo con `openapi-typescript` u `ng-openapi-gen`).

### Cómo funciona la autenticación

Hay dos tokens, cada uno con un papel distinto:

| | Access token | Refresh token |
|---|---|---|
| Qué es | JWT | Cadena aleatoria (en la base solo se guarda su hash) |
| Cómo viaja | Cabecera `Authorization: Bearer <token>` | Cookie `refresh_token`: `HttpOnly`, `SameSite=Strict`, `Path=/api/auth` |
| Dónde lo guarda Angular | En memoria | No lo ve: lo maneja el navegador |
| Duración | 15 minutos (`expiresIn` en la respuesta) | 7 días, y se renuevan en cada refresh |
| Para qué sirve | Llamar a los endpoints protegidos | Pedir un access token nuevo |

**Rotación:** cada refresh invalida la cookie usada y entrega una nueva. Si llega una cookie que ya se usó, el backend asume que la robaron y cierra toda esa sesión. Por eso el frontend debe hacer **un solo refresh a la vez**.

Para que el navegador envíe la cookie, las llamadas a `/api/auth/*` necesitan `withCredentials: true`.

Todos los endpoints piden access token salvo los marcados como públicos. Sin token o con uno vencido responden **401**.

### Auth: `/api/auth`

#### `POST /api/auth/register` (público)

Crea la cuenta e inicia sesión.

```json
{ "email": "ana@example.com", "password": "supersecret1", "name": "Ana" }
```

- `email`: válido, hasta 255 caracteres. Se guarda en minúsculas.
- `password`: de 8 a 72 caracteres.
- `name`: de 1 a 100 caracteres.

**201**, con la cookie `refresh_token` puesta:

```json
{
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 900,
  "user": {
    "id": "5d8cd64a-f031-466f-bac4-c307e42e1483",
    "email": "ana@example.com",
    "name": "Ana",
    "role": "user",
    "createdAt": "2026-09-28T17:13:58.131Z",
    "updatedAt": "2026-09-28T17:13:58.131Z"
  }
}
```

**Errores:** 400 si los datos no son válidos · 409 si el email ya existe · 429 con más de 5 intentos por minuto.

#### `POST /api/auth/login` (público)

```json
{ "email": "ana@example.com", "password": "supersecret1" }
```

**200**, con la misma respuesta que register y la cookie puesta.
**Errores:** 401 `Invalid email or password` (mismo mensaje si falla el email o la contraseña) · 429 con más de 5 intentos por minuto.

#### `POST /api/auth/refresh` (público, usa la cookie)

No lleva cuerpo. Funciona aunque el access token ya haya vencido.
**200**, con la misma respuesta que login y una cookie nueva.
**Errores:** 401 si la cookie falta, venció, fue revocada o ya se usó; en ese caso además la borra · 429 con más de 20 intentos por minuto.

#### `POST /api/auth/logout` (público, usa la cookie)

Cierra la sesión actual. Las sesiones en otros dispositivos siguen activas.
**204** siempre, aunque no haya sesión. Borra la cookie.

#### `GET /api/auth/me`

**200**, con el usuario autenticado (mismo formato que `user` arriba).

### URLs: `/api/urls`

Cada usuario solo ve y modifica sus propias URLs. Si pides una de otro usuario recibes **404**, no 403, para no revelar que existe.

Formato de una URL en todas las respuestas:

```json
{
  "id": 1,
  "code": "ng-docs",
  "originalUrl": "https://angular.dev/overview",
  "clicks": 718,
  "createdAt": "2026-07-05T17:40:00.000Z",
  "updatedAt": "2026-07-05T17:40:00.000Z",
  "expiresAt": null,
  "shortUrl": "http://localhost:3000/ng-docs"
}
```

`shortUrl` se arma con `SHORT_URL_BASE`, así que en producción apunta al dominio de links cortos.

#### `POST /api/urls`

```json
{ "url": "https://angular.dev/overview", "alias": "ng-docs", "expiresAt": "2026-12-31T23:59:59Z" }
```

- `url` (obligatoria): `http` o `https`, hasta 2048 caracteres.
- `alias` (opcional): de 3 a 16 caracteres; letras, números, `_` y `-`. Sin alias se genera un código aleatorio de 7 caracteres. No se pueden usar `api`, `health`, `favicon.ico`, `robots.txt` ni `assets`, sin importar mayúsculas.
- `expiresAt` (opcional): fecha futura en formato ISO 8601.

**201**, con la URL creada.
**Errores:** 400 si los datos no son válidos o el alias está reservado · 409 si el alias ya está en uso.

#### `GET /api/urls?page=1&limit=20&search=angular`

Lista paginada, de la más nueva a la más antigua.

- `page`: por defecto 1.
- `limit`: por defecto 20, máximo 100.
- `search`: busca en la URL original y en el código, sin distinguir mayúsculas.

```json
{ "items": [], "total": 12, "page": 1, "limit": 20 }
```

#### `GET /api/urls/:id`

**200**, con la URL · **404** si no existe o no es tuya.

#### `PATCH /api/urls/:id`

```json
{ "url": "https://angular.dev/tutorials", "expiresAt": null }
```

Los dos campos son opcionales. `expiresAt: null` quita la expiración; si mandas una fecha, tiene que ser futura. El código corto no se puede cambiar.
**200**, con la URL actualizada · **404**.

#### `DELETE /api/urls/:id`

Borra la URL y su historial de clics.
**204** · **404**.

### Estadísticas: `/api/analytics`

En todas las series por día, las fechas son días en UTC (`"2026-09-28"`) e incluyen los días sin clics con valor 0, así que se pueden graficar directamente.

#### `GET /api/analytics/overview`

Resumen para la portada del dashboard:

```json
{
  "totalUrls": 12,
  "totalClicks": 2737,
  "clicksLast30Days": 1217,
  "topUrls": [
    {
      "id": 1,
      "code": "ng-docs",
      "shortUrl": "http://localhost:3000/ng-docs",
      "originalUrl": "https://angular.dev/overview",
      "clicks": 718
    }
  ],
  "clicksByDay": [{ "date": "2026-08-29", "clicks": 34 }]
}
```

- `topUrls`: las 5 URLs con más clics.
- `clicksByDay`: los últimos 30 días, hoy incluido.

#### `GET /api/analytics/urls/:id?from=2026-09-01&to=2026-09-28`

Detalle de una URL. Sin `from` y `to` usa los últimos 30 días; el rango máximo es de 366 días.

```json
{
  "from": "2026-08-29T17:15:32.949Z",
  "to": "2026-09-28T17:15:32.949Z",
  "totalClicks": 268,
  "clicksByDay": [{ "date": "2026-09-28", "clicks": 12 }],
  "topReferrers": [
    { "label": "Direct", "clicks": 90 },
    { "label": "www.google.com", "clicks": 64 }
  ],
  "browsers": [{ "label": "Chrome", "clicks": 162 }],
  "os": [{ "label": "Windows", "clicks": 104 }],
  "devices": [{ "label": "desktop", "clicks": 169 }]
}
```

- Cada desglose trae hasta 10 entradas, ordenadas de mayor a menor.
- `Direct` son los clics sin página de origen; `Unknown` es cuando no se pudo identificar el navegador, sistema o dispositivo.

**Errores:** 400 si `from` no es anterior a `to` o el rango supera 366 días · 404.

### Otros

#### `GET /api/health` (público)

**200** `{ "status": "ok", "db": "up" }` · **503** si la base no responde.

#### `GET /:code` (público, dominio de links cortos)

Es lo que abre quien hace clic en un link corto. El frontend no lo llama, por eso no aparece en OpenAPI.

- **302:** redirige a la URL original. Usa 302 y no 301 para que el navegador no guarde la redirección y se cuenten todos los clics.
- **404:** el código no existe.
- **410:** el link expiró.

Cada clic se registra después de redirigir, así que no hace más lenta la respuesta. Se guarda la fecha, el dominio de origen, el navegador, el sistema, el tipo de dispositivo y un hash de la IP; la IP nunca se guarda tal cual.

### Errores

Todos los errores tienen el formato estándar de Nest:

```json
{ "message": "Alias \"ng-docs\" is already taken", "error": "Conflict", "statusCode": 409 }
```

En los errores de validación (400), `message` es una lista con un mensaje por problema. Los campos que no existen en el esquema también se rechazan:

```json
{
  "message": ["property extra should not exist", "url must be a URL address"],
  "error": "Bad Request",
  "statusCode": 400
}
```

### Flujo típico en Angular

1. **Al arrancar:** `POST /api/auth/refresh` para recuperar la sesión. Si responde 401, mostrar el login.
2. **Login:** guardar `accessToken` en memoria y programar el próximo refresh un poco antes de que pasen `expiresIn` segundos.
3. **Cada petición:** un interceptor agrega `Authorization: Bearer …`. Si recibe 401, hace un refresh (uno solo aunque fallen varias peticiones a la vez) y repite la petición.
4. **Logout:** `POST /api/auth/logout` y borrar el token de memoria.

---

## Producción

El frontend y los links cortos van en subdominios distintos del mismo dominio, por ejemplo `app.midominio.com` y `s.midominio.com`. Para eso basta con configurar:

- `NODE_ENV=production`: desactiva Swagger UI y el seed, y activa `COOKIE_SECURE`.
- `SHORT_URL_BASE`: el subdominio de los links cortos.
- `CORS_ORIGIN`: el subdominio de Angular.

Como los dos subdominios comparten dominio, el navegador los considera el mismo sitio y la cookie `SameSite=Strict` funciona sin cambios.
