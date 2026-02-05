/**
 * Projeto: Gestão de Faturas - Backend
 * Versão: 1.0
 * Descrição: Middleware para upload de ficheiros (multer).
 * Autor: Mauro Simões
 * Data: 20/11/2025
 */

import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), 'src', 'backend', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const name = uuidv4() + ext;
    cb(null, name);
  }
});

// Filtra ficheiros por tipo MIME permitido (PDF, JPEG, PNG) (PT-PT)
function fileFilter(req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de ficheiro inválido'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } 
});

export default upload;
