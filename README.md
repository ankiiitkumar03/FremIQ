# FREMIQ

FREMIQ is a no-account, single-workspace video editing studio. Its goal is to take an authorized video source, understand its speech, suggest meaningful short clips, sync subtitles, and render reviewed edits through a simple responsive interface.

## What it supports

- Upload local video/audio files or import a direct downloadable media-file URL.
- Transcribe speech with a configured web provider or a paired Windows Local Agent running Faster-Whisper.
- Find clip candidates from speech, requested topics, scene changes, and pauses; preview, choose, and render them.
- Import, edit, style, sync, and burn subtitles.
- Build manual edits in Timeline Studio or describe a requested edit in AI Editor.
- Use FFmpeg by default; HyperFrames and Remotion are optional advanced render engines.
- Use Telegram automation after configuring a bot and a public HTTPS webhook.

## YouTube links

FREMIQ does not download or import video from arbitrary YouTube watch/live links. YouTube's developer policies prohibit downloading, importing, caching, or storing audiovisual copies without prior written approval. For a video you own or have permission to edit, export/download it through the authorized YouTube Studio workflow and upload that file to FREMIQ, or use a direct downloadable media-file URL from a source you control. See [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies#handling-youtube-data-and-content).

## Run locally

Requirements: Node.js 22+, Bun, PostgreSQL, and a persistent writable data folder. Copy .env.example to .env.local, set DATABASE_URL and a stable FREMIQ_SECRET (32+ random characters), then run:

- bun install
- bun run dev --port 4000

The local development command applies any pending database migrations before starting the app. If DATABASE_URL is missing, it shows the exact configuration step. Production releases should continue to run `bun run db:migrate` explicitly before deployment.

Open http://localhost:4000. FREMIQ has no app login and stores one shared workspace. Keep this local/private; do not expose it directly to the public internet. See [DEPLOYMENT.md](DEPLOYMENT.md) before deploying.

## Local transcription

Download the Windows companion from **Local Agent → Download Windows agent** in FREMIQ. Extract it, run **Start FREMIQ Agent.bat**, pair with its displayed URL and code, then install Faster-Whisper from **Tool Manager**. The first launch requires Python 3.10+ and internet access; it creates a private environment automatically. Keep the agent window open while transcribing. CPU mode works without an NVIDIA GPU; the first model download may take time. FREMIQ itself must run on the same computer because a remote server cannot reach the agent's local-only address.

## Development checks

- bun run typecheck
- bun run lint
- bun run agent:package (refreshes the downloadable Windows Local Agent ZIP after changing files in local-agent/)

Do not run multiple app replicas: media files and the render queue are local to one app process. Back up PostgreSQL and FREMIQ_DATA_DIR together.
