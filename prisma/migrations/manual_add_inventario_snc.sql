-- Inventário capitalizado (ativos fixos tangíveis — classe 43x SNC)

ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "contaSncId" INTEGER NULL;
ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "anosDepreciacao" INTEGER NULL;
ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "despesaOrigemId" INTEGER NULL;
ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "valorResidual" DECIMAL(10,2) NULL;
ALTER TABLE "inventarios" ADD COLUMN IF NOT EXISTS "dataAbateReal" DATE NULL;

DO $$ BEGIN
  ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_contaSncId_fkey"
    FOREIGN KEY ("contaSncId") REFERENCES "contas_snc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_despesaOrigemId_fkey"
    FOREIGN KEY ("despesaOrigemId") REFERENCES "Faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "inventarios_contaSncId_idx" ON "inventarios"("contaSncId");
