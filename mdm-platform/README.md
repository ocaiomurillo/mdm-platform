# mdm-platform

Plataforma de **GestÃ£o de Dados Mestres (MDM)** focada em Parceiros de NegÃ³cio (cliente/fornecedor).
Monorepo com **Next.js (web)** + **NestJS (api)** + **PostgreSQL** + **Docker compose**.

## Pastas
- apps/web: Frontend (Next.js + TS + Tailwind)
- apps/api: Backend (NestJS + TypeORM + Swagger)
- packages/ui, utils, types: libs compartilhadas
- infra/docker: compose + Dockerfiles
- docs: anotaÃ§Ãµes de arquitetura e contratos

## Dev quickstart
1. `pnpm i` (ou npm/yarn) na raiz
2. `docker compose -f infra/docker/docker-compose.dev.yml up -d db pgadmin`
3. `pnpm --filter @mdm/api run migration:run`
4. `pnpm dev` (roda web e api via turbo)

- Configure o SAP com `SAP_BASE_URL`, `SAP_USER`, `SAP_PASSWORD`, `SAP_REQUEST_TIMEOUT` (opcional, em ms) e opcionalmente `SAP_SYNC_ENABLED=false` para desativar o envio automático.
