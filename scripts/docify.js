/**
 * Projeto: Gestão de Faturas - Scripts
 * Versão: 1.0
 * Descrição: Script Node para gerar documentação automática em ficheiros do projeto.
 * Autor: Mauro Simões
 * Data: 23/11/2025
 */

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Percorre diretórios recursivamente e devolve ficheiros .ts/.js (PT-PT)
function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const res = path.resolve(dir, e.name);
    if (e.isDirectory()) files.push(...walk(res));
    else if (/\.(ts|js|tsx|jsx)$/.test(e.name)) files.push(res);
  }
  return files;
}

// Remove todos os comentários do código (PT-PT)
function removeAllComments(code) {
  // Remove block comments
  let out = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  out = out.replace(/(^|[^:"'`])\/\/.*/gm, '$1');
  return out;
}

// Gera docstring para função (PT-PT)
function generateTSDocForFunction(name, params, isAsync) {
  const lines = [];
  lines.push('/**');
  lines.push(` * [GERADO AUTOMATICAMENTE] Função ${name} ${isAsync ? '(assíncrona)' : ''} - descrição curta.`);
  if (params.length) {
    for (const p of params) {
      lines.push(` * @param ${p} - Descrição do parâmetro ${p}.`);
    }
  }
  lines.push(' * @returns {any} Descrição do valor retornado.');
  lines.push(' */');
  return lines.join('\n');
}

// Gera docstring para classe (PT-PT)
function generateTSDocForClass(name) {
  return ['/**', ` * [GERADO AUTOMATICAMENTE] Classe ${name} - descrição curta.`, ' */'].join('\n');
}

function insertDocs(content) {
  let out = content;

  // Exported functions: export function NAME( ... )
  out = out.replace(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)\s*{/g, (m, name, params) => {
    const pList = params.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/=[\s\S]*/,'').trim());
    return generateTSDocForFunction(name, pList, true) + '\n' + m;
  });

  out = out.replace(/export\s+function\s+(\w+)\s*\(([^)]*)\)\s*{/g, (m, name, params) => {
    const pList = params.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/=[\s\S]*/,'').trim());
    return generateTSDocForFunction(name, pList, false) + '\n' + m;
  });

  // export const name = async (...) =>
  out = out.replace(/export\s+const\s+(\w+)\s*=\s*async\s*\(([^)]*)\)\s*=>/g, (m,name,params)=>{
    const pList = params.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/=[\s\S]*/,'').trim());
    return generateTSDocForFunction(name, pList, true) + '\n' + m;
  });

  // export const name = (...) =>
  out = out.replace(/export\s+const\s+(\w+)\s*=\s*\(([^)]*)\)\s*=>/g, (m,name,params)=>{
    const pList = params.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/=[\s\S]*/,'').trim());
    return generateTSDocForFunction(name, pList, false) + '\n' + m;
  });

  // export default function NAME
  out = out.replace(/export\s+default\s+function\s+(\w+)\s*\(([^)]*)\)\s*{/g, (m,name,params)=>{
    const pList = params.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/=[\s\S]*/,'').trim());
    return generateTSDocForFunction(name, pList, false) + '\n' + m;
  });

  // export class Name
  out = out.replace(/export\s+class\s+(\w+)\s*/g, (m,name)=>{
    return generateTSDocForClass(name) + '\n' + m;
  });

  // class methods (simple heuristic): add docs for methodName(param, ...) {
  out = out.replace(/(^\s*)(async\s+)?(\w+)\s*\(([^)]*)\)\s*{/gm, (m,indent, a, name, params)=>{
    // skip constructor
    if (name === 'constructor') return m;
    // only add if inside a class (heuristic)
    const before = out.slice(0, out.indexOf(m));
    const classIndex = before.lastIndexOf('class ');
    if (classIndex === -1) return m;
    const pList = params.split(',').map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/=[\s\S]*/,'').trim());
    const docParts = ['/**', ` * [GERADO AUTOMATICAMENTE] Método ${name}.`, ...pList.map(p=>` * @param ${p} - Descrição do parâmetro ${p}.`), ' * @returns {any} Descrição do valor retornado.', ' */'];
    const doc = docParts.join('\n' + indent);
    return indent + doc + '\n' + m;
  });

  return out;
}

async function main() {
  const src = path.join(process.cwd(), 'src');
  const files = walk(src);
  if (!files.length) {
    console.log('Nenhum ficheiro .ts/.js encontrado em src/');
    return;
  }

  const backupRoot = path.join(process.cwd(), 'src', '_backups', 'comments_backup_' + Date.now());
  fs.mkdirSync(backupRoot, { recursive: true });

  let processed = 0;
  for (const f of files) {
    const rel = path.relative(process.cwd(), f);
    const content = fs.readFileSync(f, 'utf8');
    // backup original
    const backupPath = path.join(backupRoot, rel.replace(/[:\\/]/g,'_'));
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.writeFileSync(backupPath, content, 'utf8');

    let cleaned = removeAllComments(content);
    cleaned = insertDocs(cleaned);

    fs.writeFileSync(f, cleaned, 'utf8');
    processed++;
    console.log(`Processed: ${rel}`);
  }

  console.log(`Done. Processed ${processed} files. Backups at ${backupRoot}`);
}

main().catch(err=>{ console.error(err); process.exit(1); });
