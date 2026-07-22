# Build context: repository root (examMaciej/)
# docker build -f packages/pwa/Dockerfile .

# ---- Vite production build ----
FROM node:22.16.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/pwa/package.json ./packages/pwa/
COPY packages/types/package.json ./packages/types/

RUN npm ci

COPY packages/api ./packages/api
COPY packages/pwa ./packages/pwa
COPY packages/types ./packages/types

# Public browser configuration only (build-time). Never pass secrets here.
ARG VITE_BACKEND_URL=http://localhost:3000/graphql
ARG VITE_BACKEND_WS_URL=ws://localhost:3000/graphql
ARG VITE_FIREBASE_API_KEY=replace-me
ARG VITE_FIREBASE_AUTH_DOMAIN=replace-me.firebaseapp.com
ARG VITE_FIREBASE_PROJECT_ID=replace-me
ARG VITE_FIREBASE_STORAGE_BUCKET=replace-me.appspot.com
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=replace-me
ARG VITE_FIREBASE_APP_ID=replace-me
# Explicitly refuse Playwright auth bypass in production images.
ARG VITE_E2E_AUTH_BYPASS=

ENV VITE_BACKEND_URL=$VITE_BACKEND_URL \
    VITE_BACKEND_WS_URL=$VITE_BACKEND_WS_URL \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN if [ "$VITE_E2E_AUTH_BYPASS" = "true" ] || [ "$VITE_E2E_AUTH_BYPASS" = "1" ]; then \
      echo "ERROR: VITE_E2E_AUTH_BYPASS must not be enabled for production PWA images" >&2; \
      exit 1; \
    fi \
  && npm run generate:graphql \
  && npm run build --workspace=@vaccin-delivery/pwa \
  && test -f packages/pwa/dist/index.html \
  && test -f packages/pwa/dist/sw.js \
  && test -f packages/pwa/dist/manifest.webmanifest

# ---- nginx static server ----
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY packages/pwa/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/pwa/dist /usr/share/nginx/html
COPY packages/pwa/public/docker-health.txt /usr/share/nginx/html/health

USER nginx

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
