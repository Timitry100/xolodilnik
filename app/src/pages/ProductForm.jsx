import { useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import { CATEGORIES, guessCategory } from '../utils.js';
import { haptic } from '../telegram.js';

const SOURCE_LABELS = {
  honest_sign: '📷 Честный знак',
  barcode: '📷 Штрихкод',
  ocr: '🧠 Текст упаковки',
  manual: '✏️ Вручную',
};

const QUICK_DATES = [
  { label: '+7 дней', days: 7 },
  { label: '+1 мес', days: 30 },
  { label: '+3 мес', days: 90 },
  { label: '+6 мес', days: 180 },
  { label: '+1 год', days: 365 },
];

export default function ProductForm() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const initial = state || {};
  const editing = !!initial.id;

  const [form, setForm] = useState({
    name: initial.name || '',
    brand: initial.brand || '',
    category: initial.category || guessCategory(initial.name) || 'Другое',
    expiry_date: initial.expiry_date || '',
    volume: initial.volume || '',
    kcal: initial.kcal ?? '',
    protein: initial.protein ?? '',
    fat: initial.fat ?? '',
    carbs: initial.carbs ?? '',
    composition: initial.composition || '',
    quantity: initial.quantity || 1,
    note: initial.note || '',
    barcode: initial.barcode || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));

  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    setForm((f) => ({ ...f, expiry_date: d.toISOString().slice(0, 10) }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      setError('Укажи название продукта');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category || 'Другое',
      expiry_date: form.expiry_date || null,
      volume: form.volume.trim() || null,
      kcal: num(form.kcal),
      protein: num(form.protein),
      fat: num(form.fat),
      carbs: num(form.carbs),
      composition: form.composition || null,
      quantity: Number(form.quantity) || 1,
      note: form.note || null,
      source: initial.source || 'manual',
      barcode: form.barcode || initial.barcode || null,
      gtin: initial.gtin || null,
      serial: initial.serial || null,
      image_url: form.image_url || initial.image_url || null,
    };
    try {
      if (editing) await api(`/products/${initial.id}`, { method: 'PUT', body: payload });
      else await api('/products', { method: 'POST', body: payload });
      haptic('success');
      navigate('/');
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  // Поиск товара по названию в открытых базах
  const handleSearch = async () => {
    if (!form.name.trim() || searching) return;
    setSearching(true);
    setError('');
    setSearchResults([]);
    try {
      const results = await api(`/search?q=${encodeURIComponent(form.name.trim())}`);
      setSearchResults(results || []);
    } catch (e) {
      setError('Не удалось выполнить поиск: ' + e.message);
    }
    setSearching(false);
  };

  const handlePick = (p) => {
    setForm((f) => ({
      ...f,
      name: p.name || f.name,
      brand: p.brand || f.brand,
      category: p.category || f.category,
      volume: p.volume || f.volume,
      kcal: p.kcal ?? f.kcal,
      protein: p.protein ?? f.protein,
      fat: p.fat ?? f.fat,
      carbs: p.carbs ?? f.carbs,
      composition: p.composition || f.composition,
      barcode: p.code || f.barcode,
      image_url: p.image_url || f.image_url,
    }));
    setSearchResults([]);
  };

  const sourceLabel = initial.source ? SOURCE_LABELS[initial.source] || '✏️ Вручную' : '✏️ Вручную';

  return (
    <>
      <div className="topbar">
        <Link className="back-btn" to={editing ? `/product/${initial.id}` : '/scan'}>←</Link>
        <h1>{editing ? 'Изменить продукт' : 'Новый продукт'}</h1>
      </div>

      <div className="detail-card">
        <div className="detail-meta" style={{ marginBottom: 16 }}>
          Добавлено: <b>{sourceLabel}</b>
          {initial.barcode ? ` · Штрихкод ${initial.barcode}` : ''}
          {initial.gtin ? ` · GTIN ${initial.gtin}` : ''}
        </div>

        <div className="field">
          <label>Название *</label>
          <input value={form.name} onChange={set('name')} placeholder="Например: Молоко 3,2%" />
          <button
            className="chip"
            style={{ marginTop: 8 }}
            onClick={handleSearch}
            disabled={searching || !form.name.trim()}
          >
            {searching ? '🔍 Ищу…' : '🔍 Найти в базах по названию'}
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="search-results">
            {searchResults.map((p, i) => (
              <button key={i} className="search-item" onClick={() => handlePick(p)}>
                {p.image_url ? <img src={p.image_url} alt="" /> : <span className="search-ph" />}
                <span className="search-body">
                  <b>{p.name}</b>
                  {p.brand ? <small>{p.brand}</small> : null}
                  <span className="p-kbju">
                    {p.kcal != null ? <span className="kbju-chip">{p.kcal} ккал</span> : null}
                    {p.protein != null ? <span className="kbju-chip">Б {p.protein}</span> : null}
                    {p.fat != null ? <span className="kbju-chip">Ж {p.fat}</span> : null}
                    {p.carbs != null ? <span className="kbju-chip">У {p.carbs}</span> : null}
                    {p.volume ? <span className="kbju-chip">{p.volume}</span> : null}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="field">
          <label>Бренд</label>
          <input value={form.brand} onChange={set('brand')} placeholder="Производитель / торговая марка" />
        </div>

        <div className="field">
          <label>Объём / масса нетто</label>
          <input value={form.volume} onChange={set('volume')} placeholder="Например: 900 г, 1 л, 450 мл" />
        </div>

        <div className="field">
          <label>Категория</label>
          <select value={form.category} onChange={set('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>📅 Срок годности {form.expiry_date ? `— ${form.expiry_date}` : ''}</label>
          <input type="date" value={form.expiry_date} onChange={set('expiry_date')} />
          <div className="row-scroll" style={{ marginTop: 8, marginBottom: 0 }}>
            {QUICK_DATES.map((q) => (
              <button key={q.label} className="chip" onClick={() => addDays(q.days)}>{q.label}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Количество</label>
          <input type="number" min="1" value={form.quantity} onChange={set('quantity')} />
        </div>

        <div className="field">
          <label>КБЖУ (на 100 г)</label>
          <div className="kbju-grid">
            <input type="number" step="any" inputMode="decimal" placeholder="ккал" value={form.kcal} onChange={set('kcal')} />
            <input type="number" step="any" inputMode="decimal" placeholder="Белки, г" value={form.protein} onChange={set('protein')} />
            <input type="number" step="any" inputMode="decimal" placeholder="Жиры, г" value={form.fat} onChange={set('fat')} />
            <input type="number" step="any" inputMode="decimal" placeholder="Углеводы, г" value={form.carbs} onChange={set('carbs')} />
          </div>
        </div>

        <div className="field">
          <label>Состав</label>
          <textarea value={form.composition} onChange={set('composition')} placeholder="Ингредиенты…" />
        </div>

        <div className="field">
          <label>Заметка</label>
          <input value={form.note} onChange={set('note')} placeholder="Например: купил в Пятёрочке" />
        </div>

        {error && <div className="error-text">{error}</div>}

        <button className="btn block" onClick={save} disabled={saving}>
          {saving ? 'Сохраняем…' : editing ? '💾 Сохранить изменения' : '✅ Добавить в холодильник'}
        </button>
      </div>
    </>
  );
}
