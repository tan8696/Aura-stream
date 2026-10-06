# AuraStream

A music player in the style of Spotify's desktop app, built with plain JavaScript and the Web Audio API. It ships with 14 full-length Creative Commons tracks, so it works out of the box with no accounts or API keys.

## Features

- **Spotify-style layout**: library sidebar, main view, a detail panel (Now playing / Queue / Lyrics / EQ) and a persistent player bar
- **Views**: Home, Playlist, Liked Songs, Artist, Search (with genre and mood browsing), Song radio and Your Library
- **Playlists**: create, add or remove songs from any song's ••• menu, delete (with undo), save the queue as a playlist
- **Queue**: play next, add to queue, reorder, remove and clear, all with undo
- **Shuffle modes**: true random (Fisher–Yates) or *Smart Flow*, which orders songs by tempo and energy
- **Discovery Dial**: controls how adventurous recommendations are, from *Comfort* (same genre and tempo) to *Explore* (crosses genres)
- **Explainable recommendations**: "Why this?" shows the genre, mood, tempo, energy and positivity match behind each pick
- **5-band equalizer** with presets, and playback speed (0.75×–2×)
- **Synced lyrics** (click a line to seek) and a full-screen player
- **Responsive**: desktop, tablet (icon rail sidebar) and phone (bottom tab bar, mini player)
- **Keyboard and OS controls**: `Space` play/pause, `/` or `Ctrl+K` search, `Ctrl+←/→` previous/next; media keys and lock-screen controls via the Media Session API
- Likes, playlists, follows, volume, EQ and the dial are saved in `localStorage`

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Build for production with `npm run build`.

## Project structure

```
index.html                 App shell (static layout, dialogs)
src/main.js                App controller: views, navigation, panels, menus
src/index.css              All styles (design tokens, layout, responsive rules)
src/icons.js               Inline SVG icon set
src/services/audioService.js          Playback, queue, shuffle, Web Audio EQ and analyser
src/services/recommendationEngine.js  Similarity scoring behind the Discovery Dial
src/services/storageService.js        localStorage persistence
src/components/visualizer.js          Canvas visualizer in the player bar
src/data/                  Track catalog, artists and default playlists
public/                    Audio, cover art and artist images
```

## Music

The catalog uses tracks by Broke For Free, Tours, Chad Crouch, Jason Shaw and SoundHelix, released under Creative Commons licenses. Each song's license is shown in its Credits card in the Now playing panel.
