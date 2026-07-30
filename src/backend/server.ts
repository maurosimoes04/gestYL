console.log('Boot: iniciar servidor');

if (!process.env.BOOT_DEBUG) process.env.BOOT_DEBUG = 'true';

process.on('unhandledRejection', (err) => {
  console.error('Boot: unhandledRejection', err);
});

process.on('uncaughtException', (err) => {
  console.error('Boot: uncaughtException', err);
});

(async () => {
  console.log('Boot: antes de importar app');
  const { default: app } = await import('./app');
  console.log('Boot: app importado');

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Servidor a correr na porta ${PORT}`);
    import('./services/analiseScheduler').then(({ startAnaliseScheduler }) => startAnaliseScheduler());
  });
})().catch((err) => {
  console.error('Boot: falha ao iniciar', err);
  process.exit(1);
});
