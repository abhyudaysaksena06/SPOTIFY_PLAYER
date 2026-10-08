# Spotify Console

A React + Vite remote control for your Spotify desktop app: browse your albums, liked songs and playlists, search, and play anything on your laptop. Tap the album art in the player bar for a spinning-vinyl view; tap the record to go back.

Requires Spotify Premium for playback control.

## Run locally

```bash
npm install
npm run dev
```

Opens on http://127.0.0.1:8888/ (Spotify doesn't accept `localhost`).

## Spotify app setup

1. https://developer.spotify.com/dashboard → **Create app**, tick **Web API**.
2. Add Redirect URIs:
   - `http://127.0.0.1:8888/`
   - `https://<your-project>.vercel.app/`
3. Copy the Client ID. Paste it on the login screen, or set `VITE_SPOTIFY_CLIENT_ID` (see `.env.example`).
4. While the app is in Development Mode, add your Spotify account email under **User Management**.

## Deploy to Vercel

Import the repo in Vercel (framework: Vite, auto-detected). Optionally add the env var `VITE_SPOTIFY_CLIENT_ID`. `vercel.json` handles SPA routing.

## Shortcuts

`/` search · `Space` play/pause · `Shift+←/→` prev/next · `V` vinyl view · `Esc` close vinyl

## Scratch Speaker (Windows companion)

Plays the scratch sound from your phone on the laptop that runs Spotify, so you hear it in the same earphones.

1. Double-click `companion/Install Scratch Speaker.bat`.
2. Open Spotify. A small "Scratch Speaker" window opens automatically — log in with Spotify the first time.
3. Spin the disc on your phone; the scratch plays on the laptop.

It starts with Windows, opens only while Spotify is running, and closes when Spotify closes.
Remove it with `companion/Uninstall Scratch Speaker.bat`.
