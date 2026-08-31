# Dockerfile para dashboard Next.js de INTEGRAlab
# Multistage build: pequeña imagen final

FROM node:18-alpine AS base
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Builder stage
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM base AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
