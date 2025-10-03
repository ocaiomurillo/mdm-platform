# Contratos de API (MVP)

Todos os endpoints abaixo, exceto `/auth/login`, estão protegidos por JWT e exigem header `Authorization: Bearer <token>`.

## Autenticação

| Método | Caminho       | Descrição |
| ------ | ------------- | --------- |
| POST   | /auth/login   | Autentica um usuário e retorna o JWT para chamadas subsequentes. |

## Parceiros

### Cadastro e consulta

| Método | Caminho | Descrição / Observações |
| ------ | ------- | ----------------------- |
| POST   | /partners | Cria um novo parceiro. |
| GET    | /partners?search=&status= | Lista parceiros com filtros opcionais `search` e `status`. |
| GET    | /partners/search?q=&... | Busca parceiros com parâmetro principal `q` e filtros adicionais. |
| GET    | /partners/:id | Busca um parceiro específico pelo identificador. |
| GET    | /partners/:id/details | Retorna os detalhes completos de um parceiro. |
| GET    | /partners/cnpj/:cnpj | Localiza parceiro por CNPJ na base e/ou integrações. |
| GET    | /partners/cpf/:cpf | Localiza parceiro por CPF na base e/ou integrações. |

### Change Requests

| Método | Caminho | Descrição / Observações |
| ------ | ------- | ----------------------- |
| POST   | /partners/:id/change-requests | Cria uma solicitação de alteração para o parceiro informado. |
| POST   | /partners/change-requests/bulk | Cria change requests em lote para múltiplos parceiros. |
| GET    | /partners/:id/change-requests | Lista change requests do parceiro; suporta filtros definidos em `ChangeRequestListQueryDto`. |

### Auditorias

| Método | Caminho | Descrição / Observações |
| ------ | ------- | ----------------------- |
| POST   | /partners/:id/audit | Solicita auditoria individual informando opcionalmente `requestedBy`. |
| POST   | /partners/audit | Solicita auditoria em lote com `partnerIds` e `requestedBy`. |
| GET    | /partners/audit/:jobId | Consulta o status do job de auditoria. |

### Fluxo de aprovação por etapa

| Método | Caminho | Descrição / Observações |
| ------ | ------- | ----------------------- |
| POST   | /partners/:id/submit | Submete o parceiro para validação e inicia o envio dos dados principais ao SAP. |
| POST   | /partners/:id/fiscal/approve | Aprova a etapa fiscal. Requer perfil autorizado na etapa fiscal. |
| POST   | /partners/:id/fiscal/reject | Reprova a etapa fiscal. Corpo aceita `motivo`. |
| POST   | /partners/:id/compras/approve | Aprova a etapa de compras. |
| POST   | /partners/:id/compras/reject | Reprova a etapa de compras com `motivo` opcional. |
| POST   | /partners/:id/dados-mestres/approve | Aprova a etapa de dados mestres. |
| POST   | /partners/:id/dados-mestres/reject | Reprova a etapa de dados mestres com `motivo` opcional. |

### Integrações SAP

| Método | Caminho | Descrição / Observações |
| ------ | ------- | ----------------------- |
| POST   | /partners/:id/integrations/sap/retry | Reprocessa todos os segmentos SAP pendentes ou com falha. Requer variáveis `SAP_BASE_URL`, `SAP_USER`, `SAP_PASSWORD`. |
| POST   | /partners/:id/integrations/sap/:segment | Dispara o envio de um segmento específico ao SAP (`businessPartner`, `addresses`, `roles`, `banks`). Parceiro deve estar com etapa finalizada. |

