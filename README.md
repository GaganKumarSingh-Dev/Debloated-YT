<div align="center">

<img src="assets/logo.svg" alt="DebloatedYT Logo" width="72" />

# DebloatedYT

**A minimal, privacy-first YouTube client for Windows.**  
No ads. No tracking. No Shorts. No login. Just content.

[![License: MIT](https://img.shields.io/badge/License-MIT-white.svg)](https://github.com/GaganKumarSingh-Dev/Debloated-YT/blob/main/LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)]()
[![Built with Electron](https://img.shields.io/badge/Built%20with-Electron-47848F.svg)](https://www.electronjs.org/)
[![Release](https://img.shields.io/github/v/release/GaganKumarSingh-Dev/Debloated-YT)](https://github.com/GaganKumarSingh-Dev/Debloated-YT/releases)

</div>

---

## What is this?

DebloatedYT is a local-first YouTube client that strips away everything YouTube forces on you ads, autoplay manipulation, Shorts, algorithmic rabbit holes and replaces it with a clean, fast, dark interface powered entirely by your own machine.

> ✨ **This is a vibe-coded project** designed, architected, and built by feeling out the right decisions along the way. No corporate roadmap, no sprints, just the idea of a cleaner YouTube and the tools to build it.

Your watch history, subscriptions, playlists, and recommendations are all stored locally in JSON files. Nothing is sent to any server. The app never asks you to log in.

---

## Download & Run (Recommended)

Don't want to deal with Node.js or the terminal? Just download and run the installer.

**[⬇ Download DebloatedYT v1.0.1 for Windows (.exe)](https://github.com/GaganKumarSingh-Dev/Debloated-YT/releases/tag/v1.0.1)**

1. Download the `.exe` installer from the link above
2. Run the installer Windows may show a SmartScreen warning since the app isn't code-signed, click **"More info" → "Run anyway"**
3. Launch DebloatedYT
4. On first launch, go to **Settings** and set the paths for yt-dlp, VLC, and ffmpeg
5. Select your interests on the onboarding screen and you're in

> See all releases → [github.com/GaganKumarSingh-Dev/Debloated-YT/releases](https://github.com/GaganKumarSingh-Dev/Debloated-YT/releases)

---

## Features

- **Home Feed** -> Personalized video feed built from your interests using a local scoring algorithm. No server-side tracking.
- **Custom Recommendation Algorithm** -> Scores videos based on your interest tags, subscribed channels, recency, and watch history. Pure JavaScript, zero ML.
- **Subscriptions** -> Subscribe to any YouTube channel by URL. New videos are automatically fetched and cached every time the app launches.
- **History** -> Every video you watch is logged locally. Used to avoid re-recommending content and to boost channels you watch often.
- **Playlists** -> Create, manage, and play local playlists. Play all launches videos sequentially via VLC.
- **Up to 4K Playback** -> Streams via VLC with ffmpeg merging separate audio/video tracks for 1080p+ quality.
- **Quality Switching** -> Switch video quality mid-playback. Saves your current timestamp, relaunches VLC at the same position.
- **Subtitles** -> Auto-fetches subtitles via yt-dlp and passes them directly to VLC.
- **Shorts Filter** -> Any video under 61 seconds or with `/shorts/` in the URL is automatically dropped. Everywhere.
- **Thumbnail Cache** -> Thumbnails are downloaded and cached locally so they never re-download on relaunch.
- **No login. No Google account. No cookies. No ads.**

---

## Tech Stack

| Layer | Tool |
|---|---|
| Desktop shell | Electron |
| UI | Vanilla HTML + CSS + JS |
| Metadata & streams | yt-dlp |
| Playback | VLC (subprocess) |
| Audio/video merging | ffmpeg |
| VLC IPC | RC interface (localhost:9090) |
| Subtitles | yt-dlp `.vtt` → VLC `--sub-file` |
| Storage | Local JSON files |
| Packaging | electron-builder → `.exe` |

---

## Prerequisites

Before running the app, install these separately and note their paths:

1. **Node.js** (LTS) -> [nodejs.org](https://nodejs.org)
2. **yt-dlp** -> [github.com/yt-dlp/yt-dlp/releases](https://github.com/yt-dlp/yt-dlp/releases) - download `yt-dlp.exe`
3. **VLC** -> [videolan.org](https://www.videolan.org/) - install normally
4. **ffmpeg** -> [ffmpeg.org/download.html](https://ffmpeg.org/download.html) - download the Windows build

> yt-dlp and VLC are **not bundled** with this app. You install them yourself and point the app to their paths via Settings.

---

## Run from Source

Prefer to run it yourself or contribute?

```bash
# Clone the repo
git clone https://github.com/GaganKumarSingh-Dev/Debloated-YT.git
cd Debloated-YT

# Install dependencies
npm install

# Run the app
npm start
```

On first launch, set your yt-dlp, VLC, and ffmpeg paths in **Settings**, then select your interests on the onboarding screen.

---

## Building the .exe

```bash
npm run build
```

This produces a Windows installer in the `dist/` folder via electron-builder. The output is a standalone `.exe` no Node.js or npm required on the target machine.

---

## Folder Structure

```
DebloatedYT/
├── main.js                  # Electron main process, IPC handlers
├── preload.js               # Context bridge exposes API to renderer
├── renderer/                # UI - HTML, CSS, JS pages and components
├── src/
│   ├── ytdlp.js             # All yt-dlp calls via child_process
│   ├── vlc.js               # VLC launcher + RC interface
│   ├── recommender.js       # Video scoring algorithm
│   ├── subscriptionManager.js
│   ├── historyManager.js
│   ├── playlistManager.js
│   └── dataManager.js
├── data/                    # Local JSON storage
│   ├── config.json
│   ├── history.json
│   ├── subscriptions.json
│   ├── playlists.json
│   └── feed_cache.json
├── cache/
│   └── thumbnails/          # Locally cached thumbnail images
└── assets/                  # Logo, app icon
```

---

## Recommendation Algorithm

The home feed is built entirely on device using this scoring logic:

```
score = (interest_tag_match × 3)
      + (subscribed_channel × 4)
      + (recency_bonus)
      + (channel_watch_frequency, capped at 3)
      + (view_count_mild_boost)
      - (already_watched penalty × 10)
```

No ML. No external API. Feels personal because it's built entirely from your own data.

---

## Feed Caching Strategy

| Launch | Behavior |
|---|---|
| First ever | Loading screen while yt-dlp fetches. Shows progress. |
| Cache < 24h old | Opens instantly from JSON cache. Refreshes silently in background. |
| Cache > 24h old | Background refresh triggered on launch. |

---

## Legal Disclaimer

DebloatedYT does not download, store, or redistribute YouTube content. It is a personal streaming interface for publicly available content. Use is subject to YouTube's Terms of Service. yt-dlp and VLC are separate tools not bundled with this application. The developer is not responsible for misuse.

This project is inspired by open-source alternatives like [FreeTube](https://github.com/FreeTubeApp/FreeTube) and [NewPipe](https://github.com/TeamNewPipe/NewPipe).

---

## License

[MIT](./LICENSE) © 2026 Gagan Kumar Singh
