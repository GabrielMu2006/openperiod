FROM node:22-alpine
# 国内服务器：统一走 npmmirror 源
ENV npm_config_registry=https://registry.npmmirror.com
RUN npm i -g pnpm@10
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# 2G 内存服务器上构建时的保险丝
ENV NODE_OPTIONS=--max-old-space-size=1400

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
# NEXT_PUBLIC_* 在构建时注入：备案号经 --build-arg 传入镜像
ARG NEXT_PUBLIC_ICP_BEIAN
ENV NEXT_PUBLIC_ICP_BEIAN=$NEXT_PUBLIC_ICP_BEIAN
RUN pnpm build

ENV PORT=3000 HOSTNAME=0.0.0.0
EXPOSE 3000
CMD ["pnpm", "start"]
