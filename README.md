# Interest Tutorial Hub

Interest Tutorial Hub is a YouTube tutorial dashboard with two clients:

- Web app (current production app on Render)
- Native iPhone app scaffold (`ios/InterestHubiOS`) using the same backend API

It supports:

- Multi-interest tutorial curation
- Supabase auth (hosted mode)
- Saved/watched/notes state
- Manual refresh per user dashboard

## Runtime Modes

- Local mode: JSON storage (`data/tutorials.json`)
- Hosted mode: Supabase storage with per-user isolation

## Run Locally

```bash
cp .env.example .env
node server.js
```

App URL:

```text
http://localhost:4173
```

Manual refresh (local storage mode only):

```bash
node scripts/refresh.js
```

## Environment Configuration

Core variables:

- `APP_ENV`: `development`, `staging`, `production`, `test`
- `APP_VERSION`: API/app release version sent in responses/headers
- `MIN_CLIENT_VERSION`: minimum supported app client version
- `YOUTUBE_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PORT`, `HOST`
- `AUTO_REFRESH`

Security/hardening variables:

- `CORS_ORIGIN_ALLOWLIST`: comma-separated origins for cross-origin API calls
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX_REQUESTS`
- `REFRESH_RATE_LIMIT_WINDOW_MS`
- `REFRESH_RATE_LIMIT_MAX_REQUESTS`
- `JSON_BODY_LIMIT_BYTES`

Storage/testing variable:

- `LOCAL_DATA_DIR`: optional override path for local JSON data

Production environment examples:

- `.env.staging.example`
- `.env.production.example`

## API Contract (Standardized Envelope)

All API responses now use:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "...",
    "appVersion": "...",
    "timestamp": "..."
  }
}
```

Errors use:

```json
{
  "ok": false,
  "error": {
    "code": "...",
    "message": "...",
    "requestId": "..."
  },
  "meta": {
    "requestId": "...",
    "appVersion": "...",
    "timestamp": "..."
  }
}
```

Endpoints:

- `GET /api/health` (liveness/readiness)
- `GET /api/version` (client compatibility/versioning)
- `GET /api/app-config`
- `GET /api/interests`
- `POST /api/interests`
- `PATCH /api/interests/:interestId`
- `DELETE /api/interests/:interestId`
- `GET /api/tutorials`
- `POST /api/interests/:interestId/refresh`
- `POST /api/refresh`
- `PATCH /api/tutorials/:videoId/state`

## Render Deployment and Environment Split

Render blueprints included:

- `render.yaml` (production-default service)
- `render.staging.yaml`
- `render.production.yaml`

Recommended setup:

1. Separate Render services: dev/staging/prod.
2. Separate Supabase projects per environment.
3. Set `CORS_ORIGIN_ALLOWLIST` for each environment domain.
4. Use `AUTO_REFRESH=false` in hosted mode.

## CI/CD

GitHub Actions workflows:

- `.github/workflows/ci.yml`
  - Runs tests on pull requests and pushes to `main`.
- `.github/workflows/deploy-staging.yml`
  - Auto-triggers staging deploy on push to `main` via `RENDER_STAGING_DEPLOY_HOOK`.
- `.github/workflows/deploy-production.yml`
  - Manual production promotion via workflow dispatch and `RENDER_PRODUCTION_DEPLOY_HOOK`.

## Domain + SSL

For production domain rollout:

1. Attach custom domain in Render (for example `app.yourdomain.com`).
2. Add DNS records to your DNS provider.
3. Wait for Render-managed TLS certificate issuance.
4. Put the exact domain in:
   - `CORS_ORIGIN_ALLOWLIST`
   - Supabase Auth Site URL / redirect allowlist

## iPhone App Scaffold

Native iOS app lives in:

- `ios/InterestHubiOS`

Includes modules for:

- `Auth`
- `Networking`
- `Models`
- `Interests`
- `Tutorials`
- `Playback`
- `Settings`

See `ios/README.md` for XcodeGen generation steps and required plist values.

## Tests

Run all backend tests:

```bash
node --test
```

Includes:

- Unit tests for tutorial logic and validators
- Supabase auth helper tests
- Integration API smoke tests (`test/api.integration.test.js`)

## Supabase Schema

Database schema is in:

- `supabase/schema.sql`
