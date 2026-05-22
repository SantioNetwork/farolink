FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

# Copy non-TS assets needed at runtime
RUN cp -r src/config/chains.json dist/src/config/chains.json 2>/dev/null || true

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=3002
EXPOSE 3002
CMD ["node", "dist/src/index.js"]
