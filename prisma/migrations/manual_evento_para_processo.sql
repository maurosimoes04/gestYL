-- Reestruturação: Evento → Processo (tabela "eventos" fica, ganha novos campos)

ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "tipo" TEXT NOT NULL DEFAULT 'Evento';
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "entidadeFinanciadoraId" INTEGER NULL;
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "numeroProcesso" TEXT NULL;
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "valorAprovado" DECIMAL(12,2) NULL;
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "contaSncReceitaId" INTEGER NULL;
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "contaSncDespesaId" INTEGER NULL;
ALTER TABLE "eventos" ADD COLUMN IF NOT EXISTS "estado" TEXT NOT NULL DEFAULT 'Em curso';

DO $$ BEGIN
  ALTER TABLE "eventos" ADD CONSTRAINT "eventos_entidadeFinanciadoraId_fkey"
    FOREIGN KEY ("entidadeFinanciadoraId") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "eventos" ADD CONSTRAINT "eventos_contaSncReceitaId_fkey"
    FOREIGN KEY ("contaSncReceitaId") REFERENCES "contas_snc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "eventos" ADD CONSTRAINT "eventos_contaSncDespesaId_fkey"
    FOREIGN KEY ("contaSncDespesaId") REFERENCES "contas_snc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "eventos_tipo_idx" ON "eventos"("tipo");
CREATE INDEX IF NOT EXISTS "eventos_entidadeFinanciadoraId_idx" ON "eventos"("entidadeFinanciadoraId");

-- Classificação automática dos processos existentes
UPDATE "eventos" SET "tipo" = 'Investimento'
  WHERE nome ILIKE '%obras%' OR nome ILIKE '%mobiliário sede%' OR nome ILIKE '%mobiliario sede%'
     OR nome ILIKE '%carrinha%' OR nome ILIKE '%berlingo%' OR nome ILIKE '%sede e equipamentos%';

UPDATE "eventos" SET "tipo" = 'Projeto Anual'
  WHERE "tipo" = 'Evento'
    AND (nome ILIKE '%workshops%' OR nome ILIKE '%férias ativas%' OR nome ILIKE '%ferias ativas%'
         OR nome ILIKE '%podcast%' OR nome ILIKE '%ligação jovem%' OR nome ILIKE '%ligacao jovem%');
