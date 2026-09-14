FROM node:22-alpine
RUN corepack enable && npm i -g pnpm@10
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# 2G 内存服务器上构建时的保险丝
ENV NODE_OPTIONS=--max-old-space-size=1400

COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "start"]
