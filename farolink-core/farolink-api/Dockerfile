FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx tsc

# Copy non-TS assets that the compiled code needs at runtime
RUN cp -r src/docs dist/docs 2>/dev/null || true

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

ENV PORT=3000
EXPOSE 3000
CMD ["node", "dist/index.js"]
