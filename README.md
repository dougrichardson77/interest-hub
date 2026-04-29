# Interest Tutorial Hub

A private tutorial dashboard for collecting the latest YouTube videos across saved interests. It runs in two modes:

- Local mode: JSON-backed, single-user, great for personal use.
- Hosted mode: Supabase-backed, account-based, each user gets a separate dashboard.

## What It Does

- Searches YouTube through the official YouTube Data API.
- Uses local JSON storage by default and switches to Supabase automatically when `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set.
- Keeps your YouTube API key on the server only.
- Saves interests such as Cinema 4D + X-Particles or OpenAI Codex.
- Lets you switch between interests, each with its own searches, topics, trusted channels, and refresh status.
- Lets you delete interests from the sidebar while keeping any videos that still belong to another interest.
- Supports email-link sign-in in hosted mode so each person gets a separate dashboard.
- Filters by topic, channel, trusted channels, saved, watched, and duration.
- Lets you watch embeddable videos in the app or open them on YouTube.
- Refreshes automatically in local mode. Hosted mode uses manual refresh per signed-in user.

## Run It

```bash
cp .env.example .env
```

Add your YouTube Data API key to `.env`, then run:

```bash
node server.js
```

Open:

```text
http://localhost:4173
```

If Codex cannot start the localhost server because of sandbox permissions, double-click
`start-tutorial-hub.command` in Finder. Leave the Terminal window open while using the app.

Manual refresh:

```bash
node scripts/refresh.js
```

## Configuration

Environment variables:

- `YOUTUBE_API_KEY`: your YouTube Data API key.
- `SUPABASE_URL`: required for hosted multi-user mode.
- `SUPABASE_ANON_KEY`: required for hosted multi-user mode.
- `PORT`: local server port. Default: `4173`.
- `HOST`: local bind host. Default: `127.0.0.1`.
- `REFRESH_EVERY_HOURS`: scheduled refresh interval. Default: `6`.
- `YOUTUBE_PUBLISHED_AFTER_DAYS`: how far back search should look. Default: `180`.
- `YOUTUBE_MAX_RESULTS_PER_QUERY`: results per search query. Default: `20`.
- `AUTO_REFRESH`: set to `false` to disable scheduled refresh.

Default interests live in `lib/config.js`.
Local saved interests and cached videos live in `data/tutorials.json`.
Hosted database schema lives in [supabase/schema.sql](/Users/my.mac/Library/CloudStorage/OneDrive-MomentumWorldwide/Documents/Open Ai Codex/3D Tutorials App/supabase/schema.sql).

## API

- `GET /api/app-config`: returns client auth and storage config.
- `GET /api/interests`: returns saved interests and video counts.
- `POST /api/interests`: creates a new saved interest.
- `PATCH /api/interests/:interestId`: marks an interest as active.
- `DELETE /api/interests/:interestId`: deletes one interest and its interest-only videos.
- `GET /api/tutorials`: returns cached tutorials, facets, and refresh status for the active or requested interest.
- `POST /api/interests/:interestId/refresh`: refreshes one interest from YouTube.
- `POST /api/refresh`: refreshes the active interest from YouTube.
- `PATCH /api/tutorials/:videoId/state`: updates `saved`, `watched`, or `notes`.

## Render + Supabase Setup

1. Create a Supabase project.
   No project is connected yet in this workspace, so this still needs to be created in your Supabase account.
2. In Supabase SQL Editor, run [supabase/schema.sql](/Users/my.mac/Library/CloudStorage/OneDrive-MomentumWorldwide/Documents/Open Ai Codex/3D Tutorials App/supabase/schema.sql).
3. In Supabase Auth settings:
   Set the Site URL to your Render URL.
   Add your Render URL to Redirect URLs for magic-link sign-in.
4. In Render:
   Deploy this repo as a Web Service or Blueprint using [render.yaml](/Users/my.mac/Library/CloudStorage/OneDrive-MomentumWorldwide/Documents/Open Ai Codex/3D Tutorials App/render.yaml).
   Set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `YOUTUBE_API_KEY`.
   Keep `HOST=0.0.0.0`.
   Keep `AUTO_REFRESH=false` for hosted mode.
5. After deploy, sign in through the app with an email link. Each signed-in user will get their own interests, videos, saved state, and notes.

## Notes

The API key is never sent to the browser.
Local mode still uses the JSON cache so your current personal setup keeps working.
Hosted mode intentionally disables process-wide auto-refresh because refreshes are user-specific once dashboards are account-backed.
