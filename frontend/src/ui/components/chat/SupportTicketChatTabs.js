import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAuthHeaders, buildApiUrl, fetchTicketReplySuggestions } from '../../utils/api';
import { formatTimeIST } from '../../utils/dateTime';
import LocalPhoneOutlinedIcon from '@mui/icons-material/LocalPhoneOutlined';
import './SupportTicketChatTabs.css';

// Strip quoted/forwarded content from email body - keep only the user's reply
function stripQuotedDisplay(text) {
  if (!text || typeof text !== 'string') return text;
  const onWrote = text.search(/\s+On\s+[A-Za-z]{3},.+wrote:/i);
  if (onWrote > 0) return text.substring(0, onWrote).trim();
  const newlineOn = text.search(/\n\s*On\s+.+wrote:/i);
  if (newlineOn > 0) return text.substring(0, newlineOn).trim();
  const teamWrote = text.search(/\s+ITSM Ticketing Support Team[^>]*>?\s*wrote:/i);
  if (teamWrote > 0) return text.substring(0, teamWrote).trim();
  const fwd = text.search(/\n-{3,}\s*Forwarded message\s*-{3,}/i);
  if (fwd > 0) return text.substring(0, fwd).trim();
  let cleaned = text;
  // Remove Gmail-style trailing metadata line embedded into reply.
  cleaned = cleaned.replace(/\s+On\s+[A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4},?\s+[\s\S]*?<[^>]+>\s*$/i, '').trim();
  cleaned = cleaned.replace(/,\s*<[^>]+>\s*$/i, '').trim();

  // Clean regards, thanks, best regards, sincerely, etc. signatures from end of email
  const signatureRegex = /\n\s*(?:thanks|thank\s+you|regards|best\s+regards|warm\s+regards|kind\s+regards|sincerely|best|cheers|yours\s+sincerely|yours\s+faithfully|thanks\s*(?:&|and)\s*regards),?\s*[\r\n]+[\s\S]*$/i;
  cleaned = cleaned.replace(signatureRegex, '').trim();

  return cleaned;
}

function mergeUniqueMessages(existing = [], incoming = []) {
  const byId = new Map();
  const merged = [...existing, ...incoming];

  for (const msg of merged) {
    if (!msg) continue;
    if (msg.id != null) {
      byId.set(String(msg.id), msg);
      continue;
    }
    const fallbackKey = [msg.userType || '', msg.channel || '', (msg.message || '').trim(), msg.timestamp || ''].join('::');
    if (byId.has(fallbackKey)) continue;
    byId.set(fallbackKey, msg);
  }

  return Array.from(byId.values()).sort((a, b) => {
    const ta = new Date(a?.timestamp || 0).getTime();
    const tb = new Date(b?.timestamp || 0).getTime();
    return ta - tb;
  });
}

function truncateText(text, maxChars) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1))}...`;
}

function formatEtaActivity(value) {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return 'Not set';
  return d.toLocaleString();
}

function getQuickSmallTalkSuggestions(draft, role) {
  const t = String(draft || '').toLowerCase().trim().replace(/[.!?,]/g, '');
  if (!t) return null;
  const isCustomer = ['user', 'customer'].includes(String(role || '').toLowerCase());
  const userSet = {
    greeting: ['Hi, I need help with this ticket.', 'Hello, could you please check this issue?', 'Good day, I need an update on this ticket.'],
    thanks: ['Thank you for your support.', 'Thanks, I appreciate the quick update.', 'Thank you, this is helpful.'],
    ack: ['Okay, I will check and update.', 'Understood, I will try this and confirm.', 'Noted, I will get back to you shortly.'],
    bye: ['Thanks again, I will close this for now.', 'Okay, I will reconnect if needed.', 'Thank you. Have a good day.']
  };
  const staffSet = {
    greeting: ['Hello, how can I assist you today?', 'Hi, please share the issue details.', 'Hello, I am here to help with your ticket.'],
    thanks: ['You are welcome.', 'Glad to help.', 'Happy to assist.'],
    ack: ['Noted. We will proceed accordingly.', 'Understood. We are checking this now.', 'Okay. We will update you shortly.'],
    bye: ['Thank you. Reach out if you need further help.', 'Have a good day.', 'Closing this update for now.']
  };
  const set = isCustomer ? userSet : staffSet;
  if (/^(hi|hello|hey|hii|helo)\b/.test(t) || /\b(good morning|good afternoon|good evening)\b/.test(t)) return set.greeting;
  if (/\b(thanks|thank you|thankyou|thx|ty|welcome|you are welcome|happy to help|glad to help)\b/.test(t)) return set.thanks;
  if (/\b(ok|okay|kk|got it|gotcha|understood|alright|all right|noted|roger)\b/.test(t)) return set.ack;
  if (/\b(bye|goodbye|see you|cya|talk later)\b/.test(t)) return set.bye;
  return null;
}

function getParticipantIdentity({ side, loggedInSide, user, ticket }) {
  if (side === 'user') {
    // IMPORTANT: use stable customer identity across staff + customer sessions.
    // `ticket.user_id` is sometimes missing depending on which endpoint populated `ticket`,
    // but email is reliably present for both sides. Prefer email to avoid mismatched keys.
    const customerEmail = ticket?.email || ticket?.user_email || user?.email || null;
    const customerId = ticket?.user_id || null;
    return {
      side: 'user',
      id: String(customerEmail || customerId || 'user')
    };
  }
  if (side === 'agent') {
    // Prefer the ticket assignee so both customer-side and staff-side compute the same key.
    const agentId = ticket?.assigned_to || (loggedInSide === 'agent' ? user?.id : null);
    return {
      side: 'agent',
      id: String(agentId || 'agent')
    };
  }
  const managerId = loggedInSide === 'manager'
    ? (user?.id || ticket?.manager_id || ticket?.assigned_manager_id || ticket?.assigned_by)
    : (ticket?.manager_id || ticket?.assigned_manager_id || ticket?.assigned_by);
  return {
    side: 'manager',
    id: String(managerId || 'manager')
  };
}

function buildConversationKey({ ticketId, loggedInSide, otherSide, user, ticket }) {
  // Manager<->Agent thread must be a single shared thread per ticket.
  // If we key it by agentId/managerId, internal notes can disappear depending on assignment state.
  if ((loggedInSide === 'agent' && otherSide === 'manager') || (loggedInSide === 'manager' && otherSide === 'agent')) {
    const a = { side: 'agent', id: 'agent' };
    const b = { side: 'manager', id: 'manager' };
    const ordered = [a, b].sort((x, y) => `${x.side}:${x.id}`.localeCompare(`${y.side}:${y.id}`));
    return `tk:${ticketId}::${ordered[0].side}:${ordered[0].id}__${ordered[1].side}:${ordered[1].id}`;
  }
  const a = getParticipantIdentity({ side: loggedInSide, loggedInSide, user, ticket });
  const b = getParticipantIdentity({ side: otherSide, loggedInSide, user, ticket });
  const ordered = [a, b].sort((x, y) => `${x.side}:${x.id}`.localeCompare(`${y.side}:${y.id}`));
  return `tk:${ticketId}::${ordered[0].side}:${ordered[0].id}__${ordered[1].side}:${ordered[1].id}`;
}

const SupportTicketChatTabs = ({ ticket, user, activity = [], activityLoading = false, onReplyAdded }) => {
  const ticketId = ticket?.id;

  const role = (user?.role || '').toLowerCase();
  const userRoleIsCustomer = ['user', 'customer'].includes(role);
  const userRoleIsManager = ['support_manager', 'manager', 'ceo'].includes(role);
  const userRoleIsAgent = ['support_agent', 'agent', 'admin'].includes(role);

  const loggedInSide = userRoleIsCustomer ? 'user' : (userRoleIsManager ? 'manager' : 'agent');

  const SUPPORT_PHONE_NUMBER_RAW = (process.env.REACT_APP_SUPPORT_PHONE_NUMBER || '').trim();
  const SUPPORT_PHONE_HOURS = (process.env.REACT_APP_SUPPORT_PHONE_HOURS || '10:00 AM – 6:00 PM').trim();
  // Temporary fallback number until dedicated number is provisioned.
  const SUPPORT_PHONE_NUMBER = SUPPORT_PHONE_NUMBER_RAW || '+91 90000 12345';
  const canShowCallSupport = loggedInSide === 'user' && !!SUPPORT_PHONE_NUMBER;

  const [showCallPopover, setShowCallPopover] = useState(false);
  const phoneIconRef = useRef(null);
  const callPopoverRef = useRef(null);
  const [copyStatus, setCopyStatus] = useState('');

  const tabsConfig = useMemo(() => {
    // Tabs show the other participant options.
    // Default selection must match the requirements.
    // Customers can only chat with assigned support agent (no direct manager messaging).
    if (loggedInSide === 'user') return { tabs: ['agent'], defaultOther: 'agent' };
    if (loggedInSide === 'agent') return { tabs: ['user', 'manager'], defaultOther: 'user' };
    return { tabs: ['agent', 'user'], defaultOther: 'agent' }; // manager
  }, [loggedInSide]);

  const [selectedOther, setSelectedOther] = useState(tabsConfig.defaultOther);
  useEffect(() => {
    setSelectedOther(tabsConfig.defaultOther);
  }, [tabsConfig.defaultOther]);

  const otherSide = selectedOther;
  const conversationKey = useMemo(
    () => buildConversationKey({ ticketId, loggedInSide, otherSide, user, ticket }),
    [ticketId, loggedInSide, otherSide, user, ticket]
  );

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [replySuggestions, setReplySuggestions] = useState([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const endRef = useRef(null);
  const suggestionsDebounceRef = useRef(null);
  const suggestionsRequestSeqRef = useRef(0);

  useEffect(() => {
    if (!showCallPopover) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowCallPopover(false);
    };

    const onMouseDown = (e) => {
      const pop = callPopoverRef.current;
      const btn = phoneIconRef.current;
      if (pop && pop.contains(e.target)) return;
      if (btn && btn.contains(e.target)) return;
      setShowCallPopover(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown, true);
    };
  }, [showCallPopover]);

  const toggleCallPopover = () => setShowCallPopover((v) => !v);
  const closeCallPopover = () => setShowCallPopover(false);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_PHONE_NUMBER);
      setCopyStatus('Number copied');
    } catch {
      setCopyStatus('Copy failed');
    } finally {
      window.setTimeout(() => setCopyStatus(''), 1500);
    }
  };

  const getSenderSide = (msg) => {
    if (!msg) return null;
    if (msg.userType === 'system') return 'system';
    if (msg.userType === 'customer') return 'user';
    const senderRoleNorm = (msg.senderRole || '').toLowerCase();
    if (['support_manager', 'manager', 'ceo'].includes(senderRoleNorm)) return 'manager';

    // Backward/legacy fallback: infer from sender name prefix (if stored without sender_role).
    const rawAgentName = String(msg.agentName || '').trim();
    if (/^manager\s+/i.test(rawAgentName)) return 'manager';
    if (/^agent\s+/i.test(rawAgentName)) return 'agent';

    return 'agent';
  };

  const canSeeInternal = loggedInSide !== 'user';

  const otherParticipant = useMemo(() => {
    if (otherSide === 'user') {
      return {
        side: 'user',
        name: ticket?.name || ticket?.customer_name || 'User',
        roleLabel: 'User',
      };
    }
    if (otherSide === 'manager') {
      return {
        side: 'manager',
        name: 'Support Manager',
        roleLabel: 'Support Manager',
      };
    }
    // agent
    return {
      side: 'agent',
      name: ticket?.assigned_to_name || 'Support Agent',
      roleLabel: 'Support Agent',
    };
  }, [otherSide, ticket]);

  // Manual route/URL state guard: customers should not access manager tab/thread.
  useEffect(() => {
    if (loggedInSide === 'user' && otherSide === 'manager') {
      setSelectedOther('agent');
      setError('Direct messaging to managers is not allowed. Please contact your assigned support agent.');
    }
  }, [loggedInSide, otherSide]);

  const fetchMessages = async ({ silent = false } = {}) => {
    if (!ticketId) return;
    if (!silent) setLoading(true);
    if (!silent) setError('');
    try {
      const headers = getAuthHeaders();
      const response = await fetch(
        buildApiUrl(`/api/chat/messages/${ticketId}?conversationKey=${encodeURIComponent(conversationKey)}`),
        { method: 'GET', headers }
      );
      const data = await response.json();

      if (!data?.success) {
        if (!silent) {
          setError(data?.message || 'Failed to load messages');
          setMessages([]);
        }
        return;
      }

      const formattedMessages = (data.data || []).map((msg) => {
        const rawMsg = msg?.message || '';
        const cleanMsg = msg?.channel === 'email' ? (stripQuotedDisplay(rawMsg) || rawMsg) : (rawMsg || '');
        return {
          id: msg?.id,
          message: cleanMsg,
          channel: msg?.channel || 'platform_chat',
          userType: msg?.sender_type,
          senderRole: msg?.sender_role || null,
          agentName: msg?.sender_type === 'agent' ? msg?.sender_name : null,
          customerName: msg?.sender_type === 'customer' ? msg?.sender_name : null,
          timestamp: msg?.created_at || msg?.sent_at || null,
          isInternal: !!msg?.is_internal,
        };
      });

      // Conversation is isolated by key; do not merge with stale thread data.
      setMessages(mergeUniqueMessages([], formattedMessages));
    } catch (e) {
      if (!silent) {
        setError('Failed to load conversation');
        setMessages([]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!ticketId) return;
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch on ticketId/user id
  }, [ticketId, user?.id, conversationKey]);

  // Re-fetch when ticket status/updated timestamp changes (e.g. status transitions),
  // so system timeline rows appear without requiring a hard page refresh.
  useEffect(() => {
    if (!ticketId) return;
    fetchMessages({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.status, ticket?.updated_at]);

  // Lightweight polling to surface async system updates (email/webhook/system rows).
  useEffect(() => {
    if (!ticketId) return undefined;
    const id = setInterval(() => {
      fetchMessages({ silent: true });
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, conversationKey]);

  const conversationMessages = useMemo(() => {
    const filtered = messages.filter((msg) => {
      if (!msg) return false;
      if (!canSeeInternal && msg.isInternal) return false;
      // Lifecycle/system updates render as dedicated update cards, not chat bubbles.
      if (msg.userType === 'system') {
        const t = String(msg.message || '').trim().toLowerCase();
        if (/^status updated:/i.test(t)) return false;
        if (/^status changed:/i.test(t)) return false;
        if (/^eta updated:/i.test(t)) return false;
        if (/^ticket\s+#?\d+\s+was\s+created/i.test(t)) return false;
        // Reopen is shown only as an activity update card, not a duplicate system bubble.
        if (
          /ticket has been reopened and is now in progress/i.test(t) ||
          /ticket was reopened and is now in progress/i.test(t)
        ) {
          return false;
        }
      }
      return true;
    });

    return filtered.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());
  }, [messages, loggedInSide, otherSide, canSeeInternal]);

  const latest = conversationMessages[conversationMessages.length - 1] || null;

  const latestStatusInfo = useMemo(() => {
    const rows = Array.isArray(activity) ? activity : [];
    for (const row of rows) {
      let details = row?.details;
      if (typeof details === 'string') {
        try { details = JSON.parse(details); } catch (_) { details = null; }
      }
      const eventType = details?.eventType || details?.event_type;
      if (eventType === 'STATUS_CHANGED' && details?.to) {
        const toLabel = String(details.to || '').replace(/_/g, ' ').trim();
        return {
          text: `Status updated to ${toLabel}`,
          at: row?.created_at || null
        };
      }
      if (eventType === 'REASSIGNED_INTERNAL') {
        const toAgentName = String(details?.to_agent_name || '').trim();
        return {
          text: toAgentName ? `Ticket reassigned to ${toAgentName}` : 'Ticket was reassigned',
          at: row?.created_at || null
        };
      }
      if (eventType === 'REOPENED') {
        return {
          text: 'Ticket has been reopened.',
          at: row?.created_at || null
        };
      }
      if (eventType === 'ETA_UPDATED') {
        return {
          text: 'ETA has been updated. Please check.',
          at: row?.created_at || null
        };
      }
    }
    // Fallback for users without activity permission/history
    if (ticket?.status) {
      return {
        text: `Current status: ${String(ticket.status).replace(/_/g, ' ')}`,
        at: ticket?.updated_at || ticket?.created_at || null
      };
    }
    return null;
  }, [activity, ticket?.status, ticket?.updated_at, ticket?.created_at]);

  const statusUpdates = useMemo(() => {
    const rows = Array.isArray(activity) ? activity : [];
    return rows
      .map((row) => {
        let details = row?.details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch (_) { details = null; }
        }
        const eventType = details?.eventType || details?.event_type;
        let text = '';
        if (eventType === 'STATUS_CHANGED' && details?.to) {
          const toLabel = String(details.to || '').replace(/_/g, ' ').trim();
          text = `Status updated to ${toLabel}`;
        } else if (eventType === 'TICKET_CREATED') {
          text = `Ticket #${ticketId} was created. Our team will review it shortly.`;
        } else if (eventType === 'REASSIGNED_INTERNAL') {
          const toAgentName = String(details?.to_agent_name || '').trim();
          text = toAgentName ? `Ticket reassigned to ${toAgentName}` : 'Ticket was reassigned.';
        } else if (eventType === 'REOPENED') {
          text = 'Ticket has been reopened.';
        } else if (eventType === 'ETA_UPDATED') {
          text = 'ETA has been updated. Please check.';
        } else {
          return null;
        }
        return {
          id: row?.id || `${row?.created_at || ''}-${text}`,
          text,
          at: row?.created_at || null
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime());
  }, [activity, ticketId]);

  const timelineRows = useMemo(() => {
    const msgRows = conversationMessages.map((msg) => ({
      kind: 'message',
      id: msg.id ?? `m-${msg.timestamp ?? ''}-${String(msg.message || '').slice(0, 12)}`,
      at: msg.timestamp || null,
      data: msg
    }));
    const updRows = statusUpdates.map((u) => ({
      kind: 'update',
      id: `u-${u.id}`,
      at: u.at || null,
      data: u
    }));
    return [...msgRows, ...updRows].sort((a, b) => {
      const ta = new Date(a.at || 0).getTime();
      const tb = new Date(b.at || 0).getTime();
      if (ta !== tb) return ta - tb;
      if (a.kind === b.kind) return 0;
      // Keep updates before messages when timestamp is identical.
      return a.kind === 'update' ? -1 : 1;
    });
  }, [conversationMessages, statusUpdates]);

  const latestSenderLabel = useMemo(() => {
    if (!latest) return '';
    const s = getSenderSide(latest);
    if (s === 'system') return 'System';
    if (s === 'user') return 'User';
    if (s === 'manager') return loggedInSide === 'user' ? 'Support' : 'Manager';
    return 'Agent';
  }, [latest, loggedInSide]);

  useEffect(() => {
    // Scroll chat to bottom on tab change or new messages.
    if (!endRef.current) return;
    endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversationMessages.length, otherSide]);

  useEffect(() => () => {
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }
  }, []);

  const senderNameForBubble = (msg) => {
    const s = getSenderSide(msg);
    if (s === 'system') return 'System';
    if (s === loggedInSide) return 'You';
    if (s === 'user') return otherParticipant.name;
    if (s === 'manager') return otherParticipant.name;
    return otherParticipant.name;
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!ticketId) return;
    if (sending) return;
    if (loggedInSide === 'user' && otherSide === 'manager') {
      setError('Direct messaging to managers is not allowed. Please contact your assigned support agent.');
      return;
    }

    const messageText = (newMessage || '').trim();
    if (!messageText) return;

    setSending(true);
    setError('');
    const prevText = newMessage;
    setNewMessage('');
    try {
      const headers = getAuthHeaders();
      const senderType = loggedInSide === 'user' ? 'customer' : 'agent';

      const res = await fetch(buildApiUrl('/api/chat/messages'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ticketId,
          senderType,
          senderId: user?.id || null,
          senderName: user?.name || user?.email || (senderType === 'customer' ? 'User' : 'Agent'),
          message: messageText,
          conversationKey
        }),
      });

      const data = await res.json();
      if (!data?.success) throw new Error(data?.message || 'Failed to send message');

      // Refresh to keep UI consistent with server ordering.
      await fetchMessages();
      if (onReplyAdded) onReplyAdded();
      setSuggestionsError('');
    } catch (err) {
      setError(err?.message || 'Failed to send message');
      setNewMessage(prevText);
    } finally {
      setSending(false);
    }
  };

  const handleSuggestionClick = (text) => {
    setNewMessage(String(text || ''));
  };

  const handleDraftChange = (value) => {
    setNewMessage(value);
    setSuggestionsError('');

    const text = String(value || '').trim();
    if (suggestionsDebounceRef.current) {
      clearTimeout(suggestionsDebounceRef.current);
    }

    if (text.length < 2 || sending || !ticketId) {
      setReplySuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    const quickSmallTalk = getQuickSmallTalkSuggestions(text, role);
    if (quickSmallTalk) {
      setReplySuggestions(quickSmallTalk.slice(0, 4));
      setSuggestionsLoading(false);
      return;
    }

    suggestionsDebounceRef.current = setTimeout(async () => {
      const reqId = suggestionsRequestSeqRef.current + 1;
      suggestionsRequestSeqRef.current = reqId;
      setSuggestionsLoading(true);
      try {
        const suggestions = await fetchTicketReplySuggestions(ticketId, text);
        if (suggestionsRequestSeqRef.current !== reqId) return;
        setReplySuggestions(Array.isArray(suggestions) ? suggestions.slice(0, 4) : []);
      } catch (err) {
        if (suggestionsRequestSeqRef.current !== reqId) return;
        setReplySuggestions([]);
      } finally {
        if (suggestionsRequestSeqRef.current === reqId) {
          setSuggestionsLoading(false);
        }
      }
    }, 420);
  };

  if (!ticket) return null;

  return (
    <div className="support-ticket-chat-tabs">
      {/* Top participant tabs */}
      <div className="stc-tabs" role="tablist" aria-label="Support chat participants">
        {tabsConfig.tabs.map((side) => {
          const label = side === 'agent' ? 'Agent' : side === 'manager' ? 'Manager' : 'User';
          const isActive = side === otherSide;
          return (
            <button
              key={side}
              type="button"
              className={`stc-tab ${isActive ? 'stc-tab--active' : ''}`}
              onClick={() => setSelectedOther(side)}
              role="tab"
              aria-selected={isActive}
            >
              {label}
            </button>
          );
        })}
      </div>
      {loggedInSide === 'user' && (
        <div className="stc-note">
          For assistance, please communicate with your assigned support agent.
        </div>
      )}

      {/* Participant header card */}
      <div className="stc-participant-card">
        <div className="stc-participant-left">
          <div className="stc-avatar" aria-hidden="true">
            {String(otherParticipant.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="stc-participant-meta">
            <div className="stc-participant-name">{otherParticipant.name}</div>
            <div className="stc-participant-role">{otherParticipant.roleLabel}</div>
          </div>
        </div>

        <div className="stc-participant-actions">
          {canShowCallSupport && (
            <div className="stc-call-anchor">
              <button
                ref={phoneIconRef}
                type="button"
                className="stc-icon-button"
                onClick={toggleCallPopover}
                aria-label="View support phone number"
                title="Call support"
              >
                <LocalPhoneOutlinedIcon fontSize="small" />
              </button>

              {showCallPopover && (
                <div
                  ref={callPopoverRef}
                  className="stc-call-popover"
                  role="dialog"
                  aria-label="Contact Support"
                >
                  <div className="stc-call-title">Contact Support</div>
                  <div className="stc-call-number-row">
                    <span className="stc-call-number">{SUPPORT_PHONE_NUMBER}</span>
                    <button type="button" className="stc-copy-btn" onClick={copyNumber} title="Copy number">
                      Copy
                    </button>
                  </div>
                  <div className="stc-call-hours">Available: {SUPPORT_PHONE_HOURS}</div>
                  {!!copyStatus && (
                    <div className="stc-call-copy-status" aria-live="polite">
                      {copyStatus}
                    </div>
                  )}
                  <button
                    type="button"
                    className="stc-call-close"
                    onClick={closeCallPopover}
                    aria-label="Close"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="stc-ticket-badge" title="Ticket">
            TK-{ticketId}
          </div>
        </div>
      </div>

      {/* Latest update strip */}
      <div className="stc-latest-strip" role="status" aria-live="polite">
        <div className="stc-latest-icon" aria-hidden="true">
          i
        </div>
        <div className="stc-latest-text">
          <span className="stc-latest-label">Latest Update:</span>{' '}
          {latestStatusInfo
            ? `${latestStatusInfo.text}${latestStatusInfo.at ? ` · ${formatTimeIST(latestStatusInfo.at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}`
            : (activityLoading
              ? 'Loading latest update...'
              : (latest
                ? `${latestSenderLabel} ${truncateText(latest.message, 90)}`
                : 'No messages yet. Start the conversation here.'))}
        </div>
      </div>

      {/* Scrollable chat area */}
      <div className="stc-chat-scroll" aria-label="Chat messages">
        {loading ? (
          <div className="stc-chat-loading">
            <div className="stc-loading-spinner" />
            <div className="stc-loading-text">Loading conversation...</div>
          </div>
        ) : error ? (
          <div className="stc-chat-error">{error}</div>
        ) : timelineRows.length === 0 ? (
          <div className="stc-chat-empty">No messages yet. Start the conversation here.</div>
        ) : (
          <>
            {timelineRows.map((row) => {
              if (row.kind === 'update') {
                const u = row.data;
                return (
                  <div key={row.id} className="stc-update-card">
                    <div className="stc-update-title">Update notification</div>
                    <div className="stc-update-text">{u.text}</div>
                    <div className="stc-update-time">
                      {u.at ? formatTimeIST(u.at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                );
              }
              const msg = row.data;
              const s = getSenderSide(msg);
              const isMine = s === loggedInSide;
              const bubbleClass = isMine ? 'stc-bubble stc-bubble--mine' : 'stc-bubble stc-bubble--theirs';
              const timeText = msg.timestamp ? formatTimeIST(msg.timestamp, { hour: '2-digit', minute: '2-digit' }) : '';

              const safeMsgText = String(msg.message || '');
              const channel = String(msg.channel || 'platform_chat');
              const channelLabel = channel === 'email' ? 'Email' : channel === 'whatsapp' ? 'WhatsApp' : 'App';
              return (
                <div
                  key={row.id || `${msg.timestamp ?? 't'}-${safeMsgText.slice(0, 10)}`}
                  className={`stc-row ${isMine ? 'stc-row--mine' : 'stc-row--theirs'}`}
                >
                  <div className={`stc-sender-label ${isMine ? 'stc-sender-label--right' : ''}`}>
                    {senderNameForBubble(msg)}
                    {!!channel && (
                      <span className={`stc-channel-badge stc-channel-badge--${channel}`} title={`Message via ${channelLabel}`}>
                        {channelLabel}
                      </span>
                    )}
                    {!!msg.isInternal && loggedInSide !== 'user' && (
                      <span className="stc-channel-badge stc-channel-badge--internal" title="Internal note - staff only">
                        Internal
                      </span>
                    )}
                  </div>
                  <div className={bubbleClass}>{msg.message}</div>
                  <div className={`stc-time ${isMine ? 'stc-time--right' : ''}`}>{timeText}</div>
                </div>
              );
            })}
          </>
        )}
        <div ref={endRef} />
      </div>

      {/* Bottom message composer */}
      <div className="stc-composer">
        <form className="stc-composer-form" onSubmit={handleSendMessage}>
          <textarea
            className="stc-input"
            value={newMessage}
            onChange={(e) => handleDraftChange(e.target.value)}
            placeholder={sending ? 'Sending...' : 'Type your message...'}
            rows={2}
            disabled={sending}
          />
          <button className="stc-send-btn" type="submit" disabled={sending || !newMessage.trim()}>
            <span className="stc-send-icon" aria-hidden="true">
              ➤
            </span>
          </button>
        </form>
        {!!suggestionsError && (
          <div className="stc-suggestions-error">{suggestionsError}</div>
        )}
        {suggestionsLoading && (
          <div className="stc-suggestions-loading">Generating...</div>
        )}
        {replySuggestions.length > 0 && (
          <div className="stc-suggestions-row">
            {replySuggestions.map((suggestion, index) => (
              <button
                key={`stc-suggestion-${index}`}
                type="button"
                className="stc-suggestion-chip"
                onClick={() => handleSuggestionClick(suggestion)}
                title="Click to fill message input"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportTicketChatTabs;

