FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/orchestrator/package.json ./packages/orchestrator/
RUN npm ci --workspace=packages/orchestrator

COPY packages/orchestrator/tsconfig.json ./packages/orchestrator/
COPY packages/orchestrator/src ./packages/orchestrator/src
RUN npm run build --workspace=packages/orchestrator

FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY packages/orchestrator/package.json ./packages/orchestrator/
RUN npm ci --workspace=packages/orchestrator --omit=dev

COPY --from=builder /app/packages/orchestrator/dist ./packages/orchestrator/dist

WORKDIR /app/packages/orchestrator
EXPOSE 4001
CMD ["node", "dist/main.js"]
