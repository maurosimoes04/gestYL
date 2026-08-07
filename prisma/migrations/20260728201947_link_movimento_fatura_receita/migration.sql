-- AlterTable
ALTER TABLE "movimentos" ADD COLUMN     "faturaId" INTEGER,
ADD COLUMN     "receitaId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_faturaId_key" ON "movimentos"("faturaId");

-- CreateIndex
CREATE UNIQUE INDEX "movimentos_receitaId_key" ON "movimentos"("receitaId");

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Faturas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos" ADD CONSTRAINT "movimentos_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "receitas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
