import { google, drive_v3 } from 'googleapis';
import { Readable } from 'stream';

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file'];

function getServiceAccountCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64 || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Credenciais da conta de serviço não definidas. Defina GOOGLE_SERVICE_ACCOUNT_JSON_B64 ou GOOGLE_SERVICE_ACCOUNT_JSON.');
  }

  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error('Falha ao interpretar as credenciais da conta de serviço.');
  }
}

function getDriveClient() {
  const creds = getServiceAccountCredentials();
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: (creds.private_key || '').replace(/\\n/g, '\n'),
    scopes: DRIVE_SCOPES
  });
  return google.drive({ version: 'v3', auth: jwt });
}

export async function uploadBufferToDrive(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  folderId: string;
}) {
  const drive = getDriveClient();
  const stream = Readable.from(params.buffer);

  const response = await drive.files.create({
    requestBody: {
      name: params.filename,
      parents: [params.folderId]
    },
    media: {
      mimeType: params.mimeType,
      body: stream
    },
    fields: 'id, name, webViewLink, webContentLink',
    supportsAllDrives: true
  });

  return response.data as drive_v3.Schema$File;
}

export async function deleteFromDrive(fileId?: string) {
  if (!fileId) return;
  const drive = getDriveClient();
  try {
    await drive.files.delete({ fileId, supportsAllDrives: true });
  } catch (err: any) {
    const reason = err?.errors?.[0]?.reason || err?.code;
    // Se já não existir (404/notFound), ignorar para não bloquear o fluxo
    if (reason === 'notFound' || err?.code === 404) return;
    throw err;
  }
}
