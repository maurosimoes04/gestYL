-- RH / Dossiê: tabela de Documentos ligados a Processo e/ou Entidade (pessoa)

CREATE TABLE IF NOT EXISTS "documentos" (
  "id" SERIAL PRIMARY KEY,
  "tipo" TEXT NOT NULL,
  "descricao" TEXT NULL,
  "processoId" INTEGER NULL,
  "entidadeId" INTEGER NULL,
  "estado" TEXT NOT NULL DEFAULT 'Pendente',
  "dataLimite" DATE NULL,
  "dataConclusao" DATE NULL,
  "anexo" JSONB NULL,
  "notas" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "documentos_entidadeId_fkey" FOREIGN KEY ("entidadeId") REFERENCES "entidades"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "documentos_processoId_idx" ON "documentos"("processoId");
CREATE INDEX IF NOT EXISTS "documentos_entidadeId_idx" ON "documentos"("entidadeId");
CREATE INDEX IF NOT EXISTS "documentos_estado_idx" ON "documentos"("estado");
CREATE INDEX IF NOT EXISTS "documentos_dataLimite_idx" ON "documentos"("dataLimite");
