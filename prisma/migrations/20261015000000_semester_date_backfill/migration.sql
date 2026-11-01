-- Preenche os semestres criados antes das datas obrigatórias.
-- O intervalo é conservador (criação do registro + 6 meses) e editável
-- pelo usuário na tela de configurações. Sem este passo, o NOT NULL
-- aplicado em seguida falharia nos registros existentes.
UPDATE "Semester"
SET "startDate" = date_trunc('day', "createdAt")
WHERE "startDate" IS NULL;

UPDATE "Semester"
SET "endDate" = date_trunc('day', "createdAt") + INTERVAL '6 months'
WHERE "endDate" IS NULL;
