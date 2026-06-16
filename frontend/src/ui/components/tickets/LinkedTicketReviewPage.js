import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import './LinkedTicketReviewPage.css';

const normalizeText = (value) => String(value || '').trim();
const statusLabel = (value) => String(value || 'new').replace(/_/g, ' ');

const previewDescription = (value, max = 260) => {
  const text = normalizeText(value);
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const keywordList = (value) =>
  normalizeText(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 4);

const overlapKeywords = (a, b) => {
  const setA = new Set(keywordList(a));
  const setB = new Set(keywordList(b));
  const overlap = [];
  for (const token of setA) {
    if (setB.has(token)) overlap.push(token);
  }
  return overlap.slice(0, 8);
};

const TicketSnapshot = ({ title, ticket }) => {
  const resolutionSummary = normalizeText(ticket?.resolution_details?.resolution_summary);
  return (
    <section className="ltr-card">
      <h3>{title}</h3>
      <div className="ltr-grid">
        <div><strong>Ticket:</strong> #{ticket?.id || '—'}</div>
        <div><strong>Status:</strong> {statusLabel(ticket?.status)}</div>
        <div><strong>Issue type:</strong> {ticket?.issue_type || '—'}</div>
        <div><strong>Module:</strong> {ticket?.module || '—'}</div>
        <div><strong>Created:</strong> {ticket?.created_at ? formatDateTimeIST(ticket.created_at) : '—'}</div>
        <div><strong>Updated:</strong> {ticket?.updated_at ? formatDateTimeIST(ticket.updated_at) : '—'}</div>
      </div>
      <div className="ltr-block">
        <div className="ltr-label">Issue title</div>
        <div>{normalizeText(ticket?.issue_title) || '—'}</div>
      </div>
      <div className="ltr-block">
        <div className="ltr-label">Description</div>
        <div>{previewDescription(ticket?.description)}</div>
      </div>
      <div className="ltr-block">
        <div className="ltr-label">Resolution summary</div>
        <div>{resolutionSummary || 'Not captured yet'}</div>
      </div>
    </section>
  );
};

const LinkedTicketReviewPage = ({ accessScope = 'manager' }) => {
  const { ticketId, childId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [parentTicket, setParentTicket] = useState(null);
  const [childTicket, setChildTicket] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const headers = getAuthHeaders();
        const [parentRes, childRes] = await Promise.all([
          fetch(buildApiUrl(`/api/tickets/${ticketId}`), { headers }),
          fetch(buildApiUrl(`/api/tickets/${childId}`), { headers })
        ]);
        const parentData = await parentRes.json().catch(() => ({}));
        const childData = await childRes.json().catch(() => ({}));
        if (!parentRes.ok || !parentData.success) {
          throw new Error(parentData?.message || 'Failed to load parent ticket.');
        }
        if (!childRes.ok || !childData.success) {
          throw new Error(childData?.message || 'Failed to load linked ticket.');
        }
        setParentTicket(parentData.data || null);
        setChildTicket(childData.data || null);
      } catch (e) {
        setError(e?.message || 'Could not load combine review details.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [ticketId, childId]);

  const sharedSignals = useMemo(() => {
    if (!parentTicket || !childTicket) return [];
    const signals = [];
    if (
      normalizeText(parentTicket.issue_type).toLowerCase() &&
      normalizeText(parentTicket.issue_type).toLowerCase() === normalizeText(childTicket.issue_type).toLowerCase()
    ) {
      signals.push(`Same issue type: ${parentTicket.issue_type}`);
    }
    if (
      normalizeText(parentTicket.module).toLowerCase() &&
      normalizeText(parentTicket.module).toLowerCase() === normalizeText(childTicket.module).toLowerCase()
    ) {
      signals.push(`Same module: ${parentTicket.module}`);
    }
    const overlap = overlapKeywords(parentTicket.description, childTicket.description);
    if (overlap.length) {
      signals.push(`Shared keywords: ${overlap.join(', ')}`);
    }
    return signals;
  }, [parentTicket, childTicket]);

  const returnTicketId = Number(location.state?.returnTicketId || 0) || Number(childId || 0) || Number(ticketId || 0);
  const backPath = accessScope === 'agent' ? `/agent/ticket/${returnTicketId}` : `/manager/ticket/${returnTicketId}`;

  return (
    <div className="ltr-page">
      <div className="ltr-toolbar">
        <button type="button" className="ltr-btn" onClick={() => navigate(backPath)}>
          Back to ticket
        </button>
      </div>

      <div className="ltr-container">
        <h2>Linked Ticket Combine Review</h2>
        <p>
          Compare only combine-relevant details for ticket <strong>#{ticketId}</strong> and linked ticket
          <strong> #{childId}</strong>.
        </p>

        {loading ? (
          <div className="ltr-state">Loading linked ticket comparison...</div>
        ) : error ? (
          <div className="ltr-state ltr-error">{error}</div>
        ) : (
          <>
            <div className="ltr-signals">
              <h4>Combine Signals</h4>
              {sharedSignals.length ? (
                <ul>
                  {sharedSignals.map((signal) => (
                    <li key={signal}>{signal}</li>
                  ))}
                </ul>
              ) : (
                <div>No strong shared signals detected from current ticket metadata.</div>
              )}
            </div>
            <div className="ltr-layout">
              <TicketSnapshot title="Parent Ticket" ticket={parentTicket} />
              <TicketSnapshot title="Linked Child Ticket" ticket={childTicket} />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default LinkedTicketReviewPage;
