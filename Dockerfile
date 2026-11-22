FROM oven/bun:1.4.4-debian

ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    FREMIQ_DATA_DIR=/var/lib/fremiq \
    FFMPEG_PATH=/usr/bin/ffmpeg \
    FFPROBE_PATH=/usr/bin/ffprobe

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg git python3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin fremiq \
    && mkdir -p /var/lib/fremiq \
    && chown fremiq:fremiq /var/lib/fremiq

WORKDIR /app
COPY --chown=fremiq:fremiq package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY --chown=fremiq:fremiq next.config.ts postcss.config.mjs tailwind.config.ts tsconfig.json components.json drizzle.config.ts eslint.config.mjs proxy.ts ./
COPY --chown=fremiq:fremiq src ./src
COPY --chown=fremiq:fremiq public ./public
COPY --chown=fremiq:fremiq drizzle ./drizzle
COPY --chown=fremiq:fremiq scripts ./scripts
COPY --chown=fremiq:fremiq local-agent ./local-agent
RUN bun run build \
    && bun run agent:verify \
    && chown -R fremiq:fremiq /app/.next

USER fremiq
EXPOSE 4000
CMD ["sh", "-c", "bun run db:migrate && exec bun run start:container"]
