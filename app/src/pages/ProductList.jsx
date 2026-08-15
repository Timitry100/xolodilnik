import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import ProductCard from '../components/ProductCard.jsx';
import { daysUntil } from '../utils.js';

const FILTERS = [
  { key: 'all', label: 'Все' },
  { key: 'expiring', label: '⏳ Скоро' },
  { key: 'expired', label: '💀 Просрочены' },
  { key: 'noDate', label: 'Без срока' },
];

const SORTS = [
  { key: 'date', label: 'Срок ↑' },
  { key: 'dateDesc', label: 'Срок ↓' },
  { key: 'name', label: 'Имя' },
  { key: 'kcal', label: 'КБЖУ' },
];

export default function ProductList() {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('date');
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api('/products')
      .then(setProducts)
      .catch((e) => setError(e.message));
  }, []);

  const stats = useMemo(() => {
    if (!products) return null;
    const expired = products.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d !== null && d < 0;
    }).length;
    const expiring = products.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d !== null && d >= 0 && d <= 7;
    }).length;
    return { total: products.length, expired, expiring };
  }, [products]);

  const list = useMemo(() => {
    if (!products) return [];
    let arr = [...products];
    const q = query.trim().toLowerCase();
    if (q) arr = arr.filter((p) => (p.name + ' ' + (p.brand || '')).toLowerCase().includes(q));
    if (filter === 'expiring') arr = arr.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d !== null && d >= 0 && d <= 7;
    });
    if (filter === 'expired') arr = arr.filter((p) => {
      const d = daysUntil(p.expiry_date);
      return d !== null && d < 0;
    });
    if (filter === 'noDate') arr = arr.filter((p) => !p.expiry_date);
    if (sort === 'date') arr.sort((a, b) => (a.expiry_date || '9999-12-31').localeCompare(b.expiry_date || '9999-12-31'));
    if (sort === 'dateDesc') arr.sort((a, b) => (b.expiry_date || '9999-12-31').localeCompare(a.expiry_date || '9999-12-31'));
    if (sort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    if (sort === 'kcal') arr.sort((a, b) => (b.kcal ?? -1) - (a.kcal ?? -1));
    return arr;
  }, [products, filter, sort, query]);

  return (
    <>
      <div className="topbar">
        <h1>🧊 Холодильник</h1>
        <Link className="chip" to="/form" state={{ focusSearch: true }} style={{ margin: 0 }}>🔍 Поиск</Link>
        <Link className="chip" to="/recipes" style={{ margin: 0 }}>🍳 Рецепты</Link>
      </div>

      {stats && (
        <div className="stats-row">
          <div className="stat-chip">Всего <b>{stats.total}</b></div>
          <div className="stat-chip">⏳ Скоро <b>{stats.expiring}</b></div>
          <div className="stat-chip">💀 Просрочено <b>{stats.expired}</b></div>
        </div>
      )}

      <input
        className="search"
        placeholder="Поиск: молоко, кефир…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="row-scroll">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="row-scroll">
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`chip ${sort === s.key ? 'active' : ''}`}
            onClick={() => setSort(s.key)}
          >
            ↕ {s.label}
          </button>
        ))}
        <Link className="chip" to="/form">✏️ Вручную</Link>
      </div>

      {error && <div className="error-text">{error}</div>}

      {!products && !error && <div className="loading">Загрузка…</div>}

      {products && products.length === 0 && (
        <div className="empty">
          <div className="emoji">🧊</div>
          <p>Пока пусто. Отсканируй первый продукт!</p>
          <button className="btn" onClick={() => navigate('/scan')}>📷 Сканировать</button>
        </div>
      )}

      {products && products.length > 0 && (
        <>
          <div className="product-list">
            {list.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
          {list.length === 0 && <div className="empty"><p>Ничего не найдено 😕</p></div>}
        </>
      )}

      <button className="fab" onClick={() => navigate('/scan')} aria-label="Сканировать">📷</button>
    </>
  );
}
