FROM node:20-alpine

WORKDIR /app

COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev

COPY server/dist/ ./dist/

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/index.js"]
