# Stage 1: Build frontend
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .
# $shared (backend/src/shared) is outside this stage's WORKDIR but inside the build context
# (backend/, per docker-compose.yaml's build: .) — vite.config.ts's alias expects it at
# ../src/shared relative to the frontend dir, i.e. /app/src/shared here.
COPY src/shared /app/src/shared
# The build stamp (release.yml passes it); the SPA compares its own with /api/version to spot a stale tab
ARG VERSION=dev
ARG COMMIT=
ARG BUILD_TIME=
RUN VITE_APP_VERSION=$VERSION VITE_APP_COMMIT=$COMMIT VITE_APP_BUILD_TIME=$BUILD_TIME npm run build

# Stage 2: Build backend
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS backend-build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npx tsc

# Stage 3: Runtime
FROM node:22.23.4-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS runtime
WORKDIR /app
COPY --from=backend-build /app/node_modules ./node_modules
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/src/db/migrations ./dist/db/migrations
COPY --from=backend-build /app/src/mail/templates ./dist/mail/templates
COPY --from=backend-build /app/src/legal/defaults ./dist/legal/defaults
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

ARG VERSION=dev
ARG COMMIT=
ARG BUILD_TIME=
ENV NODE_ENV=production APP_VERSION=$VERSION APP_COMMIT=$COMMIT APP_BUILD_TIME=$BUILD_TIME
EXPOSE 3000
CMD ["node", "dist/index.js"]
