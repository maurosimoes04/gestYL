-- Manual migration: add evento_shares table for external event sharing
CREATE TABLE IF NOT EXISTS "evento_shares" (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "eventoId" INTEGER NOT NULL,
  "createdById" UUID NULL,
  "createdByEmail" TEXT NULL,
  "destinatario" TEXT NULL,
  "justificacao" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordSalt" TEXT NOT NULL,
  "accessTokenHash" TEXT NULL,
  "accessTokenExpiresAt" TIMESTAMP(3) NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3) NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evento_shares_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "evento_shares_eventoId_idx" ON "evento_shares"("eventoId");
CREATE INDEX IF NOT EXISTS "evento_shares_expiresAt_idx" ON "evento_shares"("expiresAt");
