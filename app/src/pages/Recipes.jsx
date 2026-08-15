import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { haptic } from '../telegram.js';

const MODES = [
  { key: 'own', label: '🥣 Из того, что есть' },
  { key: 'suggest', label: '🛒 Предложи докупить' },
];

const LEVELS = [
  { key: 'fast', label: '⚡ Быстрая' },
  { key: 'medium', label: '🔥 Заморочиться' },
  { key: 'gourmet', label: '👨‍🍳 Ресторанный' },
];

export default function Recipes() {
  const [mode, setMode] = useState('own');
  const [level, setLevel] = useState('fast');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const r = await api('/recipes/generate', { method: 'POST', body: { mode, level } });
      setResult(r);
      haptic('success');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <>
      <div className="topbar">
        <Link className="back-btn" to="/">←</Link>
        <h1>🍳 Рецепты</h1>
      </div>

      <div className="detail-card" style={{ marginBottom: 10 }}>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Режим</label>
          <div className="row-scroll" style={{ marginBottom: 0 }}>
            {MODES.map((m) => (
              <button key={m.key} className={`chip ${mode === m.key ? 'active' : ''}`} onClick={() => setMode(m.key)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Уровень готовки</label>
          <div className="row-scroll" style={{ marginBottom: 0 }}>
            {LEVELS.map((l) => (
              <button key={l.key} className={`chip ${level === l.key ? 'active' : ''}`} onClick={() => setLevel(l.key)}>
                {l.label}
              </button>
            ))}
          </div>
        </div>
        <button className="btn block" onClick={generate} disabled={loading}>
          {loading ? '🧠 Нейросеть думает…' : '🍲 Сгенерировать рецепты'}
        </button>
        {error && <div className="error-text">{error}</div>}
      </div>

      {result && (
        <>
          <div className="stats-row">
            <div className="stat-chip">{result.ai ? `🤖 Нейросеть (${result.model})` : '📚 Локальная база'}</div>
            <div className="stat-chip">{result.recipes.length} рецептов</div>
          </div>
          {result.note && <div className="detail-meta" style={{ marginBottom: 8 }}>ℹ️ {result.note}</div>}

          <div className="product-list">
            {result.recipes.map((r, i) => (
              <div key={i} className="detail-card recipe-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <h2 style={{ fontSize: 17, margin: 0 }}>{r.name}</h2>
                  <span className="kbju-chip" style={{ flex: '0 0 auto' }}>{r.minutes} мин</span>
                </div>
                <div className="detail-meta" style={{ marginTop: 4 }}>
                  {r.levelLabel}
                  {r.description ? ` · ${r.description}` : ''}
                </div>

                <div className="detail-section">
                  <h4>Ингредиенты</h4>
                  <div className="ing-list">
                    {(r.have || []).map((ing, j) => (
                      <span key={'h' + j} className="ing-tag have">✅ {ing}</span>
                    ))}
                    {(r.missing || []).map((ing, j) => (
                      <span key={'m' + j} className="ing-tag missing">❌ {ing}</span>
                    ))}
                  </div>
                </div>

                {(mode === 'suggest' && r.shopping && r.shopping.length > 0) && (
                  <div className="detail-section">
                    <h4>🛒 Что докупить</h4>
                    <div className="shopping-box">
                      {r.shopping.map((s, j) => (
                        <span key={j} className="kbju-chip">🛒 {s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {r.steps && r.steps.length > 0 && (
                  <div className="detail-section">
                    <h4>Приготовление</h4>
                    <ol className="recipe-steps">
                      {r.steps.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
