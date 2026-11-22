# Deployment readiness

## Current deployment shape

FREMIQ is a single-workspace Node.js application. PostgreSQL stores project data, while original media, thumbnails, temporary files, and rendered exports live under `FREMIQ_DATA_DIR`. The render queue runs inside the application process.

Deploy it as one persistent Node.js 22+ instance with a writable persistent data volume and a PostgreSQL database. Do not use a serverless target or multiple app replicas: local media paths and the in-process render queue are not shared or coordinated between instances.

## Required configuration

Copy `.env.example` into the deployment environment (do not commit real credentials) and set:

- `DATABASE_URL`: a PostgreSQL connection string reachable from the app.
- `FREMIQ_SECRET`: at least 32 random characters. Generate a value with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Keep it unchanged and backed up; changing it makes saved Telegram, GitHub, AI, and Local Agent secrets unreadable.
- `FREMIQ_DATA_DIR`: a persistent writable volume path. Back it up together with PostgreSQL; both are required to restore media and project records.

Run `bun install`, `bun run db:migrate`, `bun run typecheck`, `bun run lint`, and `bun run build` in the release pipeline. Start the built app with `bun run start`; it binds to `127.0.0.1` because this release has no application login. A same-host reverse proxy may forward traffic after it enforces private access. Do not change the bind address or expose the app directly to the internet. The reverse proxy must support uploads up to the configured 2 GB application limit and long-running FFmpeg requests; monitor memory and disk capacity.

## Public launch gate

Do not expose this build directly to the public internet yet. It has no user login or per-user data isolation: all visitors reach the same workspace, settings, media, saved integration credentials, render jobs, and tool-management APIs. Put it behind an authenticated access proxy for a private single-user deployment. A public multi-user product needs application authentication, per-user ownership checks on every API and file route, and isolated storage before launch.

If Telegram webhooks are enabled behind an access proxy, permit `POST /api/telegram/webhook` through that proxy. The handler verifies Telegram's secret-token header and also checks the configured user and chat allowlists. Keep all other FREMIQ routes protected.

## Operations

- Keep one application replica and monitor its memory, disk, PostgreSQL connectivity, and FFmpeg job failures.
- Back up PostgreSQL and the complete `FREMIQ_DATA_DIR` volume on a schedule; test restoring both together.
- Apply Drizzle migrations before switching application code to a release that depends on them.
- Set TLS at the reverse proxy and restrict database network access to the app host.
- Configure any external AI or Telegram integration only after access control and secret backups are in place.

## Known deployment limits

- The Windows Local Agent package is available at /downloads/fremiq-local-agent.zip; users download and start it separately on their computer.
- The current server-side Local Agent bridge is intended for a FREMIQ web app running on the same computer. A remote hosted FREMIQ server cannot reach a visitor's 127.0.0.1; remote SaaS support needs a browser-to-agent transport or a secure relay.
- HyperFrames, Remotion, Whisper, and other host tools must be installed on the machine that runs the render worker; a hosted container does not automatically access tools on a visitor's computer.
- This release pipeline intentionally does not publish or deploy automatically. Choose and configure the production host, database, persistent volume, domain, and access proxy first.
