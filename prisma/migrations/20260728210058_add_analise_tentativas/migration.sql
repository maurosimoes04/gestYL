-- AlterTable
ALTER TABLE "Faturas" ADD COLUMN     "analiseTentativas" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "receitas" ADD COLUMN     "analiseTentativas" INTEGER NOT NULL DEFAULT 0;
