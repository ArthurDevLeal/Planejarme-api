# Migrations

## Baseline

O histórico anterior tinha 5 pastas de migration **sem `migration.sql`** (`20261009140000` a
`20261009144000`), mas o banco já tinha essas mudanças aplicadas. Rodar o fluxo normal de
migration nessa situação acusaria divergência e poderia tentar recriar tabelas.

Em `2026-10-15` o histórico foi **squashado em uma única migration de baseline**,
`20260101000000_baseline/migration.sql`, gerada a partir de `prisma/schema.prisma` com:

```bash
npx prisma migrate diff --config prisma7.config.ts --from-empty --to-schema prisma/schema.prisma --script
```

O baseline reproduz exatamente o estado que o banco tinha (incluindo `Semester`,
`ScheduleAttendance`, `defaultGradingSystem` e `semesterId`). O banco de desenvolvimento foi
resetado e passou a ter só o baseline, depois recebeu o seed.

## Migrations seguintes

| Migration | O que faz |
| --- | --- |
| `20261015000000_semester_date_backfill` | Preenche `startDate`/`endDate` nulos antes do `NOT NULL`. |
| `20261015125502_semester_required_dates` | Torna `Semester.startDate` e `Semester.endDate` obrigatórios. |
| `20261101120000_user_rounding_mode` | Adiciona `User.roundingMode` (`NEAREST` por padrão) para a RN09. Aditiva. |

## Backup do banco de dev

Antes do reset, os dados existentes foram exportados para `prisma/backups/`. Para gerar um novo
snapshot antes de qualquer operação destrutiva:

```bash
node scripts/db-snapshot.mjs
```

## Cuidados

- `prisma migrate reset` apaga todos os dados. Use `db-snapshot.mjs` antes.
- As migrations a partir de agora devem ser criadas com `npx prisma migrate dev --name <nome>`.
