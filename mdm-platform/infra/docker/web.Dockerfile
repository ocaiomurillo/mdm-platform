FROM node:20-alpine
WORKDIR /app
COPY package.json turbo.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/utils/package.json packages/utils/
RUN npm i -g pnpm
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @mdm/web... install --frozen-lockfile --prod=false
RUN pnpm -C apps/web build
EXPOSE 3000
CMD ["pnpm","-C","apps/web","start"]