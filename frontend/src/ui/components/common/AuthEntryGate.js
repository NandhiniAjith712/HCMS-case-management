import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { buildApiUrl } from '../../utils/api';

const AuthEntryGate = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const targetRaw = String(searchParams.get('target') || '/login').trim();
      const email = String(searchParams.get('e') || '').trim();
      const name = String(searchParams.get('u') || '').trim();
      const roleHint = String(searchParams.get('roleHint') || '').trim().toLowerCase();
      const target = targetRaw.startsWith('/') ? targetRaw : `/${targetRaw}`;
      const targetWithIdentity =
        email && !/[?&]e=/.test(target)
          ? `${target}${target.includes('?') ? '&' : '?'}e=${encodeURIComponent(email)}${name ? `&u=${encodeURIComponent(name)}` : ''}`
          : target;

      const goCustomer = () => {
        const qs = new URLSearchParams();
        if (email) qs.set('e', email);
        if (name) qs.set('u', name);
        qs.set('returnTo', targetWithIdentity);
        navigate(`/customer-access?${qs.toString()}`, { replace: true });
      };

      const goStaff = () => {
        const qs = new URLSearchParams();
        if (email) qs.set('email', email);
        qs.set('returnTo', target);
        navigate(`/login?${qs.toString()}`, { replace: true });
      };

      if (roleHint === 'customer') return goCustomer();
      if (roleHint === 'staff') return goStaff();

      if (!email || !email.includes('@')) return goStaff();

      try {
        const res = await fetch(buildApiUrl('/api/auth/customers/check-email'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        // Customer path (existing or first-time customer flows)
        if (res.ok && data?.success) return goCustomer();

        const msg = String(data?.message || '').toLowerCase();
        if (msg.includes('staff should use')) return goStaff();
        return goStaff();
      } catch (_) {
        if (!cancelled) goStaff();
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
      <div>Redirecting to sign in...</div>
    </div>
  );
};

export default AuthEntryGate;
