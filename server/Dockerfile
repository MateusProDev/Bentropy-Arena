FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/dist/ ./dist/

ENV PORT=8080
ENV NODE_ENV=production

# Optimize Node.js for long-running server
ENV NODE_OPTIONS="--max-old-space-size=512 --gc-interval=100"

EXPOSE 8080

# Use dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init
ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/index.js"]
