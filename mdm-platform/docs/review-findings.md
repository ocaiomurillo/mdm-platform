# Revisão funcional - integração parceiros

## Correção imediata aplicada
- Criada a migração `1700000006000-create-partner-notes.ts` para materializar a tabela `partner_notes`, evitando falhas ao listar detalhes de parceiros após a adição do módulo de notas. Antes disso, qualquer chamada a `/partners/:id/details` ou `/partners/:id/notes` quebrava por ausência da tabela. ✅

## Pontos que permanecem em aberto
1. **Documentação desatualizada:** `docs/api-contracts.md` ainda não cita os novos endpoints de notas (`GET/POST /partners/:id/notes`), notificações (`GET /notifications`), manutenção de usuários (`GET /user-maintenance`) e histórico (`GET /history`). Quem consulta apenas o contrato oficial não enxerga essas rotas.
2. **Módulos auxiliares com dados mockados:** os serviços de notificações, manutenção de usuários e histórico retornam dados estáticos em memória. Para um piloto controlado pode bastar, mas precisamos definir se haverá persistência (PostgreSQL) ou integração com fontes externas antes de liberar testes com usuários reais.
3. **Cobertura de testes para notas:** não há testes garantindo o fluxo de criação/listagem de notas tanto na API quanto no front-end. Recomendo criar cenários unitários para `PartnersService.createNote`/`listNotes` e um teste de integração rápido exercendo o endpoint protegido por JWT.

## Recomendações próximas
- Atualizar o guia de contratos e README com as rotas recém-adicionadas e fluxos de navegação (notificações, histórico e manutenção de usuários).
- Planejar migração/seed para popular usuários perfis/permissões reais, evitando depender dos mocks existentes nas novas telas.
