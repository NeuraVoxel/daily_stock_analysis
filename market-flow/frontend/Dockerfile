# Build static assets
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html ./
COPY public ./public
COPY src ./src
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY .oxlintrc.json ./

RUN pnpm run build

# Serve via nginx; proxy /api to backend service
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
