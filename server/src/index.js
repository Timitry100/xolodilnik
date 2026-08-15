import { config } from './config.js';
import { initBot } from './bot.js';
import { apiApp } from './api.js';
import { initScheduler } from './scheduler.js';

console.log('🧊 Xolodilnik server');

initBot();

const server = apiApp.listen(config.port, () => {
  console.log(`[api] сервер слушает http://localhost:${config.port}`);
});

initScheduler();

// Плавное завершение (Ctrl+C / закрытие консоли / тесты)
function shutdown() {
  console.log('\n🧊 Останавливаюсь…');
  server.closeAllConnections?.(); // закрыть keep-alive соединения клиентов
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Защита: не даём серверу упасть из-за сетевых ошибок Telegram (polling)
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err?.message || err);
});

