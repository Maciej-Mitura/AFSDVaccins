# Build context: repository root (examMaciej/)
# docker build -f packages/api/Dockerfile .

# ---- dependencies + compile ----
FROM node:22.16.0-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/pwa/package.json ./packages/pwa/
COPY packages/types/package.json ./packages/types/

RUN npm ci

COPY packages/api ./packages/api

RUN npm run build --workspace=@vaccin-delivery/api

# ---- minimal runtime ----
FROM node:22.16.0-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S vaccin && adduser -S vaccin -G vaccin

COPY package.json package-lock.json ./
COPY packages/api/package.json ./packages/api/
COPY packages/pwa/package.json ./packages/pwa/
COPY packages/types/package.json ./packages/types/

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/packages/api/dist ./packages/api/dist

RUN find /app/packages/api/dist -name '*.map' -delete \
  && chown -R vaccin:vaccin /app/packages/api/dist

WORKDIR /app/packages/api

USER vaccin

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
