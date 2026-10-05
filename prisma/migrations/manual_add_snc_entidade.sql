-- Reestruturação SNC — Fase 1 (fundação)
-- Adiciona ContaSNC + Entidade + colunas FK (nullable) em Faturas e receitas.

-- 1) Catálogo SNC
CREATE TABLE IF NOT EXISTS "contas_snc" (
  "id" SERIAL PRIMARY KEY,
  "codigo" TEXT NOT NULL UNIQUE,
  "nome" TEXT NOT NULL,
  "familia" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "pergunta" TEXT NULL,
  "naturezaInvestimento" BOOLEAN NOT NULL DEFAULT FALSE,
  "ativaPorOmissao" BOOLEAN NOT NULL DEFAULT TRUE,
  "notas" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "contas_snc_tipo_idx" ON "contas_snc"("tipo");
CREATE INDEX IF NOT EXISTS "contas_snc_familia_idx" ON "contas_snc"("familia");
CREATE INDEX IF NOT EXISTS "contas_snc_ativaPorOmissao_idx" ON "contas_snc"("ativaPorOmissao");

-- 2) Entidades (contrapartes únicas)
CREATE TABLE IF NOT EXISTS "entidades" (
  "id" SERIAL PRIMARY KEY,
  "nome" TEXT NOT NULL,
  "nif" TEXT NULL UNIQUE,
  "tipos" TEXT[] NOT NULL DEFAULT '{}',
  "email" TEXT NULL,
  "telefone" TEXT NULL,
  "morada" TEXT NULL,
  "iban" TEXT NULL,
  "ativo" BOOLEAN NOT NULL DEFAULT TRUE,
  "notas" TEXT NULL,
  "niss" TEXT NULL,
  "tipoVinculo" TEXT NULL,
  "funcao" TEXT NULL,
  "bolsaBase" DECIMAL(10,2) NULL,
  "dataNascimento" DATE NULL,
  "verificado" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "entidades_nome_idx" ON "entidades"("nome");
CREATE INDEX IF NOT EXISTS "entidades_ativo_idx" ON "entidades"("ativo");

-- 3) FKs em Faturas
ALTER TABLE "Faturas" ADD COLUMN IF NOT EXISTS "contaSncId" INTEGER NULL;
ALTER TABLE "Faturas" ADD COLUMN IF NOT EXISTS "entidadeId" INTEGER NULL;
DO $$ BEGIN
  ALTER TABLE "Faturas" ADD CONSTRAINT "Faturas_contaSncId_fkey"
    FOREIGN KEY ("contaSncId") REFERENCES "contas_snc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Faturas" ADD CONSTRAINT "Faturas_entidadeId_fkey"
    FOREIGN KEY ("entidadeId") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Faturas_contaSncId_idx" ON "Faturas"("contaSncId");
CREATE INDEX IF NOT EXISTS "Faturas_entidadeId_idx" ON "Faturas"("entidadeId");

-- 4) FKs em receitas
ALTER TABLE "receitas" ADD COLUMN IF NOT EXISTS "contaSncId" INTEGER NULL;
ALTER TABLE "receitas" ADD COLUMN IF NOT EXISTS "entidadeId" INTEGER NULL;
DO $$ BEGIN
  ALTER TABLE "receitas" ADD CONSTRAINT "receitas_contaSncId_fkey"
    FOREIGN KEY ("contaSncId") REFERENCES "contas_snc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "receitas" ADD CONSTRAINT "receitas_entidadeId_fkey"
    FOREIGN KEY ("entidadeId") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "receitas_contaSncId_idx" ON "receitas"("contaSncId");
CREATE INDEX IF NOT EXISTS "receitas_entidadeId_idx" ON "receitas"("entidadeId");
