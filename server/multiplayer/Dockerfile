FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY server/multiplayer/package.json server/multiplayer/package-lock.json ./
RUN npm ci
COPY server/multiplayer/*.mts server/multiplayer/tsconfig.json ./server/multiplayer/
COPY shared/multiplayer/*.mts ./shared/multiplayer/
RUN ./node_modules/.bin/tsc -p server/multiplayer/tsconfig.json && npm prune --omit=dev

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/multiplayer/dist ./
USER node
EXPOSE 8080
CMD ["node", "server/multiplayer/main.mjs"]
