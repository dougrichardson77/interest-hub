# Production Rollout Guide

## 1) Environments

Create separate stacks for each environment:

- Development
- Staging
- Production

For each environment, provision:

- Dedicated Render web service
- Dedicated Supabase project
- Dedicated domain/subdomain

## 2) Render Blueprints

Use the included blueprints:

- `render.staging.yaml`
- `render.production.yaml`

Set env vars in Render dashboard:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `YOUTUBE_API_KEY`
- `CORS_ORIGIN_ALLOWLIST`

## 3) Supabase Auth URLs

In each Supabase project:

- Set Auth Site URL to the matching app URL
- Add Redirect URLs for magic-link sign-in
  - Web: `https://app.yourdomain.com`
  - iOS deep link: `interesthub://auth/callback`

## 4) CI/CD Wiring

Add repository secrets:

- `RENDER_STAGING_DEPLOY_HOOK`
- `RENDER_PRODUCTION_DEPLOY_HOOK`

Pipelines:

- `ci.yml`: test on PR + main
- `deploy-staging.yml`: auto deploy staging on `main`
- `deploy-production.yml`: manual promotion

## 5) Domain and SSL

For production host (recommended `app.yourdomain.com`):

1. Add custom domain in Render
2. Add DNS records in your DNS provider
3. Wait for managed TLS issuance
4. Verify HTTPS and CORS allowlist

## 6) Release Gates

Before production promotion:

- Staging smoke test passes:
  - Sign-in
  - Interest CRUD
  - Refresh
  - Save/watched updates
  - Playback/open-on-YouTube
- API health/version endpoints return expected metadata
- No critical errors in request logs
