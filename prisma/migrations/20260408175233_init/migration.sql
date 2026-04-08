-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'direcao', 'fiscal');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "role" "Role" NOT NULL DEFAULT 'fiscal',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "data_inicio" TIMESTAMP(3),
    "data_fim" TIMESTAMP(3),
    "departamento" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faturas" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" DATE NOT NULL,
    "departamento" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'Fatura',
    "numero" TEXT,
    "anexo" JSONB,
    "detalhes" JSONB,
    "estado" TEXT NOT NULL,
    "descricao" TEXT,
    "eventoId" INTEGER,
    "inventarioId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" TEXT,
    "quantidade" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidade" TEXT,
    "localizacao" TEXT,
    "estado" TEXT,
    "custoUnitario" DOUBLE PRECISION,
    "dataAquisicao" DATE,
    "dataValidade" DATE,
    "quantidadeMinima" DOUBLE PRECISION,
    "notas" TEXT,
    "faturaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "conta" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" DATE NOT NULL,
    "referencia" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receitas" (
    "id" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "data" DATE NOT NULL,
    "categoria" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'Previsto',
    "financiador" TEXT,
    "anexo" JSONB,
    "observacoes" TEXT,
    "eventoId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receitas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- AddForeignKey
ALTER TABLE "Faturas" ADD CONSTRAINT "Faturas_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faturas" ADD CONSTRAINT "Faturas_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "inventarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receitas" ADD CONSTRAINT "receitas_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
