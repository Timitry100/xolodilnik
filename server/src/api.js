import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import {
  getOrCreateUser,
  listProducts,
  addProduct,
  getProduct,
  updateProduct,
  deleteProduct,
  consumeProduct,
  getStats,
} from './db.js';
import { generateRecipes } from './recipes.js';
import { resolveHonestSign } from './honestSign.js';

export const apiApp = express();
apiApp.use(express.json({ limit: '2mb' }));

/* ---------- проверка подписи initData из Telegram WebApp ---------- */

export function validateInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .sort()
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calcHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const a = Buffer.from(calcHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return null;
    return crypto.timingSafeEqual(a, b) ? params : null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  try {
    const params = validateInitData(req.get('x-init-data') || '', config.botToken);
    if (!params) return res.status(401).json({ error: 'Неверная подпись initData' });
    let userJson = {};
    try {
      userJson = JSON.parse(params.get('user') || '{}');
    } catch {
      userJson = {};
    }
    const user = getOrCreateUser({
      telegramId: String(userJson.id ?? ''),
      chatId: Number(userJson.id) || null,
      name: userJson.first_name || '',
    });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Ошибка авторизации' });
  }
}

/* ---------- API ---------- */

apiApp.get('/api/me', requireUser, (req, res) => res.json(req.user));

apiApp.get('/api/products', requireUser, (req, res) => res.json(listProducts(req.user.id)));

apiApp.post('/api/products', requireUser, (req, res) => {
  const body = req.body || {};
  if (!body.name || !String(body.name).trim()) {
    return res.status(400).json({ error: 'Название продукта обязательно' });
  }
  const product = addProduct(req.user.id, body);
  res.status(201).json(product);
});

apiApp.get('/api/products/:id', requireUser, (req, res) => {
  const product = getProduct(Number(req.params.id), req.user.id);
  if (!product) return res.status(404).json({ error: 'Продукт не найден' });
  res.json(product);
});

apiApp.put('/api/products/:id', requireUser, (req, res) => {
  const product = updateProduct(Number(req.params.id), req.user.id, req.body || {});
  if (!product) return res.status(404).json({ error: 'Продукт не найден' });
  res.json(product);
});

/** «Я съел»: количество −1, при нуле продукт удаляется. */
apiApp.post('/api/products/:id/consume', requireUser, (req, res) => {
  const result = consumeProduct(Number(req.params.id), req.user.id);
  if (!result) return res.status(404).json({ error: 'Продукт не найден' });
  res.json(result);
});

/** Генерация рецептов нейросетью / локальной базой. */
apiApp.post('/api/recipes/generate', requireUser, async (req, res) => {
  try {
    const products = listProducts(req.user.id);
    if (!products.length) {
      return res.status(400).json({ error: 'Холодильник пуст — сначала добавь продукты' });
    }
    const mode = req.body?.mode === 'suggest' ? 'suggest' : 'own';
    const level = ['fast', 'medium', 'gourmet'].includes(req.body?.level) ? req.body.level : 'fast';
    const result = await generateRecipes(products, mode, level);
    res.json(result);
  } catch (e) {
    console.error('[api] ошибка генерации рецептов:', e.message);
    res.status(500).json({ error: 'Не удалось сгенерировать рецепты' });
  }
});

/** Данные товара по GTIN «Честного знака» (ЦРПТ → фолбэк Open Food Facts). */
apiApp.get('/api/honest-sign/:gtin', requireUser, async (req, res) => {
  try {
    const gtin = String(req.params.gtin).replace(/\D/g, '');
    if (gtin.length < 8) return res.status(400).json({ error: 'Некорректный GTIN' });
    const info = await resolveHonestSign(gtin);
    res.json(info);
  } catch (e) {
    console.error('[api] ошибка honest-sign:', e.message);
    res.status(500).json({ error: 'Не удалось получить данные по коду' });
  }
});

apiApp.delete('/api/products/:id', requireUser, (req, res) => {
  const ok = deleteProduct(Number(req.params.id), req.user.id);
  if (!ok) return res.status(404).json({ error: 'Продукт не найден' });
  res.json({ ok: true });
});

apiApp.get('/api/stats', requireUser, (req, res) => res.json(getStats(req.user.id)));

/* ---------- раздача собранного фронтенда (продакшен) ---------- */

const dist = config.distPath;
if (fs.existsSync(dist)) {
  apiApp.use(express.static(dist));
  apiApp.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/* ---------- обработка ошибок ---------- */

apiApp.use((err, req, res, next) => {
  console.error('[api] ошибка:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});
