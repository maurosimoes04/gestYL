/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Middleware para upload de ficheiros (multer).
 * Autor: Mauro Simões
 * Data: 20/11/2025
 */

import multer from 'multer';

// Filtra ficheiros por tipo MIME permitido (PDF, JPEG, PNG) (PT-PT)
function fileFilter(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de ficheiro inválido'));
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export default upload;
