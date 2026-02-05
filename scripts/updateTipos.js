/**
 * Projeto: Gestão de Faturas - Scripts
 * Versão: 1.0
 * Descrição: Script Node para atualizar tipos de faturas na base de dados.
 * Autor: Mauro Simões
 * Data: 23/11/2025
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'src', 'backend', 'database', 'faturas.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Erro abrir DB:', err);
    process.exit(1);
  }
});

// Atualiza tipos de faturas recorrentes e extraordinárias (PT-PT)
db.serialize(() => {
  db.run("UPDATE Faturas SET tipo='Despesas Recorrentes' WHERE tipo IN ('Recorrente','Despesa Recorrente','Despesa Recorrentes')", function(err) {
    if (err) console.error('Erro atualizar recorrente:', err);
    else console.log('Rows updated recorrente:', this.changes);
  });

  db.run("UPDATE Faturas SET tipo='Despesas Extraordinária' WHERE tipo IN ('Extraordinaria','Despesa Extraordinária','Despesa Extraordinarias')", function(err) {
    if (err) console.error('Erro atualizar extraordinaria:', err);
    else console.log('Rows updated extraordinaria:', this.changes);
  });
});

db.close((err) => {
  if (err) console.error('Erro fechar DB:', err);
});
