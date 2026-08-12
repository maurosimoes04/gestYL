-- AlterTable
ALTER TABLE "inventarios" ADD COLUMN     "codigoPatrimonio" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_codigoPatrimonio_key" ON "inventarios"("codigoPatrimonio");
