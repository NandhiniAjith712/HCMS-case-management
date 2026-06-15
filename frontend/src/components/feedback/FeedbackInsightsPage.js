import React, { useEffect, useState } from 'react';
import { fetchFeedbackInsights } from '../../utils/api';
import './FeedbackInsightsPage.css';

const FeedbackInsightsPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const result = await fetchFeedbackInsights();
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load feedback insights.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const productRows = Array.isArray(data?.productInsights) ? data.productInsights : [];

  if (loading) return <div className="fi-wrap"><p>Loading feedback insights...</p></div>;
  if (error) return <div className="fi-wrap"><p>{error}</p></div>;

  return (
    <div className="fi-wrap">
      <h2>Feedback Insights</h2>
      <p className="fi-sub">Product-wise feedback performance and AI sentiment summary.</p>

      <div className="fi-cards">
        <div className="fi-card">
          <div className="fi-label">Total feedback</div>
          <div className="fi-value">{data?.overall?.totalFeedback || 0}</div>
        </div>
        <div className="fi-card">
          <div className="fi-label">Positive</div>
          <div className="fi-value">{data?.overall?.sentiment?.positive || 0}</div>
        </div>
        <div className="fi-card">
          <div className="fi-label">Neutral</div>
          <div className="fi-value">{data?.overall?.sentiment?.neutral || 0}</div>
        </div>
        <div className="fi-card">
          <div className="fi-label">Negative</div>
          <div className="fi-value">{data?.overall?.sentiment?.negative || 0}</div>
        </div>
      </div>

      <div className="fi-section">
        <h3>Top recurring themes</h3>
        <div className="fi-theme-list">
          {(data?.overall?.topThemes || []).length === 0 ? (
            <span className="fi-muted">No themes available.</span>
          ) : (
            (data?.overall?.topThemes || []).map((t) => (
              <span key={`${t.theme}-${t.count}`} className="fi-theme-chip">{t.theme} ({t.count})</span>
            ))
          )}
        </div>
      </div>

      <div className="fi-section">
        <div className="fi-section-head">
          <h3>Product-wise feedback</h3>
        </div>
        <table className="fi-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Feedback count</th>
              <th>Avg rating</th>
              <th>Recurring themes</th>
            </tr>
          </thead>
          <tbody>
            {productRows.length === 0 ? (
              <tr><td colSpan={4} className="fi-empty">No product feedback data.</td></tr>
            ) : productRows.map((row) => (
              <tr key={row.product}>
                <td>{row.product}</td>
                <td>{row.feedbackCount}</td>
                <td>{row.avgRating}</td>
                <td>{(row.topThemes || []).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FeedbackInsightsPage;

