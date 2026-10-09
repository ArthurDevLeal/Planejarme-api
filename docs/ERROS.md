# Contrato de erros

O formato existente é preservado: `success: false`, `data: null`, `message`, `errorCode` e, quando houver detalhes, `errors`.

Validação retorna HTTP 400 e `INVALID_DATA`, com uma lista de `{ field, code, message }` em português. Os dados enviados não são ecoados. Os schemas compartilham a configuração de idioma em `src/schemas/zod.ts`.

Foram mantidos os códigos existentes e adicionados códigos específicos para disciplinas, avaliações, tarefas, materiais, horários, caixa de entrada e notificações inexistentes. Tanto leituras sem resultado quanto atualizações/exclusões com Prisma P2025 retornam 404.

Autenticação distingue ausência de credencial (`UNAUTHORIZED`), token inválido (`AUTH_TOKEN_INVALID`) e expirado (`AUTH_TOKEN_EXPIRED`), todos com 401 e o mesmo envelope. As rotas CRUD existentes não passaram a exigir autenticação nesta alteração.

Outros casos: `DUPLICATE_RECORD` (409), `RELATED_RECORD_NOT_FOUND` (409), `SERVICE_UNAVAILABLE` (503), `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413) e `ROUTE_NOT_FOUND` (404). Duplicidade de e-mail/telefone conserva `USER_ALREADY_EXISTS` e o status 400 atual. Erros inesperados retornam 500 com mensagem genérica, sem stack ou detalhes do banco.

A normalização está em `src/utils/normalize-error.ts`, utilizada pelo wrapper dos controllers e pelo middleware global. Não há mudanças em schemas do banco ou regras de negócio.

Validação: `npm test` (37 testes), `npm run typecheck` e `npm run build`. Os testes HTTP enviam dados inválidos antes de acessar o banco. Erros do Prisma são simulados; CRUD completo em banco real não foi testado.
