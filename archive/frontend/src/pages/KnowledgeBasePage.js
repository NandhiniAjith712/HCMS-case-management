import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildApiUrl, getAuthHeaders } from '../utils/api';
import '../components/tickets/TicketDetailPage.css';

const MANAGER_ROLES = ['support_manager', 'manager', 'ceo', 'admin'];

export default function KnowledgeBasePage({ user, accessScope = 'agent' }) {
  const navigate = useNavigate();
  const role = String(user?.role || '').toLowerCase();
  const isManager = MANAGER_ROLES.includes(role) || accessScope === 'manager';

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [issueType, setIssueType] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', resolution_summary: '', resolution: '' });
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async ({ searchText = '', issueTypeFilter = '' } = {}) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (searchText.trim()) qs.set('q', searchText.trim());
      if (issueTypeFilter.trim()) qs.set('issue_type', issueTypeFilter.trim());
      const res = await fetch(buildApiUrl(`/api/knowledge?${qs.toString()}`), {
        headers: getAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to load knowledge entries.');
      setEntries(Array.isArray(data.data) ? data.data : []);
    } catch (error) {
      setEntries([]);
      alert(error.message || 'Failed to load knowledge entries.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 280);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    fetchEntries({ searchText: debouncedSearch, issueTypeFilter: issueType });
  }, [debouncedSearch, issueType, fetchEntries]);

  const issueTypeOptions = useMemo(() => {
    const vals = new Set(entries.map((e) => String(e.issue_type || '').trim()).filter(Boolean));
    return Array.from(vals).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const openDetails = async (id) => {
    setSelectedEntryId(id);
    setDetailLoading(true);
    setEditMode(false);
    try {
      const res = await fetch(buildApiUrl(`/api/knowledge/${id}`), { headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to load entry details.');
      const item = data.data;
      setSelectedEntry(item);
      setEditForm({
        title: item?.title || '',
        resolution_summary: item?.resolution_summary || '',
        resolution: item?.resolution || ''
      });
    } catch (error) {
      setSelectedEntry(null);
      alert(error.message || 'Failed to load entry details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!selectedEntryId) return;
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl(`/api/knowledge/${selectedEntryId}`), {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) throw new Error(data?.message || 'Failed to update knowledge entry.');
      setSelectedEntry(data.data);
      setEditMode(false);
      await fetchEntries();
    } catch (error) {
      alert(error.message || 'Failed to update knowledge entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ticket-detail-modern-page" style={{ padding: 20 }}>
      <div className="td-actions-card" style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="td-actions-card-head">
          <div className="td-actions-card-titles">
            <h3 className="td-actions-card-title">Knowledge Base</h3>
            <div className="td-actions-card-subtitle">Auto-generated from closed ticket resolutions</div>
          </div>
          <button type="button" className="td-action-btn td-action-btn--secondary" onClick={() => navigate(-1)}>Back</button>
        </div>
        <div className="td-actions-divider" aria-hidden="true" />
        <div className="td-actions-panel">
          <div className="td-actions-row" style={{ marginBottom: 12 }}>
            <input
              className="td-mgr-input td-mgr-input--grow"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search knowledge entries"
            />
            <select className="td-mgr-input" value={issueType} onChange={(e) => setIssueType(e.target.value)}>
              <option value="">All issue types</option>
              {issueTypeOptions.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <button
              type="button"
              className="td-mgr-btn td-mgr-btn--blue"
              onClick={() => fetchEntries({ searchText: search, issueTypeFilter: issueType })}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          <div className="td-refres-list" style={{ maxHeight: 'none' }}>
            {(entries || []).map((entry) => (
              <div key={entry.id} className="td-refres-item">
                <div className="td-refres-item-head">
                  <div className="td-refres-title">{entry.title || `Ticket #${entry.source_ticket_id}`}</div>
                  <span className="td-status-pill td-status-pill--resolved">KB</span>
                </div>
                <div className="td-refres-preview">{entry.resolution_summary || 'No summary available.'}</div>
                <div className="td-refres-actions">
                  <button type="button" className="td-action-btn td-action-btn--secondary" onClick={() => openDetails(entry.id)}>
                    View Details
                  </button>
                </div>
              </div>
            ))}
            {!loading && entries.length === 0 ? <div className="td-muted">No knowledge entries found.</div> : null}
          </div>
        </div>
      </div>

      {selectedEntryId ? (
        <div className="td-confirm-modal-overlay" onClick={() => setSelectedEntryId(null)}>
          <div className="td-confirm-modal td-refres-modal" onClick={(e) => e.stopPropagation()}>
            {detailLoading ? <p className="td-muted">Loading details...</p> : (
              <>
                <h3>{selectedEntry?.title || 'Knowledge Entry'}</h3>
                <p>
                  Source ticket: #{selectedEntry?.source_ticket_id || '—'}
                </p>
                {editMode ? (
                  <div className="td-cust-escalate-grid">
                    <input className="td-mgr-input" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} />
                    <textarea className="td-confirm-textarea" rows={3} value={editForm.resolution_summary} onChange={(e) => setEditForm((p) => ({ ...p, resolution_summary: e.target.value }))} />
                    <textarea className="td-confirm-textarea" rows={8} value={editForm.resolution} onChange={(e) => setEditForm((p) => ({ ...p, resolution: e.target.value }))} />
                  </div>
                ) : (
                  <div className="td-cust-escalate-grid">
                    <div className="td-refres-preview"><strong>Summary:</strong> {selectedEntry?.resolution_summary || '—'}</div>
                    <div className="td-refres-preview"><strong>Resolution:</strong> {selectedEntry?.resolution || '—'}</div>
                  </div>
                )}
                <div className="td-confirm-actions td-confirm-actions--spaced">
                  <button type="button" className="td-confirm-choice" onClick={() => setSelectedEntryId(null)}>Close</button>
                  {isManager && !editMode ? <button type="button" className="td-confirm-choice td-confirm-choice--active" onClick={() => setEditMode(true)}>Edit</button> : null}
                  {isManager && editMode ? <button type="button" className="td-confirm-choice td-confirm-choice--active" onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button> : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
