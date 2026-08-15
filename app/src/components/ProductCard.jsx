import { Link } from 'react-router-dom';
import { daysUntil, expiryStatus, fmtDate, fmtKbju } from '../utils.js';

export default function ProductCard({ p }) {
  const days = daysUntil(p.expiry_date);
  const st = expiryStatus(days);
  return (
    <Link to={`/product/${p.id}`} className={`product-card bar-${st.level}`}>
      {p.image_url ? <img className="p-img" src={p.image_url} alt="" /> : null}
      <div className="card-body">
        <p className="p-name">{p.name}</p>
        {p.brand ? <div className="p-brand">{p.brand}</div> : null}
        <div className="p-expiry">
          {st.icon}
          <span>{p.expiry_date ? fmtDate(p.expiry_date) : 'Срок не указан'} · {st.label}</span>
        </div>
        <div className="p-kbju">
          {p.category ? <span className="kbju-chip">🗂 {p.category}</span> : null}
          {fmtKbju(p).map((s) => (
            <span key={s} className="kbju-chip">{s}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}
