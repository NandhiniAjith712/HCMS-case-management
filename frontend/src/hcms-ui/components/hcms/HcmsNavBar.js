import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../modules/auth/constants';

function HcmsNavBar({ title }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/hcms/login', { replace: true });
  };

  const roleLabel = ROLE_LABELS[user?.role] || user?.role || 'User';

  return (
    <nav style={styles.nav}>
      <div style={styles.left}>
        <strong style={styles.brand}>HCMS</strong>
        <span style={styles.divider}>|</span>
        <span style={styles.title}>{title}</span>
      </div>
      <div style={styles.right}>
        <span style={styles.user}>
          {user?.name} <small style={styles.role}>({roleLabel})</small>
        </span>
        <button onClick={handleLogout} style={styles.logoutBtn}>
          Logout
        </button>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    background: '#1e293b',
    color: '#fff'
  },
  left: { display: 'flex', alignItems: 'center', gap: 12 },
  brand: { fontSize: 18, letterSpacing: 1 },
  divider: { opacity: 0.5 },
  title: { fontSize: 15, opacity: 0.9 },
  right: { display: 'flex', alignItems: 'center', gap: 16 },
  user: { fontSize: 14 },
  role: { opacity: 0.7, fontWeight: 400 },
  logoutBtn: {
    padding: '6px 14px',
    fontSize: 13,
    color: '#fff',
    background: '#dc2626',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer'
  }
};

export default HcmsNavBar;
