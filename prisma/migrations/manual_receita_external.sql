-- Adicionar campos de integração externa ao modelo Receita
ALTER TABLE "receitas" ADD COLUMN IF NOT EXISTS "origem" TEXT;
ALTER TABLE "receitas" ADD COLUMN IF NOT EXISTS "externalId" TEXT;

-- Índice único para idempotência
CREATE UNIQUE INDEX IF NOT EXISTS "receitas_externalId_key" ON "receitas"("externalId");
