-- Segundo slot de anexo na tabela Faturas: comprovativo de pagamento
-- (transferência, Multibanco, recibo da entidade). Guarda o mesmo shape JSON
-- que `anexo`: { driveFileId, originalName, mimeType, size, driveWebViewLink,
-- driveWebContentLink }.

ALTER TABLE "Faturas"
  ADD COLUMN IF NOT EXISTS "comprovativo" JSONB;

COMMENT ON COLUMN "Faturas"."comprovativo" IS
  'Comprovativo de pagamento (opcional, separado do documento da despesa em anexo).';
