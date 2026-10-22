# syntax=docker/dockerfile:1
# Bases oficiales verificadas por digest; no se copian secretos ni pesos Chronos.
FROM oven/bun:1.3.13-debian@sha256:e95356cb8e1de62ad69ab3bd3584ba947013d27650a226804d2fc0af4e17dac2 AS bun-runtime

FROM node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d AS frontend-build
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM bun-runtime AS backend-build
WORKDIR /app/backend
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile
COPY backend/ ./
# Prisma exige URL en su configuraciÃƒÂ³n aun al generar, pero no conecta aquÃƒÂ­.
RUN DATABASE_URL=postgresql://unused:unused@localhost:5432/unused bun --bun run prisma generate
RUN bun run typecheck

FROM python:3.12-slim-bookworm@sha256:6a0e06f5ba0b373d051aabd3fffb9b873f27f9a2a3a14bcbe37dee6f0e3bbc70 AS runtime-core
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libstdc++6 libgomp1 tzdata && rm -rf /var/lib/apt/lists/*
COPY --from=bun-runtime /usr/local/bin/bun /usr/local/bin/bun
RUN groupadd --gid 10001 enertrade && useradd --uid 10001 --gid enertrade --create-home enertrade
WORKDIR /app/backend
COPY --from=backend-build --chown=10001:10001 /app/backend /app/backend
COPY --from=frontend-build --chown=10001:10001 /build/frontend/dist /app/frontend-dist
COPY --chown=10001:10001 docs/evidencias/hu-04-multihorizon-v2/results.json /app/docs/evidencias/hu-04-multihorizon-v2/results.json
COPY --chown=10001:10001 docs/evidencias/hu-06-multihorizon-v3-semantic/results.json /app/docs/evidencias/hu-06-multihorizon-v3-semantic/results.json
COPY --chown=10001:10001 docs/evidencias/hu-06-demand-v5-frozen-models/h*.json /app/docs/evidencias/hu-06-demand-v5-frozen-models/
COPY --chown=10001:10001 deployment/ /app/deployment/
RUN sed -i 's/\r$//' /app/deployment/entrypoint.sh && mkdir -p /app/data && chown 10001:10001 /app/data && chmod +x /app/deployment/entrypoint.sh
ENV NODE_ENV=production PORT=8080 TZ=America/Bogota FRONTEND_DIST_DIR=/app/frontend-dist CHRONOS_EVIDENCE_DIR=/app/data/chronos-forecasts WEATHER_EVIDENCE_DIR=/app/data/weather-evidence CHRONOS_REQUIRED=false
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 CMD ["bun","-e","fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
ENTRYPOINT ["/app/deployment/entrypoint.sh"]
CMD ["bun","run","deploy.ts"]

FROM runtime-core AS runtime-chronos
USER root
RUN python -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.1
RUN /opt/venv/bin/pip install --no-cache-dir -r /app/deployment/requirements-chronos.txt && /opt/venv/bin/pip check && /opt/venv/bin/pip freeze --all > /app/deployment/python-environment.txt
ENV CHRONOS_REQUIRED=true CHRONOS_PYTHON_PATH=/opt/venv/bin/python CHRONOS2_MODEL_PATH=/models/chronos2 CHRONOS_BOLT_MODEL_PATH=/models/bolt HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1
USER 10001:10001
