import { expiryStatus } from '../utils.js';

export default function StatusBadge({ days }) {
  const st = expiryStatus(days);
  return <span className={`badge badge-${st.level}`}>{st.icon} {st.label}</span>;
}
