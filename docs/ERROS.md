# Contrato de erros

O formato existente é preservado: `success: false`, `data: null`, `message`, `errorCode` e, quando houver detalhes, `errors`.

Validação retorna HTTP 400 e `INVALID_DATA`, com uma lista de `{ field, code, message }` em português. Os dados enviados não são ecoados. Os schemas compartilham a configuração de idioma em `src/schemas/zod.ts`.

Foram mantidos os códigos existentes e adicionados códigos específicos para disciplinas, avaliações, tarefas, materiais, horários, caixa de entrada e notificações inexistentes. Tanto leituras sem resultado quanto atualizações/exclusões com Prisma P2025 retornam 404.

Autenticação distingue ausência de credencial (`UNAUTHORIZED`), token inválido (`AUTH_TOKEN_INVALID`) e expirado (`AUTH_TOKEN_EXPIRED`), todos com 401 e o mesmo envelope.

Outros casos: `TOO_MANY_REQUESTS` (429, com `Retry-After`, em `POST /auth/signin` e `POST /users`), `DUPLICATE_RECORD` (409), `RELATED_RECORD_NOT_FOUND` (409), `SERVICE_UNAVAILABLE` (503), `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413) e `ROUTE_NOT_FOUND` (404). Duplicidade de e-mail/telefone conserva `USER_ALREADY_EXISTS` e o status 400 atual. Erros inesperados retornam 500 com mensagem genérica, sem stack ou detalhes do banco.

A normalização está em `src/utils/normalize-error.ts`, utilizada pelo wrapper dos controllers e pelo middleware global. Não há mudanças em schemas do banco ou regras de negócio.

Validação: `npm test` (37 testes), `npm run typecheck` e `npm run build`. Os testes HTTP enviam dados inválidos antes de acessar o banco. Erros do Prisma são simulados; CRUD completo em banco real não foi testado.

## Autenticação e isolamento

Todas as rotas exigem `Authorization: Bearer <token>`, exceto `POST /auth/signin`, `POST /auth/forgot-password`, `POST /auth/reset-password` e `POST /users` (cadastro). Acesso a registro de outro usuário retorna 403 `FORBIDDEN`; registro inexistente retorna 404 com o código do recurso. A checagem fica em `src/services/authorization-service.ts`; o alias `me` nas rotas `/user/:userId` aponta para o usuário do token.

Em materiais, `userId` e `storagePath` nunca vêm do corpo: o dono é o usuário do token e o `storagePath` só é definido pelo upload. Materiais antigos sem `userId` pertencem ao dono da disciplina.

Login com e-mail inexistente ou senha errada responde igual: 400 `INVALID_CREDENTIALS`, com o mesmo custo de bcrypt.

Testes: `tests/isolation.test.ts` (rode com `RUN_DB_TESTS=1` para incluir os casos com banco).

## Conta (RF02, RN23, RNF04)

- `POST /auth/forgot-password` `{ email }`: sempre 200 com a mesma resposta, exista ou não a conta. Envia pelo Resend um link de uso único que vale 30 minutos; o banco guarda só o SHA-256 do token. Sem `RESEND_API_KEY`, fora de produção o link aparece no log da API.
- `POST /auth/reset-password` `{ token, password }`: link inválido, usado ou expirado retorna 400 `PASSWORD_RESET_TOKEN_EXPIRED`. Sessões JWT já emitidas continuam válidas até expirar.
- `GET /users/me/export`: JSON com todos os dados do usuário (sem `passwordHash`), incluindo materiais.
- `DELETE /users/me` `{ password }`: exige a senha (400 `INVALID_DATA` se errada ou ausente). Apaga materiais, arquivos do Storage e, em cascata, o resto da conta.

Limites por IP: 5 pedidos de link e 10 redefinições a cada 15 minutos.
