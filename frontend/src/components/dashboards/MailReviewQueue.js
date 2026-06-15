import React, { useState, useEffect } from 'react';
import { buildApiUrl, authenticatedFetch } from '../../utils/api';
import { formatDateTimeIST } from '../../utils/dateTime';

const MailReviewQueue = () => {
  const [activeTab, setActiveTab] = useState('review');
  const [emails, setEmails] = useState([]);
  const [continuationEmails, setContinuationEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [notification, setNotification] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  
  // Manual reassignment states
  const [isReassigning, setIsReassigning] = useState(false);
  const [manualTicketId, setManualTicketId] = useState('');

  const fetchQueue = async () => {
    setLoading(true);
    try {
      if (activeTab === 'review') {
        const response = await authenticatedFetch(buildApiUrl('/api/mail-review'));
        const result = await response.json();
        if (result.success) {
          setEmails(result.data || []);
        }
      } else {
        const response = await authenticatedFetch(buildApiUrl('/api/mail-review/continuation-queue'));
        const result = await response.json();
        if (result.success) {
          setContinuationEmails(result.data || []);
        }
      }
    } catch (error) {
      console.error('Error fetching review queue:', error);
      showNotification('Failed to fetch review queue', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedEmail(null);
    setReviewNotes('');
    setIsReassigning(false);
    setManualTicketId('');
    fetchQueue();
  }, [activeTab]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Handler for standard email reviews
  const handleAction = async (emailId, action) => {
    setActionInProgress(true);
    try {
      let url = '';
      let options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      if (action === 'create_ticket') {
        url = `/api/mail-review/${emailId}/approve`;
      } else if (action === 'ignore') {
        url = `/api/mail-review/${emailId}/ignore`;
        options.body = JSON.stringify({ type: 'ignored', notes: reviewNotes });
      } else if (action === 'mark_spam') {
        url = `/api/mail-review/${emailId}/ignore`;
        options.body = JSON.stringify({ type: 'spam', notes: reviewNotes });
      }

      const response = await authenticatedFetch(buildApiUrl(url), options);
      const result = await response.json();
      if (result.success) {
        showNotification(result.message || 'Action completed successfully');
        setSelectedEmail(null);
        setReviewNotes('');
        fetchQueue();
      } else {
        showNotification(result.message || 'Action failed', 'error');
      }
    } catch (error) {
      console.error('Error performing action:', error);
      showNotification('Failed to perform action', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  // Handler for continuation actions
  const handleContinuationAction = async (emailId, action, params = {}) => {
    setActionInProgress(true);
    try {
      let url = '';
      let options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      if (action === 'continue') {
        url = `/api/mail-review/${emailId}/continue-ticket`;
      } else if (action === 'new_ticket') {
        url = `/api/mail-review/${emailId}/new-ticket`;
      } else if (action === 'reassign') {
        url = `/api/mail-review/${emailId}/reassign-ticket`;
        options.body = JSON.stringify({ ticketId: params.ticketId });
      } else if (action === 'ignore') {
        url = `/api/mail-review/${emailId}/ignore`;
        options.body = JSON.stringify({ type: 'ignored' });
      } else if (action === 'mark_spam') {
        url = `/api/mail-review/${emailId}/ignore`;
        options.body = JSON.stringify({ type: 'spam' });
      }

      const response = await authenticatedFetch(buildApiUrl(url), options);
      const result = await response.json();
      if (result.success) {
        showNotification(result.message || 'Action completed successfully');
        setSelectedEmail(null);
        setManualTicketId('');
        setIsReassigning(false);
        fetchQueue();
      } else {
        showNotification(result.message || 'Action failed', 'error');
      }
    } catch (error) {
      console.error('Error performing continuation action:', error);
      showNotification('Failed to perform action', 'error');
    } finally {
      setActionInProgress(false);
    }
  };

  const currentEmails = activeTab === 'review' ? emails : continuationEmails;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Mail Review Queue</h1>
          <p className="mt-2 text-gray-600">
            {activeTab === 'review' 
              ? 'Review incoming emails that require domain or SPOC authorization.' 
              : 'AI identified these incoming emails as potential follow-ups to existing issues.'}
          </p>
        </div>
        <button 
          onClick={fetchQueue}
          className="bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg border border-gray-200 shadow-sm transition-all duration-200 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 gap-6">
        <button
          onClick={() => setActiveTab('review')}
          className={`pb-3 font-semibold text-sm transition-all relative outline-none ${
            activeTab === 'review' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Domain & SPOC Review
          {emails.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-800 rounded-full">
              {emails.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('continuation')}
          className={`pb-3 font-semibold text-sm transition-all relative outline-none ${
            activeTab === 'continuation' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Continuation Suggestions
          {continuationEmails.length > 0 && (
            <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-800 rounded-full animate-pulse">
              {continuationEmails.length}
            </span>
          )}
        </button>
      </div>

      {notification && (
        <div className={`mb-6 p-4 rounded-xl border ${notification.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'} animate-slide-up shadow-sm`}>
          {notification.message}
        </div>
      )}

      {currentEmails.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">Queue is empty</h3>
          <p className="text-gray-500 mt-1">No pending items in this review queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Email List */}
          <div className="lg:col-span-1 space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
            {currentEmails.map(email => {
              const scorePercent = email.ai_confidence_score ? Math.round(email.ai_confidence_score * 100) : 0;
              return (
                <div 
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all duration-300 ${
                    selectedEmail?.id === email.id 
                      ? 'bg-blue-50/70 border-blue-300 shadow-md transform scale-[1.02]' 
                      : 'bg-white border-gray-100 hover:border-blue-100 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    {activeTab === 'review' ? (
                      <span className="text-xs font-medium px-2.5 py-0.5 bg-yellow-50 text-yellow-700 border border-yellow-100 rounded-full">Review Required</span>
                    ) : (
                      <span className="text-xs font-semibold px-2.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                        Continuation Match
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{formatDateTimeIST(email.received_at)}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 truncate">{email.subject}</h4>
                  <p className="text-sm text-gray-500 truncate mt-1">From: {email.sender_name || email.sender_email}</p>
                  
                  {activeTab === 'continuation' && email.ai_confidence_score && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${scorePercent}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-amber-700">{scorePercent}% confidence</span>
                    </div>
                  )}

                  {email.validation_result && activeTab === 'review' && (
                    <div className="mt-3 flex gap-1 flex-wrap">
                      {JSON.parse(email.validation_result).reasons?.map(reason => (
                        <span key={reason} className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 bg-red-50 text-red-600 rounded">
                          {reason}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Email Detail & Actions */}
          <div className="lg:col-span-2">
            {selectedEmail ? (
              <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden animate-fade-in flex flex-col h-full max-h-[70vh]">
                <div className="p-6 border-b border-gray-50 bg-gray-50/50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedEmail.subject}</h2>
                      <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                          {selectedEmail.sender_name || 'Unknown'} &lt;{selectedEmail.sender_email}&gt;
                        </span>
                        <span className="flex items-center gap-1">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formatDateTimeIST(selectedEmail.received_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-white space-y-6">
                  {/* AI Suggestion Box for Continuation Tab */}
                  {activeTab === 'continuation' && (
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-50/80 to-amber-100/30 border border-amber-200/60 shadow-sm animate-slide-up">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-xl bg-amber-500 text-white">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-amber-900 flex items-center gap-2">
                            AI Continuation Match Suggestion
                            <span className="px-2 py-0.5 bg-amber-200/60 text-amber-800 text-xs font-black rounded">
                              {Math.round(selectedEmail.ai_confidence_score * 100)}% Match
                            </span>
                          </h3>
                          <p className="mt-1 text-sm text-amber-800 leading-relaxed font-medium">
                            <span className="font-bold">AI Reason: </span>{selectedEmail.ai_continuation_reason}
                          </p>

                          {/* Matched Ticket Card */}
                          <div className="mt-4 p-4 rounded-xl bg-white/90 border border-amber-200 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Target Ticket Match</span>
                              <span className={`text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded ${
                                selectedEmail.ticket_status === 'new' ? 'bg-blue-50 text-blue-600' :
                                selectedEmail.ticket_status === 'in_progress' ? 'bg-amber-50 text-amber-600' :
                                'bg-purple-50 text-purple-600'
                              }`}>
                                {selectedEmail.ticket_status}
                              </span>
                            </div>
                            <h4 className="font-bold text-gray-900 text-base">
                              Ticket #{selectedEmail.ticket_id}: {selectedEmail.ticket_title}
                            </h4>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600">
                              <div><span className="font-semibold text-gray-400">Requester:</span> {selectedEmail.ticket_requester}</div>
                              <div><span className="font-semibold text-gray-400">Agent:</span> {selectedEmail.ticket_agent_name || 'Unassigned'}</div>
                              <div><span className="font-semibold text-gray-400">Priority:</span> <span className="font-bold capitalize">{selectedEmail.ticket_priority}</span></div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="whitespace-pre-wrap text-gray-800 leading-relaxed font-serif text-lg bg-gray-50/50 p-6 rounded-2xl border border-gray-50">
                    {selectedEmail.body}
                  </div>
                </div>

                {/* Actions Block */}
                <div className="p-6 border-t border-gray-50 bg-gray-50/30">
                  {activeTab === 'review' ? (
                    <>
                      <div className="mb-4 animate-slide-up">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Review Notes (Internal)</label>
                        <textarea 
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Why are you taking this action?"
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none resize-none h-24 text-sm"
                        />
                      </div>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => handleAction(selectedEmail.id, 'create_ticket')}
                          disabled={actionInProgress}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-6 rounded-xl shadow-lg shadow-blue-200 transition-all active:transform active:scale-95 flex items-center justify-center gap-2"
                        >
                          {actionInProgress ? 'Processing...' : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              Convert to Ticket
                            </>
                          )}
                        </button>
                        <button 
                          onClick={() => handleAction(selectedEmail.id, 'ignore')}
                          disabled={actionInProgress}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-6 rounded-xl transition-all"
                        >
                          Ignore
                        </button>
                        <button 
                          onClick={() => handleAction(selectedEmail.id, 'mark_spam')}
                          disabled={actionInProgress}
                          className="bg-white hover:bg-red-50 text-red-600 border border-red-100 font-semibold py-3 px-6 rounded-xl transition-all"
                        >
                          Spam
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      {isReassigning ? (
                        <div className="p-4 rounded-xl bg-gray-100 border border-gray-200 flex items-center gap-3 animate-slide-up">
                          <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Enter Target Ticket ID</label>
                            <input 
                              type="number"
                              value={manualTicketId}
                              onChange={(e) => setManualTicketId(e.target.value)}
                              placeholder="e.g. 104"
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm font-semibold"
                            />
                          </div>
                          <div className="flex gap-2 self-end">
                            <button
                              onClick={() => handleContinuationAction(selectedEmail.id, 'reassign', { ticketId: manualTicketId })}
                              disabled={actionInProgress || !manualTicketId}
                              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-4 py-2 rounded-lg text-sm shadow-sm transition-all"
                            >
                              Confirm Reassign
                            </button>
                            <button
                              onClick={() => { setIsReassigning(false); setManualTicketId(''); }}
                              className="bg-white hover:bg-gray-200 text-gray-700 border border-gray-300 font-semibold px-4 py-2 rounded-lg text-sm transition-all"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-3 flex-wrap">
                          <button 
                            onClick={() => handleContinuationAction(selectedEmail.id, 'continue')}
                            disabled={actionInProgress}
                            className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white font-bold py-3 px-6 rounded-xl shadow-lg shadow-amber-100 transition-all flex items-center justify-center gap-2"
                          >
                            {actionInProgress ? 'Processing...' : (
                              <>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                Attach to Ticket #{selectedEmail.ticket_id}
                              </>
                            )}
                          </button>
                          <button 
                            onClick={() => setIsReassigning(true)}
                            disabled={actionInProgress}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-xl transition-all flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                            Manual Reassign
                          </button>
                          <button 
                            onClick={() => handleContinuationAction(selectedEmail.id, 'new_ticket')}
                            disabled={actionInProgress}
                            className="bg-white hover:bg-blue-50 text-blue-600 border border-blue-100 font-semibold py-3 px-5 rounded-xl transition-all flex items-center gap-1.5"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            Force New Ticket
                          </button>
                          <button 
                            onClick={() => handleContinuationAction(selectedEmail.id, 'ignore')}
                            disabled={actionInProgress}
                            className="bg-white hover:bg-red-50 text-red-500 border border-red-50 font-semibold py-3 px-4 rounded-xl transition-all"
                          >
                            Ignore
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full bg-gray-50 rounded-3xl border border-dashed border-gray-200 flex flex-col items-center justify-center p-12 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" /></svg>
                </div>
                <h3 className="text-lg font-medium text-gray-600">Select an email to review</h3>
                <p className="text-sm text-gray-400 mt-1">Match details and decision tools will appear here</p>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        .animate-slide-up { animation: slideUp 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
};

export default MailReviewQueue;
