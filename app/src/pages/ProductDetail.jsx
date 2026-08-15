import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { daysUntil, fmtDate, fmtKbju } from '../utils.js';
import { haptic, showConfirm } from '../telegram.js';

const SOURCE_LABELS = { honest_sign: 'Честный знак', barcode: 'Штрихкод', ocr: 'Текст упаковки', manual: 'Вручную' };

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [p, setP] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/products/${id}`)
      .then(setP)
      .catch((e) => setError(e.message));
  }, [id]);

  const remove = async () => {
    const ok = await showConfirm('Удалить продукт из холодильника?');
    if (!ok) return;
    try {
      await api(`/products/${id}`, { method: 'DELETE' });
      haptic('success');
      navigate('/');
    } catch (e) {
      setError(e.message);
    }
  };

  const consume = async () => {
    try {
      const result = await api(`/products/${id}/consume`, { method: 'POST' });
      haptic('light');
      if (result.deleted) {
        navigate('/');
      } else {
        setP(result.product);
      }
    } catch (e) {
      setError(e.message);
    }
  };

  if (error) return <div className="error-text">{error}</div>;
  if (!p) return <div className="loading">Загрузка…</div>;

  const days = daysUntil(p.expiry_date);

  return (
    <>
      <div className="topbar">
        <Link className="back-btn" to="/">←</Link>
        <h1>Продукт</h1>
      </div>

      <div className="detail-card">
        {p.image_url && (
          <img src={p.image_url} alt="" style={{ width: 96, borderRadius: 12, marginBottom: 10, objectFit: 'cover' }} />
        )}
        <h2>{p.name}</h2>
        {p.brand && <div className="detail-meta">🏷 {p.brand}</div>}
        <div className="detail-meta">
          🗂 {p.category} · 📥 {SOURCE_LABELS[p.source] || 'Вручную'} · Количество: {p.quantity}
        </div>

        <StatusBadge days={days} />

        <div className="detail-section">
          <h4>Срок годности</h4>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {p.expiry_date ? fmtDate(p.expiry_date) : 'Не указан'}
          </div>
        </div>

        {fmtKbju(p).length > 0 && (
          <div className="detail-section">
            <h4>КБЖУ (на 100 г)</h4>
            <div className="p-kbju">
              {fmtKbju(p).map((s) => (
                <span key={s} className="kbju-chip">{s}</span>
              ))}
            </div>
          </div>
        )}

        {p.composition && (
          <div className="detail-section">
            <h4>Состав</h4>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{p.composition}</div>
          </div>
        )}

        {p.note && (
          <div className="detail-section">
            <h4>Заметка</h4>
            <div>{p.note}</div>
          </div>
        )}

        {(p.barcode || p.gtin) && (
          <div className="detail-section">
            <h4>Код</h4>
            <div className="detail-meta">
              {p.barcode ? `Штрихкод ${p.barcode} ` : ''}
              {p.gtin ? `GTIN ${p.gtin}` : ''}
            </div>
          </div>
        )}
      </div>

      <div className="action-row">
        <button className="btn secondary" onClick={consume}>😋 Я съел</button>
        <Link className="btn" to="/form" state={{ ...p, id: p.id }}>✏️ Изменить</Link>
      </div>
      <div style={{ marginTop: 10 }}>
        <button className="btn danger block" onClick={remove}>🗑 Удалить продукт</button>
      </div>
    </>
  );
}
