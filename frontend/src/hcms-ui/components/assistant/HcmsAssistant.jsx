import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ROLES } from '../../modules/auth/constants';
import { sendAssistantMessage } from '../../services/assistantApi';
import './HcmsAssistant.css';

function parseCaseIdFromPath(pathname) {
  const m = pathname.match(/\/hcms\/tickets\/(\d+)/);
  return m ? m[1] : null;
}

function getModuleFromPath(pathname) {
  if (pathname.startsWith('/hcms/tickets')) return 'cases';
  if (pathname.startsWith('/hcms/dashboard')) return 'dashboard';
  if (pathname.startsWith('/hcms/notifications')) return 'notifications';
  if (pathname.startsWith('/hcms/settings')) return 'settings';
  if (pathname.startsWith('/hcms/employee')) return 'profile';
  return 'general';
}

/**
 * Floating HCMS Assistant for the employee portal.
 * Only visible to authenticated employees.
 */
export default function HcmsAssistant() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState([]);
  const endRef = useRef(null);

  const isEmployee = isAuthenticated && user?.role === ROLES.EMPLOYEE;

  const context = useMemo(() => {
    const pathname = location.pathname || '/';
    return {
      userRole: user?.role || null,
      userName: user?.name || null,
      currentPage: pathname,
      currentModule: getModuleFromPath(pathname),
      caseId: parseCaseIdFromPath(pathname)
    };
  }, [location.pathname, user]);

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

    if (!isEmployee) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'The assistant is only available for employees. Please sign in as an employee to use it.',
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
      const data = await sendAssistantMessage(
        historyForApi.map(({ role, content }) => ({ role, content })),
        context
      );
      const reply = data?.reply || '';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || '(No response)' }]);
    } catch (e) {
      const isTimeout = e?.name === 'AbortError' || /timed out|timeout|abort/i.test(e.message || '');
      const errorMessage = e.message || '';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: isTimeout
            ? 'The assistant is taking longer than usual. Please try rephrasing your question or ask a specific HCMS question like "How do I create a case?".'
            : errorMessage || 'Something went wrong. Please try again later.',
          isError: true
        }
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, messages, context, isEmployee]);

  if (!isEmployee) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="hcms-assistant-fab"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Close HCMS Assistant' : 'Open HCMS Assistant'}
        title="HCMS Assistant"
      >
        {open ? (
          <span aria-hidden="true" style={{ fontSize: '1.25rem', lineHeight: 1 }}>
            ×
          </span>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ display: 'block' }}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 10h8M8 14h4" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {open && (
        <>
          <div
            className="hcms-assistant-backdrop"
            role="presentation"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <section
            className="hcms-assistant-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hcms-assistant-heading"
          >
            <header className="hcms-assistant-header">
              <div>
                <h2 id="hcms-assistant-heading" className="hcms-assistant-title">
                  HCMS Assistant
                </h2>
                <p className="hcms-assistant-sub">Ask about HCMS</p>
              </div>
              <button
                type="button"
                className="hcms-assistant-close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </header>

            <div className="hcms-assistant-messages">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`hcms-assistant-row ${m.role === 'user' ? 'hcms-assistant-row--user' : ''}`}
                >
                  <div
                    className={`hcms-assistant-bubble ${
                      m.role === 'user'
                        ? 'hcms-assistant-bubble--user'
                        : m.isError
                          ? 'hcms-assistant-bubble--error'
                          : 'hcms-assistant-bubble--assistant'
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {sending && <div className="hcms-assistant-typing">Thinking…</div>}
              <div ref={endRef} />
            </div>

            <div className="hcms-assistant-composer">
              <textarea
                className="hcms-assistant-input"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your question about HCMS…"
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
                className="hcms-assistant-send"
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
