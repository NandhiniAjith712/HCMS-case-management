import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { fetchPublicFeedbackForm, submitPublicFeedback } from '../../utils/api';
import './FeedbackFormPage.css';

const FeedbackFormPage = () => {
  const { ticketId } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [rating, setRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await fetchPublicFeedbackForm(ticketId, token);
        if (!cancelled) {
          setMeta(data);
          if (data?.alreadySubmitted) setSubmitted(true);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Unable to load feedback form.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [ticketId, token]);

  const canSubmit = useMemo(() => rating >= 1 && rating <= 5 && feedbackText.trim().length > 0 && !submitting, [rating, feedbackText, submitting]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      setSubmitting(true);
      setError('');
      await submitPublicFeedback({
        ticketId,
        token,
        rating,
        feedbackText: feedbackText.trim()
      });
      setSubmitted(true);
    } catch (e2) {
      setError(e2.message || 'Failed to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="ff-page"><div className="ff-card">Loading feedback form...</div></div>;
  }

  if (error) {
    return <div className="ff-page"><div className="ff-card"><h2>Feedback unavailable</h2><p>{error}</p></div></div>;
  }

  if (submitted) {
    return (
      <div className="ff-page">
        <div className="ff-card">
          <h2>Thank you for your feedback</h2>
          <p>Your response has been recorded for ticket #{meta?.ticketId || ticketId}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ff-page">
      <form className="ff-card" onSubmit={handleSubmit}>
        <h2>Share your feedback</h2>
        <p className="ff-sub">
          Ticket #{meta?.ticketId} - {meta?.issueTitle || 'Support Request'}
        </p>
        <label className="ff-label">Rating (required)</label>
        <div className="ff-stars" role="radiogroup" aria-label="Ticket rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              type="button"
              key={value}
              className={`ff-star ${rating >= value ? 'ff-star--on' : ''}`}
              onClick={() => setRating(value)}
              aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
            >
              ★
            </button>
          ))}
        </div>

        <label className="ff-label" htmlFor="feedbackText">Written feedback (required)</label>
        <textarea
          id="feedbackText"
          className="ff-textarea"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="Tell us what went well and what can be improved..."
          rows={6}
          required
        />

        <button className="ff-submit" type="submit" disabled={!canSubmit}>
          {submitting ? 'Submitting...' : 'Submit feedback'}
        </button>
      </form>
    </div>
  );
};

export default FeedbackFormPage;

