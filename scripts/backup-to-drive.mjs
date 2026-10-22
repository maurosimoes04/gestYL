#!/usr/bin/env node
/**
 * Backup automático da DB Gestor YL para Google Drive.
 *
 * Executa:
 *   1. pg_dump da DB inteira (schema + dados)
 *   2. Compressão gzip
 *   3. Upload para pasta no Google Drive
 *   4. Limpeza: apaga backups anteriores a N dias
 *
 * Variáveis de ambiente (lidas do .env do projeto):
 *   BACKUP_DATABASE_URL              — URL direto (porta 5432, sem pgbouncer)
 *   GOOGLE_SERVICE_ACCOUNT_JSON_B64  — Service account em base64
 *   GDRIVE_BACKUP_FOLDER_ID          — Pasta destino no Drive
 *
 * Opcionais:
 *   BACKUP_RETENTION_DAYS            — Default 7
 */
import { spawnSync } from 'child_process';
import { createReadStream, statSync, unlinkSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Carregar .env do projeto
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=["']?(.+?)["']?\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const DATABASE_URL = process.env.BACKUP_DATABASE_URL;
const SA_B64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64;
const DRIVE_FOLDER_ID = process.env.GDRIVE_BACKUP_FOLDER_ID;
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 7);
const NAME_PREFIX = 'gestor-yl-backup';
const PG_DUMP = process.env.PG_DUMP_BIN || '/opt/homebrew/opt/libpq/bin/pg_dump';

if (!DATABASE_URL || !SA_B64 || !DRIVE_FOLDER_ID) {
  console.error('❌ Faltam env vars: BACKUP_DATABASE_URL, GOOGLE_SERVICE_ACCOUNT_JSON_B64, GDRIVE_BACKUP_FOLDER_ID');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const filename = `${NAME_PREFIX}-${timestamp}.sql.gz`;
const filepath = join(tmpdir(), filename);

// 1) pg_dump + gzip
console.log(`📦 A gerar backup para ${filepath}...`);
const pgDump = spawnSync('bash', [
  '-c',
  `set -o pipefail; "${PG_DUMP}" --clean --if-exists --no-owner --no-privileges "${DATABASE_URL}" | gzip -9 > "${filepath}"`,
], { stdio: 'inherit', timeout: 300000 });

if (pgDump.status !== 0) {
  console.error(`❌ pg_dump falhou (exit code ${pgDump.status})`);
  process.exit(1);
}

const sizeMB = (statSync(filepath).size / 1024 / 1024).toFixed(2);
console.log(`✅ Backup gerado: ${sizeMB} MB`);

// 2) Upload para Google Drive
console.log('☁️  A preparar credenciais Google...');
let credentials;
try {
  credentials = JSON.parse(Buffer.from(SA_B64, 'base64').toString('utf8'));
} catch (err) {
  console.error('❌ GOOGLE_SERVICE_ACCOUNT_JSON_B64 inválido:', err.message);
  process.exit(1);
}

if (credentials.private_key) {
  let pk = credentials.private_key;
  if (pk.includes('\\n') && !pk.includes('\n')) pk = pk.replace(/\\n/g, '\n');
  pk = pk.replace(/\r\n/g, '\n');
  credentials.private_key = pk;
}

const keyPath = join(tmpdir(), 'gestor-sa-key.json');
writeFileSync(keyPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });

const { google } = await import('googleapis');

console.log('☁️  A enviar para Google Drive...');
const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

const uploadRes = await drive.files.create({
  requestBody: {
    name: filename,
    parents: [DRIVE_FOLDER_ID],
    description: `Backup automático Gestor YL - ${new Date().toISOString()}`,
  },
  media: {
    mimeType: 'application/gzip',
    body: createReadStream(filepath),
  },
  fields: 'id, name, size',
  supportsAllDrives: true,
});
console.log(`✅ Enviado: ${uploadRes.data.name} (ID: ${uploadRes.data.id})`);

// 3) Limpar backups antigos
const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
console.log(`🧹 A limpar backups anteriores a ${cutoff.toISOString()}...`);
const list = await drive.files.list({
  q: `'${DRIVE_FOLDER_ID}' in parents and name contains '${NAME_PREFIX}-' and trashed = false`,
  fields: 'files(id, name, createdTime)',
  pageSize: 100,
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
});
let deleted = 0;
for (const file of list.data.files || []) {
  if (new Date(file.createdTime) < cutoff) {
    await drive.files.delete({ fileId: file.id, supportsAllDrives: true });
    console.log(`  🗑️  ${file.name} (${file.createdTime})`);
    deleted++;
  }
}
console.log(`✅ ${deleted} backup(s) antigos apagados.`);

// Cleanup local
try { unlinkSync(filepath); } catch {}
try { unlinkSync(keyPath); } catch {}
console.log('\n🎉 Backup completo!');
process.exit(0);
