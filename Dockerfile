# Multi-stage build for CodeMentor AI
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build all components
RUN npm run build

# Production image, copy all the files and run the services
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 codementor

# Copy built application
COPY --from=builder --chown=codementor:nodejs /app/dist ./dist
COPY --from=builder --chown=codementor:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=codementor:nodejs /app/package.json ./package.json

# Create logs directory
RUN mkdir -p logs && chown codementor:nodejs logs

USER codementor

EXPOSE 3000 3001

CMD ["npm", "start"]