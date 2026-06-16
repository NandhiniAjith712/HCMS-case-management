import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders, isStaffRoute } from '../../utils/api';
import './ItsmAssistant.css';

const STAFF_LIKE_ROLES = new Set([
  'support_agent',
  'support_manager',
  'ceo',
  'admin',
  'agent',
  'manager',
  'business_dashboard'
]);

/**
 * Assistant is only for end-user customer sessions (support URL / customer login).
 * Staff and business-dashboard paths never see the FAB.
 */
function isCustomerEndUserSession() {
  if (typeof window === 'undefined') return false;
  if (isStaffRoute()) return false;

  const customerToken =
    sessionStorage.getItem('customerToken') ||
    localStorage.getItem('customerToken') ||
    localStorage.getItem('access_token');
  if (!customerToken) return false;

  const raw =
    sessionStorage.getItem('customerData') || localStorage.getItem('customerData');
  if (!raw) return false;

  try {
    const u = JSON.parse(raw);
    const role = String(u?.role || 'user').toLowerCase();
    if (STAFF_LIKE_ROLES.has(role)) return false;
    return role === 'user' || role === 'customer';
  } catch {
    return false;
  }
}

function getCustomerContextRole() {
  const raw =
    sessionStorage.getItem('customerData') || localStorage.getItem('customerData');
  if (!raw) return 'user';
  try {
    const u = JSON.parse(raw);
    return String(u?.role || 'user').toLowerCase();
  } catch {
    return 'user';
  }
}

function parseTicketIdFromPath(pathname) {
  const m =
    pathname.match(/\/(?:agent|manager|customer|user)\/ticket\/(\d+)/) ||
    pathname.match(/^\/ticket\/(\d+)/);
  return m ? m[1] : null;
}

function hasCustomerBearerToken() {
  return isCustomerEndUserSession() && Boolean(getAuthHeaders().Authorization);
}

/**
 * Floating ITSM help assistant (platform usage). Not ticket support chat.
 */
export default function ItsmAssistant() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [authReady, setAuthReady] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    setAuthReady(isCustomerEndUserSession() && Boolean(getAuthHeaders().Authorization));
  }, [location.pathname]);

  const context = useMemo(() => {
    const pathname = location.pathname || '/';
    return {
      userRole: getCustomerContextRole(),
      currentPage: pathname,
      ticketId: parseTicketIdFromPath(pathname)
    };
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [open, messages, sending]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    if (!hasCustomerBearerToken()) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Please sign in as a customer to use the assistant.',
          isError: true
        }
      ]);
      setInput('');
      return;
    }

    const nextUser = { role: 'user', content: text };
    const historyForApi = [...messages.filter((m) => !m.isError), nextUser];

    setMessages((prev) => [...prev, nextUser]);
    setInput('');
    setSending(true);

    try {
      const headers = getAuthHeaders();
      const res = await fetch(buildApiUrl('/api/ai/assistant'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: historyForApi.map(({ role, content }) => ({ role, content })),
          context
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 404) {
          throw new Error(
            'Assistant service is unavailable (API not found). Restart the backend server so it loads the latest routes, then try again.'
          );
        }
        throw new Error(data.message || `Request failed (${res.status})`);
      }
      const reply = data.data?.reply || '';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '(No response)' }]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: e.message || 'Something went wrong. Try again later.',
          isError: true
        }
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, context]);

  if (!authReady) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="itsm-assistant-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close ITSM Support Assistant' : 'Open ITSM Support Assistant'}
        title="ITSM Support Assistant"
      >
        {open ? (
          <span aria-hidden="true" style={{ fontSize: '1.5rem', lineHeight: 1 }}>
            ×
          </span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 10h8M8 14h4" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            className="itsm-assistant-backdrop"
            role="presentation"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <section
            className="itsm-assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="itsm-assistant-heading"
          >
            <header className="itsm-assistant-header">
              <div>
                <h2 id="itsm-assistant-heading" className="itsm-assistant-title">
                  ITSM Support Assistant
                </h2>
                <p className="itsm-assistant-sub">Ask your questions</p>
              </div>
              <button
                type="button"
                className="itsm-assistant-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="itsm-assistant-messages">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`itsm-assistant-row ${m.role === 'user' ? 'itsm-assistant-row--user' : ''}`}
                >
                  <div
                    className={`itsm-assistant-bubble ${
                      m.role === 'user'
                        ? 'itsm-assistant-bubble--user'
                        : m.isError
                          ? 'itsm-assistant-bubble--error'
                          : 'itsm-assistant-bubble--assistant'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && <div className="itsm-assistant-typing">Thinking…</div>}
              <div ref={endRef} />
            </div>

            <div className="itsm-assistant-composer">
              <textarea
                className="itsm-assistant-input"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question…"
                disabled={sending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                aria-label="Message"
              />
              <button
                type="button"
                className="itsm-assistant-send"
                onClick={sendMessage}
                disabled={sending || !input.trim()}
              >
                Send
              </button>
            </div>
          </section>
        </>
      )}
    </>
  );
}
