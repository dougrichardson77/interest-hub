# iOS App Scaffold (`InterestHubiOS`)

This directory contains a native SwiftUI iPhone app scaffold that targets your existing backend API.

## What is included

- Auth: Supabase magic-link flow with deep-link callback parsing.
- Session persistence: Keychain-backed token storage.
- API Client: Typed envelope decoding for `ok/data/error` backend responses.
- Features: Interests, Tutorials, Playback, Settings.
- Unit tests: callback parsing + query filter mapping.

## Generate Xcode project

This scaffold uses XcodeGen.

1. Install XcodeGen on your machine.
2. From this directory, run:

```bash
cd ios/InterestHubiOS
xcodegen generate
open InterestHubiOS.xcodeproj
```

## Required Info.plist config

`Sources/App/Info.plist` currently has placeholders:

- `API_BASE_URL` (for example `https://app.yourdomain.com`)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_MAGIC_LINK_REDIRECT_URL` (default `interesthub://auth/callback`)

Make sure the same custom URL scheme is configured in Supabase Auth redirect URLs.
