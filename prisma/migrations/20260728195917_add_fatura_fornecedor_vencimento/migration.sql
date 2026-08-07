-- AlterTable
ALTER TABLE "Faturas" ADD COLUMN     "dataVencimento" DATE,
ADD COLUMN     "fornecedor" TEXT,
ADD COLUMN     "fornecedorNif" TEXT;

-- CreateIndex
CREATE INDEX "Faturas_dataVencimento_idx" ON "Faturas"("dataVencimento");
