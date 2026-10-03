FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY package.json package-lock.json prisma.config.mjs ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/product-page/package.json apps/product-page/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY prisma ./prisma
RUN npm ci
COPY apps/web ./apps/web
COPY packages/domain ./packages/domain
ENV VITE_ENABLE_DEV_TOOLS=false
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
# Prisma CLI is required at startup to deploy versioned migrations.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --chown=node:node package.json package-lock.json prisma.config.mjs ./
COPY --chown=node:node apps/api ./apps/api
COPY --chown=node:node apps/web/static-policy.js ./apps/web/static-policy.js
COPY --chown=node:node packages/domain ./packages/domain
COPY --chown=node:node scripts/container-start.mjs ./scripts/container-start.mjs
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=120s CMD node -e "fetch('http://127.0.0.1:3001/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/container-start.mjs"]
