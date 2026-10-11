-- Liga diretamente um processo/subsídio à pessoa beneficiária.
-- Separado do entidadeFinanciadoraId (entidade que financia).

ALTER TABLE "eventos"
  ADD COLUMN IF NOT EXISTS "pessoaId" INTEGER;

ALTER TABLE "eventos"
  DROP CONSTRAINT IF EXISTS "Evento_pessoaId_fkey";
ALTER TABLE "eventos"
  ADD CONSTRAINT "Evento_pessoaId_fkey"
  FOREIGN KEY ("pessoaId") REFERENCES "entidades"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Evento_pessoaId_idx" ON "eventos"("pessoaId");
