# syntax=docker/dockerfile:1
FROM node:22.23.3-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ packages/

RUN npm ci

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

RUN addgroup -S app && adduser -S app -G app \
  && mkdir -p /home/app && chown app:app /home/app
ENV HOME=/home/app

USER app

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8787/health || exit 1

CMD ["npm", "run", "start:api"]
