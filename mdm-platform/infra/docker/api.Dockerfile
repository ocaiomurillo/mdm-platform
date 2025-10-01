FROM node:20-alpine
WORKDIR /app
COPY package.json turbo.json ./
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
RUN npm i -g pnpm
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --frozen-lockfile --prod=false
RUN pnpm --filter @mdm/api... install --frozen-lockfile --prod=false
RUN pnpm -C apps/api build
EXPOSE 3001
CMD ["pnpm","-C","apps/api","start:prod"]