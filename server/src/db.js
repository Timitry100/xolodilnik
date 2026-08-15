import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Инициализация файла базы данных
fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  chat_id INTEGER,
  name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT DEFAULT 'Другое',
  kcal REAL,
  protein REAL,
  fat REAL,
  carbs REAL,
  composition TEXT,
  expiry_date TEXT,
  barcode TEXT,
  gtin TEXT,
  serial TEXT,
  source TEXT DEFAULT 'manual',
  image_url TEXT,
  note TEXT,
  quantity INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  sent_at TEXT DEFAULT (datetime('now'))
);
`);

const productCols =
  'id, user_id, name, brand, category, kcal, protein, fat, carbs, composition, expiry_date, barcode, gtin, serial, source, image_url, note, quantity, created_at, updated_at';

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/* ---------------- users ---------------- */

export function getOrCreateUser({ telegramId, chatId, name }) {
  let row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  if (!row) {
    db.prepare('INSERT INTO users (telegram_id, chat_id, name) VALUES (?, ?, ?)').run(telegramId, chatId || null, name || '');
    row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  } else if (chatId) {
    db.prepare('UPDATE users SET chat_id = ? WHERE id = ?').run(chatId, row.id);
  }
  return row;
}

export function allUsers() {
  return db.prepare('SELECT * FROM users').all();
}

/* ---------------- products ---------------- */

export function listProducts(userId) {
  return db.prepare(`SELECT ${productCols} FROM products WHERE user_id = ? ORDER BY created_at DESC`).all(userId);
}

export function getProduct(id, userId) {
  return db.prepare(`SELECT ${productCols} FROM products WHERE id = ? AND user_id = ?`).get(id, userId);
}

export function addProduct(userId, p = {}) {
  const r = db
    .prepare(
      `INSERT INTO products (user_id, name, brand, category, kcal, protein, fat, carbs, composition, expiry_date, barcode, gtin, serial, source, image_url, note, quantity)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      userId,
      p.name,
      p.brand || null,
      p.category || 'Другое',
      numOrNull(p.kcal),
      numOrNull(p.protein),
      numOrNull(p.fat),
      numOrNull(p.carbs),
      p.composition || null,
      p.expiry_date || null,
      p.barcode || null,
      p.gtin || null,
      p.serial || null,
      p.source || 'manual',
      p.image_url || null,
      p.note || null,
      p.quantity || 1
    );
  return getProduct(r.lastInsertRowid, userId);
}

export function updateProduct(id, userId, p = {}) {
  const existing = getProduct(id, userId);
  if (!existing) return null;
  const merged = { ...existing, ...p };
  // Если изменился срок — сбрасываем старые уведомления, чтобы предупредить заново
  if (merged.expiry_date !== existing.expiry_date) {
    db.prepare('DELETE FROM notifications WHERE product_id = ?').run(id);
  }
  db.prepare(
    `UPDATE products SET name=?, brand=?, category=?, kcal=?, protein=?, fat=?, carbs=?, composition=?, expiry_date=?, barcode=?, gtin=?, serial=?, source=?, image_url=?, note=?, quantity=?, updated_at=datetime('now')
     WHERE id=? AND user_id=?`
  ).run(
    merged.name,
    merged.brand || null,
    merged.category || 'Другое',
    numOrNull(merged.kcal),
    numOrNull(merged.protein),
    numOrNull(merged.fat),
    numOrNull(merged.carbs),
    merged.composition || null,
    merged.expiry_date || null,
    merged.barcode || null,
    merged.gtin || null,
    merged.serial || null,
    merged.source || 'manual',
    merged.image_url || null,
    merged.note || null,
    merged.quantity || 1,
    id,
    userId
  );
  return getProduct(id, userId);
}

/** «Я съел»: уменьшает количество; при нуле — удаляет продукт. */
export function consumeProduct(id, userId) {
  const p = getProduct(id, userId);
  if (!p) return null;
  const qty = (p.quantity || 1) - 1;
  if (qty <= 0) {
    deleteProduct(id, userId);
    return { consumed: true, deleted: true, product: null };
  }
  const updated = updateProduct(id, userId, { quantity: qty });
  return { consumed: true, deleted: false, product: updated };
}

export function deleteProduct(id, userId) {
  db.prepare('DELETE FROM notifications WHERE product_id = ?').run(id);
  return db.prepare('DELETE FROM products WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
}

/* ---------------- notifications ---------------- */

export function hasNotification(productId, level) {
  return !!db.prepare('SELECT id FROM notifications WHERE product_id = ? AND level = ?').get(productId, level);
}

export function markNotified(productId, level) {
  db.prepare('INSERT INTO notifications (product_id, level) VALUES (?, ?)').run(productId, level);
}

/* ---------------- stats ---------------- */

export function getStats(userId) {
  const total = db.prepare('SELECT COUNT(*) c FROM products WHERE user_id = ?').get(userId).c;
  const expired = db.prepare("SELECT COUNT(*) c FROM products WHERE user_id = ? AND expiry_date IS NOT NULL AND date(expiry_date) < date('now')").get(userId).c;
  const expiring7 = db.prepare("SELECT COUNT(*) c FROM products WHERE user_id = ? AND expiry_date IS NOT NULL AND date(expiry_date) BETWEEN date('now') AND date('now', '+7 days')").get(userId).c;
  const noDate = db.prepare('SELECT COUNT(*) c FROM products WHERE user_id = ? AND expiry_date IS NULL').get(userId).c;
  return { total, expired, expiring7, noDate };
}
