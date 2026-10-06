# 🌌 AuraStream — The Anti-Bloat Spotify Clone
> *A music-first sanctuary fixing Spotify's biggest blind spots with genuine open-source music, transparent vector recommendations, an interactive Discovery Dial, and pro audio studio tools.*

![AuraStream Banner](/covers/night-owl.svg)

---

## ⚡ Why AuraStream? Spotify’s Flaws vs. Our Solutions

Based on deep scans of Reddit communities (`r/truespotify`, `r/spotify`) and user complaints in 2024–2025, Spotify has drifted away from being a pure music player. AuraStream is engineered specifically to fix those pain points:

| # | Spotify Pain Point | AuraStream Fix |
|---|--------------------|----------------|
| 1 | **Home Feed Clutter & Bloat** (audiobooks, podcasts, TikTok vertical videos) | **Pure Music Sanctuary Mode**: Zero podcast or audiobook clutter. 100% music-focused layout. |
| 2 | **"Smart Shuffle" Echo Chamber** (loops the same 30 songs repeatedly) | **True Random (Fisher-Yates) Shuffle**: Guarantees zero algorithmic bias and cycles through all tracks without repeats. Plus **Smart Flow** for harmonic continuity. |
| 3 | **Black-Box Algorithmic Trap** (users feel trapped in one repetitive bubble) | **Discovery Dial & Explainable AI**: User-controlled slider from *Comfort Zone* (0–30%) to *Balanced Flow* (31–70%) to *Sonic Explorer* (71–100%), with clear reasons explaining why each song is recommended. |
| 4 | **Buried / Missing Equalizer** (4 submenus deep on mobile, missing on desktop) | **1-Click 5-Band Studio Equalizer**: Live BiquadFilter EQ (60Hz, 250Hz, 1kHz, 4kHz, 16kHz) with presets (Bass Boost, Vocal, Electronic, Acoustic, Rock). |
| 5 | **No Real-Time Audio Visualizer** | **HTML5 Canvas Audio Visualizer**: 3 switchable 60fps modes: *Neon Spectrum Bars*, *Oscilloscope Waveform*, and *Nebula Radial Pulse*. |
| 6 | **Broken Queue Handling** (queues get overwritten, cannot save queue as playlist) | **Interactive Queue Drawer**: Drag-and-drop reordering, clear queue, and one-click **"Save Queue as Playlist"**. |
| 7 | **Static Dark Mode** (monolithic dark gray feels lifeless) | **Dynamic Chromatic Glassmorphism**: Ambient backdrop glow automatically derives its palette from the currently playing album art. |
| 8 | **Desynced / Paywalled Lyrics** | **Synchronized Karaoke Lyrics**: Real-time line tracking, smooth autoscroll, and click-any-line to immediately seek audio. |
| 9 | **Lack of Pro Playback Controls** | **Pro Audio Toolkit**: 3D Spatial stereo wideness simulation and pitch-preserving playback speed control (0.75x to 2.0x). |

---

## 🎵 Real Open-Source Music Catalog

AuraStream comes pre-loaded with **14 genuine Creative Commons (CC-BY 3.0, CC-BY 4.0, and CC0)** full-length tracks spanning diverse genres, stored locally for instant zero-latency playback:

1. **Night Owl** — Broke For Free (*Indie Synthwave • 120 BPM • Euphoric*)
2. **Enthusiast** — Tours (*Indie Electro-Pop • 128 BPM • High Energy*)
3. **Golden Hour** — Broke For Free (*Lo-Fi Chillhop • 85 BPM • Chill*)
4. **Shipping Lanes** — Chad Crouch (*Minimalist Ambient • 100 BPM • Focus*)
5. **Night Rave** — Jason Shaw (*Cyberpunk Dance / EDM • 132 BPM • High Energy*)
6. **Bird In Hand** — Jason Shaw (*Acoustic Folk • 112 BPM • Warm*)
7. **Green Leaves** — Jason Shaw (*Fingerstyle Acoustic • 78 BPM • Chill*)
8. **Rock Tune** — Jason Shaw (*Classic Indie Rock • 138 BPM • High Energy*)
9. **Somber** — Jason Shaw (*Neo-Classical Grand Piano • 68 BPM • Melancholic*)
10. **Spanish Summer** — Jason Shaw (*Latin Flamenco Acoustic • 115 BPM • Vibrant*)
11. **Progressive Horizon** — SoundHelix (*Progressive Trance • 130 BPM • Euphoric*)
12. **Cyber Odyssey** — SoundHelix (*Synth Electro-Wave • 125 BPM • High Energy*)
13. **Deep Chill Pulse** — SoundHelix (*Ambient Downtempo • 95 BPM • Focus*)
14. **Solar Flare** — SoundHelix (*Melodic House • 126 BPM • Euphoric*)

---

## 🧠 The Recommendation Engine & "Discovery Dial"

Each song is encoded into a multi-dimensional normalized audio vector:
```
Vector = [ Genre, Mood, Tempo/BPM, Energy, Valence, Acousticness, Danceability ]
```

### The Discovery Dial:
- **0% – 30% (Comfort Zone)**: Strict harmonic and tempo matching. Perfect for studying or staying in a specific vibe.
- **31% – 70% (Balanced Flow)**: Blends neighboring genres and complementary moods (e.g., Synthwave $\leftrightarrow$ Melodic House).
- **71% – 100% (Sonic Explorer)**: Crosses genre boundaries to match mood harmony and acoustic surprises (e.g., transitioning from Synthwave to Flamenco Acoustic or Neo-Classical Piano).

---

## 🛠️ Architecture & Tech Stack

- **Core**: Semantic HTML5 & Modern ES6 JavaScript Modules
- **Styling**: Pure Vanilla CSS with CSS Custom Properties, Glassmorphism, and hardware-accelerated animations
- **Audio Pipeline**: Web Audio API (`AudioContext`, `MediaElementAudioSourceNode`, 5-band `BiquadFilterNode` EQ, `StereoPannerNode`, `AnalyserNode`)
- **Visualizer**: HTML5 2D Canvas rendering at 60fps with peak-decay metering
- **Persistence**: `localStorage` for Liked Tracks, Custom Playlists, History, and EQ settings
- **Build / Dev**: Vite 6

---

## 🚀 Running the App Locally

The application dev server is already running! You can open your browser to:
```
http://localhost:5173/
```

To run it again in the future:
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build production bundle
npm run build
```

---

## 📋 Features Checklist

- [x] Full-featured audio player bar with scrub seek, volume, and mute memory
- [x] 14 Real open-source tracks with local zero-latency audio files
- [x] Real-time 5-Band Studio Equalizer with presets
- [x] 3D Spatial stereo widener & playback rate adjustment
- [x] HTML5 Canvas audio visualizer with 3 switchable modes
- [x] Discovery Dial controller with live recommendation updates
- [x] True Fisher-Yates random shuffle (guaranteed zero repeats)
- [x] Smart Flow harmonic shuffle
- [x] Interactive queue drawer with drag-and-drop reordering
- [x] "Save Queue as Playlist" capability
- [x] Synchronized scrolling lyrics with karaoke highlights and click-to-seek
- [x] Fullscreen vinyl ambient theater mode with spinning record and lyrics
- [x] Dynamic chromatic background glow matching album art
- [x] Custom playlist creation, editing, and deletion with persistent storage
- [x] Liked songs collection with celebratory confetti
- [x] Omnibox search filtering tracks, artists, moods, BPM, and lyrics
