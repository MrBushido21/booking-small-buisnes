# --- Стадия 1: сборка ---------------------------------------------------------
# Здесь есть devDependencies и исходники на TypeScript. В финальный образ
# эта стадия целиком не попадает — из неё забираем только собранный dist.
FROM node:24-alpine AS builder

WORKDIR /app

# Сначала только манифесты: если package*.json не менялись, Docker переиспользует
# слой с установленными зависимостями и не будет качать их заново на каждый билд.
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Стадия 2: прод-зависимости ----------------------------------------------
# Ставим отдельно, чтобы в рантайм не утащить devDependencies (typescript, jest и т.д.)
FROM node:24-alpine AS deps

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# --- Стадия 3: рантайм --------------------------------------------------------
FROM node:24-alpine AS runtime

# dumb-init как PID 1: пробрасывает SIGTERM в node и хоронит зомби-процессы.
# Без него `docker stop` не даст Nest выполнить graceful shutdown и убьёт по таймауту.
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
WORKDIR /app

# В образе node:alpine пользователь node (uid 1000) уже есть — от root не работаем:
# пробой в приложении не должен давать права на весь контейнер.
COPY --chown=node:node --from=deps    /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist         ./dist
COPY --chown=node:node package*.json ./

# папка для загрузок должна принадлежать node, иначе запись упадёт с EACCES
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node

EXPOSE 3000

# healthcheck дублируем в compose; здесь — чтобы образ был самодостаточным
# и `docker run` тоже показывал статус healthy/unhealthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
