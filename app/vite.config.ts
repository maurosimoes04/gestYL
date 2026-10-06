import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * O build é emitido para src/frontend/app/ para que o Express sirva estaticamente
 * sem alterar o pipeline atual (que já serve src/frontend como estático).
 *
 * Em dev, o Vite corre em http://localhost:5174 e faz proxy do /api, /auth, etc.
 * para o backend Express em :3000.
 */
export default defineConfig({
  plugins: [react()],
  root: __dirname,
  base: '/app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/auth':         { target: 'http://localhost:3000', changeOrigin: true },
      '/faturas':      { target: 'http://localhost:3000', changeOrigin: true },
      '/receitas':     { target: 'http://localhost:3000', changeOrigin: true },
      '/eventos':      { target: 'http://localhost:3000', changeOrigin: true },
      '/movimentos':   { target: 'http://localhost:3000', changeOrigin: true },
      '/relatorios':   { target: 'http://localhost:3000', changeOrigin: true },
      '/inventario':   { target: 'http://localhost:3000', changeOrigin: true },
      '/departamentos':{ target: 'http://localhost:3000', changeOrigin: true },
      '/contas-snc':   { target: 'http://localhost:3000', changeOrigin: true },
      '/entidades':    { target: 'http://localhost:3000', changeOrigin: true },
      '/documentos':   { target: 'http://localhost:3000', changeOrigin: true },
      '/ia-snc':       { target: 'http://localhost:3000', changeOrigin: true },
      '/shares':       { target: 'http://localhost:3000', changeOrigin: true },
      '/share':        { target: 'http://localhost:3000', changeOrigin: true },
      '/item-info':    { target: 'http://localhost:3000', changeOrigin: true },
      '/api':          { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../src/frontend/app'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
