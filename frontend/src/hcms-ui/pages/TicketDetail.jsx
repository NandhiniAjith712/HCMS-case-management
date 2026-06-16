import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCaseById, updateCase, getCaseHistory, getCaseComments, addCaseComment, updateCaseStatus } from '../services/caseApi';
import { StatusBadge, PriorityBadge, Timeline, WorkflowProgress } from '../components/UIComponents';

function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [caseData, setCaseData] = useState(null);
  const [history, setHistory] = useState([]);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  useEffect(() => {
    loadCaseData();
  }, [id]);

  const loadCaseData = async () => {
    setLoading(true);
    try {
      const [caseResult, historyResult, commentsResult] = await Promise.all([
        getCaseById(id),
        getCaseHistory(id),
        getCaseComments(id)
      ]);

      if (caseResult.success) {
        setCaseData(caseResult.case);
        setEditForm({
          title: caseResult.case.title,
          description: caseResult.case.description,
          priority: caseResult.case.priority,
          status: caseResult.case.status
        });
      } else {
        setError(caseResult.message || 'Failed to load case');
      }

      if (historyResult.success) {
        setHistory(historyResult.history || []);
      }

      if (commentsResult.success) {
        setComments(commentsResult.comments || []);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const result = await updateCase(id, editForm);
      if (result.success) {
        setCaseData(result.case);
        setIsEditing(false);
        loadCaseData();
      } else {
        setError(result.message || 'Failed to update case');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    }
  };

  const handleStatusUpdate = async (newStatus) => {
    try {
      const result = await updateCaseStatus(id, newStatus);
      if (result.success) {
        setCaseData(result.case);
        loadCaseData();
      } else {
        setError(result.message || 'Failed to update status');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmittingComment(true);
    try {
      const result = await addCaseComment(id, { content: newComment });
      if (result.success) {
        setNewComment('');
        loadCaseData();
      } else {
        setError(result.message || 'Failed to add comment');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const canAddComment = () => {
    return user?.role === 'employee' || user?.role === 'hr' || user?.role === 'admin';
  };

  const canEditCase = () => {
    return user?.role === 'hr' || user?.role === 'admin';
  };

  const canUpdateStatus = () => {
    return user?.role === 'hr' || user?.role === 'admin';
  };

  if (loading) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Loading case details...</div>;
  }

  if (!caseData) {
    return <div style={{ padding: 24, textAlign: 'center' }}>Case not found</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/hcms/tickets')}
        style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', marginBottom: 16 }}
      >
        ← Back to Cases
      </button>

      {error && <div style={{ color: 'red', padding: 8, background: '#fff0f0', borderRadius: 4, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: 'white', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>{caseData.title}</h1>
            <div style={{ marginTop: 8, fontSize: 14, color: '#6b7280' }}>Ticket ID: #{caseData.id}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginLeft: 16 }}>
            <PriorityBadge priority={caseData.priority} />
            <StatusBadge status={caseData.status} />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#6b7280' }}>Description</h3>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{caseData.description}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24, fontSize: 14, color: '#6b7280' }}>
          <div>
            <strong>Category:</strong> {caseData.category || '—'}
          </div>
          <div>
            <strong>Reporting Mode:</strong> {caseData.reporting_mode?.replace('_', ' ') || '—'}
          </div>
          <div>
            <strong>Created:</strong> {caseData.created_at ? new Date(caseData.created_at).toLocaleString() : '—'}
          </div>
          <div>
            <strong>Updated:</strong> {caseData.updated_at ? new Date(caseData.updated_at).toLocaleString() : '—'}
          </div>
          <div>
            <strong>Assignee:</strong> {caseData.assignee_name || 'Unassigned'}
          </div>
          <div>
            <strong>Reporter:</strong> {caseData.reporter_name || '—'}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#6b7280' }}>Workflow Progress</h3>
          <WorkflowProgress status={caseData.status} />
        </div>

        {canUpdateStatus() && (
          <div style={{ marginBottom: 24, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Update Status</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {['open', 'in_progress', 'resolved', 'closed'].map(status => (
                <button
                  key={status}
                  onClick={() => handleStatusUpdate(status)}
                  disabled={caseData.status === status}
                  style={{
                    padding: '8px 16px',
                    background: caseData.status === status ? getStatusColor(status) : 'white',
                    color: caseData.status === status ? 'white' : getStatusColor(status),
                    border: `1px solid ${getStatusColor(status)}`,
                    borderRadius: 4,
                    cursor: caseData.status === status ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}
                >
                  {status.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )}

        {canEditCase() && (
          <button
            onClick={() => setIsEditing(true)}
            style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Edit Case
          </button>
        )}
      </div>

      {isEditing && (
        <div style={{ marginTop: 24, background: 'white', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Edit Case</h3>
          <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Title</label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 4 }}>Description</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                rows={6}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Priority</label>
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Save Changes
              </button>
              <button type="button" onClick={() => setIsEditing(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {canAddComment() && (
        <div style={{ marginTop: 24, background: 'white', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Add Comment</h3>
          <form onSubmit={handleAddComment} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              rows={3}
              style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid #ddd' }}
            />
            <button
              type="submit"
              disabled={isSubmittingComment || !newComment.trim()}
              style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 4, cursor: isSubmittingComment || !newComment.trim() ? 'not-allowed' : 'pointer' }}
            >
              {isSubmittingComment ? 'Adding...' : 'Add Comment'}
            </button>
          </form>
        </div>
      )}

      {comments.length > 0 && (
        <div style={{ marginTop: 24, background: 'white', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>Comments ({comments.length})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {comments.map((comment, index) => (
              <div key={index} style={{ padding: 12, background: '#f9fafb', borderRadius: 4, fontSize: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {comment.author_name || 'Unknown'}
                </div>
                <div style={{ marginBottom: 4 }}>{comment.content}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {comment.created_at ? new Date(comment.created_at).toLocaleString() : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: 24, background: 'white', padding: 24, borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <h3 style={{ margin: '0 0 16px 0' }}>History</h3>
          <Timeline history={history} />
        </div>
      )}
    </div>
  );
}

export default TicketDetail;
