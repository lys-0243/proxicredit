FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Les rewrites /api sont figés au build ; en production nginx route /api avant Next.js.
ARG BACKEND_URL=http://backend:8000
ENV BACKEND_URL=$BACKEND_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S proxicredit && adduser -S proxicredit -G proxicredit
COPY --from=build --chown=proxicredit:proxicredit /app/.next/standalone ./
COPY --from=build --chown=proxicredit:proxicredit /app/.next/static ./.next/static
COPY --from=build --chown=proxicredit:proxicredit /app/public ./public
USER proxicredit
EXPOSE 3000
CMD ["node", "server.js"]
