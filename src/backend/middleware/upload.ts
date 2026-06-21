/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Middleware para upload de ficheiros (multer).
 * Autor: Mauro Simões
 * Data: 20/11/2025
 */

import multer from 'multer';
import path from 'path';

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];

function fileFilter(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de ficheiro inválido. Apenas PDF, JPG e PNG são permitidos.'));
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

export default upload;
