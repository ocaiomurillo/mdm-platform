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

- Configure o SAP com `SAP_BASE_URL`, `SAP_USER`, `SAP_PASSWORD`, `SAP_REQUEST_TIMEOUT` (opcional, em ms).

### Sincronização automática com o SAP

- A API expõe um `SapSyncService` que periodicamente consulta o endpoint `/business-partners` do SAP para buscar cadastros e atualizações. O job roda por padrão a cada hora (`@Cron` com `SAP_SYNC_CRON` opcional) e respeita `SAP_SYNC_ENABLED=false` caso seja necessário desligar a sincronização.
- Campos retornados pelo SAP são mapeados para a entidade `Partner` (ex.: `sapBusinessPartnerId`, `sap_segments`, `addresses`, `banks`, contato, comunicação etc.) e qualquer alteração é salva com auditoria (`PartnerAuditLog`) indicando os diffs vindos do SAP.
- Variáveis úteis:
  - `SAP_SYNC_ENABLED` (default `true`): controla tanto a integração quanto o job de leitura.
  - `SAP_SYNC_PAGE_SIZE` (default `50`): tamanho da página na paginação do SAP.
  - `SAP_SYNC_UPDATED_AFTER`: filtro opcional enviado ao SAP (`updatedAfter`).
  - `SAP_SYNC_CRON`: expressão cron opcional para customizar a frequência do job.
