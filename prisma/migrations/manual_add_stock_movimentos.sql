-- Movimentos de stock (histórico de entradas/consumos/perdas por item)
CREATE TABLE IF NOT EXISTS "stock_movimentos" (
  "id" SERIAL PRIMARY KEY,
  "inventarioId" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "quantidade" DOUBLE PRECISION NOT NULL,
  "data" DATE NOT NULL,
  "processoId" INTEGER NULL,
  "faturaId" INTEGER NULL,
  "qtdAntes" DOUBLE PRECISION NULL,
  "qtdDepois" DOUBLE PRECISION NULL,
  "notas" TEXT NULL,
  "criadoPorEmail" TEXT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_movimentos_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "stock_movimentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "stock_movimentos_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Faturas"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "stock_movimentos_inventarioId_idx" ON "stock_movimentos"("inventarioId");
CREATE INDEX IF NOT EXISTS "stock_movimentos_data_idx" ON "stock_movimentos"("data");
CREATE INDEX IF NOT EXISTS "stock_movimentos_processoId_idx" ON "stock_movimentos"("processoId");
