# Planejar.me — API

API REST do Planejar.me (Node.js, Express 5, Prisma 7 e PostgreSQL). É independente da interface: o web, um futuro app e o bot usam os mesmos endpoints.

## Rodando com Docker (recomendado)

Sobe um Postgres local, aplica as migrations e inicia a API com recarga automática:

```bash
docker compose up
```

Na primeira vez, crie a conta demo (o seed recria os dados dela, então não rode de novo se quiser manter o que mudou):

```bash
docker compose run --rm api npm run seed
```

API em http://localhost:3001, banco em `localhost:5432` (usuário/senha `planejarme`). Conta demo: `demo@planejarme.com` / `password123`.

Upload de arquivos usa o Supabase Storage: sem `SUPABASE_URL` e `SUPABASE_SECRET_KEY` no `.env`, o resto funciona e só o upload falha. Para isso, crie um `.env` a partir do `.env.example` antes do `docker compose up` (o Compose lê as variáveis dele e troca o `DATABASE_URL` pelo banco local).

## Rodando sem Docker

```bash
cp .env.example .env   # preencha DATABASE_URL e JWT_SECRET
npm install            # também gera o Prisma Client
npx prisma migrate deploy --config prisma7.config.ts
npm run seed
npm run dev
```

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API com recarga (`tsx watch`) |
| `npm run build` / `npm start` | Typecheck + bundle e servidor de produção |
| `npm run typecheck` | Só o TypeScript |
| `npm test` | Testes sem banco |
| `RUN_DB_TESTS=1 npm test` | Inclui os testes que usam o banco e o bucket do Storage (use os de desenvolvimento) |

## Variáveis de ambiente

Todas estão comentadas no [`.env.example`](.env.example): banco, `JWT_SECRET`, Supabase Storage, Resend (recuperação de senha), OAuth Google/GitHub e `CRON_SECRET`.

## Organização

- `src/routes` → `src/controllers` → `src/services` → Prisma. Regra de negócio fica nos services.
- Validação com Zod em `src/schemas`; dono do registro checado em `src/services/authorization-service.ts`.
- Contrato de erros, autenticação e endpoints de conta: [`docs/ERROS.md`](docs/ERROS.md).
- Histórico do banco: [`prisma/migrations/README.md`](prisma/migrations/README.md). Mudança de schema sempre com migration nova.
- Tarefas agendadas: `vercel.json` chama `GET /cron/daily` (avisos, limpeza da lixeira, nova tentativa das remoções do Storage que falharam e varredura de arquivos sem registro) com `Authorization: Bearer <CRON_SECRET>`.
