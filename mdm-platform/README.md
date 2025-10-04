# mdm-platform

Plataforma de **Gestão de Dados Mestres (MDM)** focada em Parceiros de Negócio (cliente/fornecedor).
Monorepo com **Next.js (web)** + **NestJS (api)** + **PostgreSQL** + **Docker compose**.

## Pastas
- apps/web: Frontend (Next.js + TS + Tailwind)
- apps/api: Backend (NestJS + TypeORM + Swagger)
- packages/ui, utils, types: libs compartilhadas
- infra/docker: compose + Dockerfiles
- docs: anotações de arquitetura e contratos

## Como rodar localmente

### Pré-requisitos
- **Node.js 18+** (habilite o Corepack para usar a versão de PNPM do projeto).
- **PNPM 9** (`corepack enable` ou instalação manual).
- **Docker + Docker Compose** para subir PostgreSQL e pgAdmin.

### Passo a passo
1. **Clonar o repositório**
   ```bash
   git clone <URL-do-repo>
   cd mdm-platform
   ```
2. **Instalar dependências**
   ```bash
   corepack enable
   pnpm install
   ```
3. **Configurar variáveis de ambiente**
   ```bash
   cp apps/api/.env.example apps/api/.env.local
   cp apps/web/.env.example apps/web/.env.local
   ```
   - Ajuste `DATABASE_URL` para apontar ao PostgreSQL local (ex.: `postgres://mdm:mdm@localhost:5432/mdm`).
   - Defina `JWT_SECRET`, credenciais do Turnstile (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) e variáveis SAP conforme necessidade.
   - Informe `CNPJ_OPEN_API_TOKEN` em `apps/api/.env.local` com o token emitido pela CNPJa para habilitar as consultas externas.
4. **Subir banco de dados e pgAdmin**
   ```bash
   pnpm db:up
   ```
   (equivale a `docker compose -f infra/docker/docker-compose.dev.yml up -d db pgadmin`)
5. **Executar migrações TypeORM**
   ```bash
   pnpm --filter @mdm/api run migration:run
   ```
6. **(Opcional) Popular perfis/usuários padrão**
   ```bash
   pnpm --filter @mdm/api run seed:profiles
   ```
7. **Iniciar frontend e backend em modo dev**
   ```bash
   pnpm dev
   ```

### URLs úteis
- Web app: http://localhost:3000
- API + Swagger: http://localhost:3001/docs
- pgAdmin: http://localhost:5050 (login padrão `admin@example.com` / `admin`)

- Configure o SAP com `SAP_BASE_URL`, `SAP_USER`, `SAP_PASSWORD`, `SAP_REQUEST_TIMEOUT` (opcional, em ms).

### Sincronização automática com o SAP

- A integração é baseada na [API SAP Business Partner](https://api.sap.com/api/API_BUSINESS_PARTNER/resource/Business_Partner), reutilizando os recursos públicos de criação e atualização de `BusinessPartner`, endereços, funções e bancos.
- A API expõe um `SapSyncService` que periodicamente consulta o endpoint `/business-partners` do SAP para buscar cadastros e atualizações. O job roda por padrão a cada hora (`@Cron` com `SAP_SYNC_CRON` opcional) e respeita `SAP_SYNC_ENABLED=false` caso seja necessário desligar a sincronização.
- Campos retornados pelo SAP são mapeados para a entidade `Partner` (ex.: `sapBusinessPartnerId`, `sap_segments`, `addresses`, `banks`, contato, comunicação etc.) e qualquer alteração é salva com auditoria (`PartnerAuditLog`) indicando os diffs vindos do SAP.
- Segmentos implementados:
  - `businessPartner`: cria o registro principal via recurso `BusinessPartner` e persiste o `sapBusinessPartnerId` retornado.
  - `addresses`: atualiza `BusinessPartnerAddress` com os endereços associados.
  - `roles`: envia as funções do parceiro (`BusinessPartnerRole`), respeitando a lógica de cliente/fornecedor/transportador em `sap-integration.service.ts`.
  - `banks`: sincroniza contas bancárias (`BusinessPartnerBank`).
  - Cada chamada usa autenticação Basic (`SAP_USER`/`SAP_PASSWORD`) sobre HTTPS; tokens bearer não são emitidos automaticamente, então o usuário/senha técnicos precisam ter acesso aos escopos correspondentes na API SAP.
- Variáveis úteis:
  - `SAP_SYNC_ENABLED` (default `true`): controla tanto a integração quanto o job de leitura.
  - `SAP_SYNC_PAGE_SIZE` (default `50`): tamanho da página na paginação do SAP.
  - `SAP_SYNC_UPDATED_AFTER`: filtro opcional enviado ao SAP (`updatedAfter`).
  - `SAP_SYNC_CRON`: expressão cron opcional para customizar a frequência do job.
  - `SAP_REQUEST_TIMEOUT`: timeout de chamadas síncronas (ms, default `15000`).
- Para estudar o mapeamento completo consulte `apps/api/src/modules/partners/sap-integration.service.ts` (montagem dos payloads e segmentos) e `apps/api/src/modules/partners/sap-sync.mapper.ts` (transformação das respostas de leitura).
