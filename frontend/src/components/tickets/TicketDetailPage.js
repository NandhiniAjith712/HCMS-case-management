import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { getAuthHeaders, getAuthHeadersFormData, authenticatedFetch, buildApiUrl } from '../../utils/api';
import { formatDateTimeIST, formatTimeIST } from '../../utils/dateTime';
import './TicketDetailPage.css';
import SupportTicketChatTabs from '../chat/SupportTicketChatTabs';

const TdSvg = ({ children, ...rest }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

const TD_ICONS = {
  user: (
    <TdSvg>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </TdSvg>
  ),
  mail: (
    <TdSvg>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </TdSvg>
  ),
  tag: (
    <TdSvg>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
    </TdSvg>
  ),
  package: (
    <TdSvg>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </TdSvg>
  ),
  layers: (
    <TdSvg>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </TdSvg>
  ),
  calendar: (
    <TdSvg>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </TdSvg>
  ),
  paperclip: (
    <TdSvg>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </TdSvg>
  ),
  clock: (
    <TdSvg>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </TdSvg>
  ),
  fileText: (
    <TdSvg>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </TdSvg>
  ),
  checkCircle: (
    <TdSvg>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </TdSvg>
  ),
  alertTriangle: (
    <TdSvg>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
    </TdSvg>
  ),
  bell: (
    <TdSvg>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </TdSvg>
  ),
  shield: (
    <TdSvg>
      <path d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4z" />
      <path d="M9 12l2 2 4-4" />
    </TdSvg>
  ),
  userSwitch: (
    <TdSvg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <path d="M20 8v6" />
      <path d="M23 11h-6" />
    </TdSvg>
  ),
  users: (
    <TdSvg>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </TdSvg>
  )
};

function TdFieldRow({ label, icon, children, className = '' }) {
  return (
    <div className={`td-field-row ${className}`.trim()}>
      <span className="td-field-icon" aria-hidden="true">{icon}</span>
      <span className="td-field-label">{label}</span>
      <div className="td-field-value">{children}</div>
    </div>
  );
}

const ESCALATION_PATHS = {
  L1: ['L2', 'L3', 'MANAGER'],
  L2: ['L3', 'MANAGER'],
  L3: ['MANAGER'],
  MANAGER: []
};

const RESOLUTION_FIX_TYPE_OPTIONS = [
  'Configuration Issue',
  'Data Fix',
  'Code Fix',
  'User Error',
  'External Dependency'
];

const TicketDetailPage = ({ user: propUser, accessScope = null }) => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const DEBUG = process.env.NODE_ENV !== 'production' && String(process.env.REACT_APP_DEBUG || '') === '1';
  const dlog = (...args) => { if (DEBUG) console.log(...args); };
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Resolve user: prop from App or from storage (staff)
  const [user, setUser] = useState(propUser || null);
  const isCustomerRoute = location.pathname.startsWith('/customer/ticket/') || location.pathname.startsWith('/user/ticket/');
  const isAgentRoute = location.pathname.startsWith('/agent/ticket/');
  const isManagerRoute = location.pathname.startsWith('/manager/ticket/');
  const normalizedScope = (accessScope || '').toLowerCase();
  const scopedAsCustomer = normalizedScope === 'customer';
  const scopedAsAgent = normalizedScope === 'agent';
  const scopedAsManager = normalizedScope === 'manager';
  const scopedAsCeo = normalizedScope === 'ceo';
  const routeIsCustomer = isCustomerRoute || scopedAsCustomer;
  const routeIsManager = isManagerRoute || scopedAsManager;
  const routeIsAgent = isAgentRoute || scopedAsAgent;
  useEffect(() => {
    if (propUser) setUser(propUser);
    else {
      try {
        if (routeIsCustomer) {
          const customerStored = localStorage.getItem('customerData') || localStorage.getItem('userData');
          setUser(customerStored ? JSON.parse(customerStored) : null);
        } else {
          const staffStored = sessionStorage.getItem('staffData') || localStorage.getItem('staffData');
          setUser(staffStored ? JSON.parse(staffStored) : null);
        }
      } catch { setUser(null); }
    }
  }, [propUser, routeIsCustomer]);
  const role = (user?.role || '').toLowerCase();
  const userRoleIsCustomer = ['user', 'customer'].includes(role);
  const userRoleIsManager = ['support_manager', 'manager', 'ceo'].includes(role);
  const userRoleIsAgent = ['support_agent', 'agent', 'admin'].includes(role);
  const userRoleIsCeo = role === 'ceo';
  const etaUpdateAllowed = ['support_agent', 'agent'].includes(role);
  const isCustomer = routeIsCustomer || (!accessScope && userRoleIsCustomer);
  const isCeo = scopedAsCeo || (!accessScope && userRoleIsCeo);
  const isManager = !isCeo && (routeIsManager || (!accessScope && userRoleIsManager));
  const isAgent = routeIsAgent || (!accessScope && userRoleIsAgent);
  const isStaff = !isCustomer;
  const isLinkedChild = Boolean(ticket?.parent_ticket_id);
  const linkedChildren = Array.isArray(ticket?.linked_children) ? ticket.linked_children : [];
  const parentTicketSummary = ticket?.parent_ticket_summary || null;
  const childWorkflowLocked = isLinkedChild && !isCustomer;
  const parentTicketDetailViewPath = parentTicketSummary?.id
    ? (
      isManager
        ? `/manager/ticket/${parentTicketSummary.id}/linked/${ticketId}/review`
        : isAgent
          ? `/agent/ticket/${parentTicketSummary.id}/linked/${ticketId}/review`
          : `/customer/ticket/${parentTicketSummary.id}`
    )
    : null;
  const currentTicketLevel = String(ticket?.current_level || ticket?.current_owner_level || 'L1').toUpperCase();
  const allowedEscalationLevels = ESCALATION_PATHS[currentTicketLevel] || [];
  const escalationHistory = Array.isArray(ticket?.escalation_history) ? ticket.escalation_history : [];
  const handleBackNavigation = () => {
    if (isCustomer) {
      navigate(location.state?.returnTo || '/userdashboard');
      return;
    }
    if (isManager) {
      navigate('/manager');
      return;
    }
    if (isAgent) {
      navigate('/agentdashboard');
      return;
    }
    navigate('/login');
  };
  const handleOpenSupportChat = () => {
    if (isCeo) return;
    setShowChatSupport(true);
  };
  const [agents, setAgents] = useState([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [reassignAgentId, setReassignAgentId] = useState('');
  const [reassigning, setReassigning] = useState(false);
  const [taskData, setTaskData] = useState({ tasks: [], progress: { total: 0, completed: 0 }, removedTasks: [] });
  const [taskHistory, setTaskHistory] = useState([]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [completingTasks, setCompletingTasks] = useState(false);
  const [taskReassignId, setTaskReassignId] = useState(null); // task ID currently being reassigned
  const [taskReassignAgentId, setTaskReassignAgentId] = useState('');
  const [taskReassigning, setTaskReassigning] = useState(false);
  const [removeAgentModal, setRemoveAgentModal] = useState(null); // { taskId, agentName, agentId, taskName }
  const [removeAgentReason, setRemoveAgentReason] = useState('');
  const [removingAgent, setRemovingAgent] = useState(false);
  const [showRemovedAgents, setShowRemovedAgents] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [similarRecommendations, setSimilarRecommendations] = useState([]);
  const [referenceResolutions, setReferenceResolutions] = useState([]);
  const [showReferenceResolutionsModal, setShowReferenceResolutionsModal] = useState(false);
  const [showReferenceResolutionPreview, setShowReferenceResolutionPreview] = useState(false);
  const [referenceResolutionPreviewLoadingTicketId, setReferenceResolutionPreviewLoadingTicketId] = useState(null);
  const [referenceResolutionPreviewError, setReferenceResolutionPreviewError] = useState('');
  const [referenceResolutionPreviewTicket, setReferenceResolutionPreviewTicket] = useState(null); // { ticketId, title, resolution_details }
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsError, setRecommendationsError] = useState('');
  const [selectedSimilarTicketIds, setSelectedSimilarTicketIds] = useState([]);
  const [combineReason, setCombineReason] = useState('');
  const [combineSubmitting, setCombineSubmitting] = useState(false);
  const [unlinkingChildId, setUnlinkingChildId] = useState(null);
  const [resolutionReuseModal, setResolutionReuseModal] = useState(null); // { summary: string }

  const [linkGroup, setLinkGroup] = useState(null);
  const [linkedTicketsInternal, setLinkedTicketsInternal] = useState([]);
  const [linkedLoadingInternal, setLinkedLoadingInternal] = useState(false);
  const [linkGroupLabel, setLinkGroupLabel] = useState('');
  const [linkingTicketId, setLinkingTicketId] = useState(null);
  const [unlinkingTicketId, setUnlinkingTicketId] = useState(null);
  const [shareNoteText, setShareNoteText] = useState('');
  const [sharedNotesLog, setSharedNotesLog] = useState([]); // [{ note: string, created_at: string }]
  // Bulk close UI removed from linked tickets section (see requirements).
  
  // SLA Timer state (frontend must not recompute SLA; use ticket snapshot + server timer only)
  const [currentTime, setCurrentTime] = useState(new Date());
  // Server-backed SLA timer
  const [serverTimer, setServerTimer] = useState(null);
  const [serverTimerLoading, setServerTimerLoading] = useState(false);
  const [serverTimerError, setServerTimerError] = useState('');
  
  // Attachment modal state
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(false);
  const [attachmentPreviewError, setAttachmentPreviewError] = useState('');
  const [attachmentPreviewText, setAttachmentPreviewText] = useState('');
  const [attachmentAnalysis, setAttachmentAnalysis] = useState(null);
  const [ticketAttachments, setTicketAttachments] = useState([]);
  const [attachmentAnalysisLoading, setAttachmentAnalysisLoading] = useState(false);
  const [attachmentAnalysisError, setAttachmentAnalysisError] = useState('');
  // Multi-attachment analysis state (per attachment id)
  const [attachmentAnalysesById, setAttachmentAnalysesById] = useState({}); // { [attachmentId]: analysis|null }
  const [attachmentAnalysisLoadingById, setAttachmentAnalysisLoadingById] = useState({}); // { [attachmentId]: boolean }
  const [attachmentAnalysisErrorById, setAttachmentAnalysisErrorById] = useState({}); // { [attachmentId]: string }
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [resolutionMode, setResolutionMode] = useState('view');
  const [resolutionSaving, setResolutionSaving] = useState(false);
  const [showCustomerResolutionConfirm, setShowCustomerResolutionConfirm] = useState(false);
  const [customerResolutionAnswer, setCustomerResolutionAnswer] = useState(''); // 'yes' | 'no'
  const [customerRejectionReason, setCustomerRejectionReason] = useState('');
  const [showCustomerReopenModal, setShowCustomerReopenModal] = useState(false);
  const [customerReopenReason, setCustomerReopenReason] = useState('');
  const [customerConfirmSubmitting, setCustomerConfirmSubmitting] = useState(false);
  const [customerResolutionConfirmDeferred, setCustomerResolutionConfirmDeferred] = useState(false);
  const [resolutionForm, setResolutionForm] = useState({
    resolution_summary: '',
    internal_steps: '',
    root_cause: '',
    fix_type: RESOLUTION_FIX_TYPE_OPTIONS[0],
    reference_data: ''
  });
  const [resolutionAttachment, setResolutionAttachment] = useState(null);

  const buildConversationKeyAgentUser = useCallback(() => {
    const a = { side: 'agent', id: String(ticket?.assigned_to || 'agent') };
    const b = { side: 'user', id: String(ticket?.email || user?.email || 'user') };
    const ordered = [a, b].sort((x, y) => `${x.side}:${x.id}`.localeCompare(`${y.side}:${y.id}`));
    return `tk:${ticketId}::${ordered[0].side}:${ordered[0].id}__${ordered[1].side}:${ordered[1].id}`;
  }, [ticket?.assigned_to, ticket?.email, user?.email, ticketId]);

  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState('');
  const [notifyReference, setNotifyReference] = useState('');
  const [notifySending, setNotifySending] = useState(false);

  // Customer popup acknowledgement for notify messages (audit)
  const [pendingNotices, setPendingNotices] = useState([]);
  const [activeNotice, setActiveNotice] = useState(null);
  const [ackSubmitting, setAckSubmitting] = useState(false);

  // Customer-visible notify-customer updates rendered under Resolution section
  const [notifyUpdates, setNotifyUpdates] = useState([]);

  const loadResolutionSampleData = () => {
    const fixTypePreference = [
      'Configuration Issue',
      'Data Fix',
      'Code Fix',
      'External Dependency',
      'User Error'
    ];
    const fixType =
      fixTypePreference.find((x) => RESOLUTION_FIX_TYPE_OPTIONS.includes(x)) || RESOLUTION_FIX_TYPE_OPTIONS[0];
    const issue = String(ticket?.issue_type || ticket?.issueTitle || 'the reported issue').trim();
    const module = String(ticket?.module || '').trim();
    const product = String(ticket?.product || '').trim();
    const context = [product, module].filter(Boolean).join(' / ');

    setResolutionForm({
      resolution_summary: `Resolved ${issue.toLowerCase()} by correcting the approval mapping and re-triggering the workflow${context ? ` in ${context}` : ''}. Users can now approve and the access review queue is processing normally.`,
      internal_steps:
        `1) Verified the impacted workflow instances and confirmed the “Approve” action was disabled due to missing reviewer mapping.\n` +
        `2) Checked role-to-approver configuration for the affected access review definition.\n` +
        `3) Updated the approver mapping to include the correct manager group and ensured fallback reviewer is configured.\n` +
        `4) Re-triggered pending tasks and validated approval action on a test user.\n` +
        `5) Monitored audit log/events for 10 minutes to confirm approvals are being recorded.`,
      root_cause:
        'Reviewer/approver mapping was incomplete after a recent org/role update, causing tasks to render without a valid approver assignment.',
      fix_type: fixType,
      reference_data: 'Change: Updated approval mapping + re-triggered workflow. Evidence: audit log entries captured during validation.'
    });
  };

  // Lock background scroll when media preview is open
  useEffect(() => {
    if (!showAttachmentModal) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showAttachmentModal]);

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    const loadAttachmentPreview = async () => {
      if (!showAttachmentModal || !ticket?.id) return;
      setAttachmentPreviewLoading(true);
      setAttachmentPreviewError('');
      setAttachmentPreviewUrl('');
      setAttachmentPreviewText('');
      try {
        const mime = String(ticket?.attachment_type || '').toLowerCase();
        const isDocLike = mime === 'text/plain' ||
          mime === 'application/msword' ||
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        const headers = getAuthHeaders();

        if (isDocLike) {
          const textRes = await authenticatedFetch(
            buildApiUrl(`/api/tickets/${ticket.id}/attachment/text-preview`),
            { method: 'GET', headers }
          );
          if (textRes.ok) {
            const textData = await textRes.json();
            const previewText = String(textData?.data?.text || '').trim();
            if (previewText) {
              setAttachmentPreviewText(previewText);
            }
          }
        }

        const response = await authenticatedFetch(
          buildApiUrl(`/api/tickets/${ticket.id}/attachment`),
          { method: 'GET', headers }
        );
        if (!response.ok) {
          throw new Error('Failed to load attachment preview');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setAttachmentPreviewUrl(objectUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setAttachmentPreviewError('Unable to preview this attachment right now. Please download and verify the file.');
        }
      } finally {
        if (!cancelled) setAttachmentPreviewLoading(false);
      }
    };

    loadAttachmentPreview();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [showAttachmentModal, ticket?.id, ticket?.attachment_type]);
  
  // Chat support visibility state
  const [showChatSupport, setShowChatSupport] = useState(false);
  
  // Status change notification state
  const [showStatusNotification, setShowStatusNotification] = useState(false);
  const [statusNotificationMessage, setStatusNotificationMessage] = useState('');
  const [statusNotificationType, setStatusNotificationType] = useState('');

  // Strict status workflow UI (dropdown + confirm)
  const STATUS_LABELS = {
    open: 'Open',
    in_progress: 'Work in Progress',
    resolved: 'Resolved (Pending Confirmation)',
    escalated: 'Escalated (Under Review)',
    closed: 'Closed',
    task_completed: 'Complete my task'
  };
  const STATUS_META = {
    in_progress: { icon: '🟡', title: 'Work in Progress', desc: 'An agent is actively working on this ticket.' },
    resolved: { icon: '✅', title: 'Resolved (Pending Confirmation)', desc: 'A fix has been provided, awaiting customer confirmation.' },
    escalated: { icon: '⚠️', title: 'Escalated (Under Review)', desc: 'Raised to senior support / manager for reassignment.' },
    closed: { icon: '🔒', title: 'Closed', desc: 'This ticket is finalized and cannot be modified.' }
  };
  const ALLOWED_TRANSITIONS = {
    open: ['in_progress'],
    in_progress: ['resolved', 'escalated'],
    resolved: [],
    // Escalated tickets should still be resolvable; manager/assignee can mark resolved directly.
    escalated: ['resolved', 'in_progress'],
    closed: []
  };
  const [selectedNextStatus, setSelectedNextStatus] = useState('');
  const [showStatusConfirmModal, setShowStatusConfirmModal] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateAssignmentMode, setEscalateAssignmentMode] = useState('to_manager'); // 'auto', 'manual', 'to_manager'
  const [escalateTargetLevel, setEscalateTargetLevel] = useState('');
  const [escalateSelectedAgentId, setEscalateSelectedAgentId] = useState('');
  const [agentsAtEscalateLevel, setAgentsAtEscalateLevel] = useState([]);
  const [loadingAgentsAtEscalateLevel, setLoadingAgentsAtEscalateLevel] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateWorkDone, setEscalateWorkDone] = useState('');
  const [escalateSubmitting, setEscalateSubmitting] = useState(false);
  const [priorityOverrideValue, setPriorityOverrideValue] = useState('medium');
  const [priorityOverrideReason, setPriorityOverrideReason] = useState('');
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [etaDueAtInput, setEtaDueAtInput] = useState('');
  const [etaReasonInput, setEtaReasonInput] = useState('');
  const [etaSaving, setEtaSaving] = useState(false);
  // Customer escalation (controlled triggers)
  const [showCustomerEscalateModal, setShowCustomerEscalateModal] = useState(false);
  const [customerEscalateReason, setCustomerEscalateReason] = useState('');
  const [customerEscalateComment, setCustomerEscalateComment] = useState('');
  const [customerEscalating, setCustomerEscalating] = useState(false);
  /** Grouped tickets: per-task ETA draft { [taskId]: { due, reason } } */
  const [taskEtaDrafts, setTaskEtaDrafts] = useState({});
  const [taskEtaSavingId, setTaskEtaSavingId] = useState(null);

  useEffect(() => {
    const fetchAgentsByLevel = async (level) => {
      if (!level) return;
      setLoadingAgentsAtEscalateLevel(true);
      try {
        const response = await authenticatedFetch(buildApiUrl(`/api/agents/by-level/${level}`));
        if (!response.ok) {
          console.error(`API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.success) {
          setAgentsAtEscalateLevel(result.data || []);
        } else {
          console.error('Fetch agents failed:', result.message);
        }
      } catch (error) {
        console.error('Error fetching agents by level:', error);
      } finally {
        setLoadingAgentsAtEscalateLevel(false);
      }
    };

    if (showEscalateModal && escalateAssignmentMode === 'manual' && escalateTargetLevel) {
      fetchAgentsByLevel(escalateTargetLevel);
    }
  }, [showEscalateModal, escalateAssignmentMode, escalateTargetLevel]);
  
  useEffect(() => {
    if (ticketId) {
      fetchTicketDetails();
    }
  }, [ticketId]);

  // Fetch agents for reassign: team first (manager_id match), fallback to all support_agents
  const fetchTeamAgents = useCallback(async () => {
    if (!isManager) return;
    setAgentsLoading(true);
    const headers = getAuthHeaders();
    try {
      const teamRes = await fetch(buildApiUrl('/api/agents/team'), { headers });
      const teamData = await teamRes.json();
      const teamAgents = teamData.data || teamData.agents || [];
      if (teamAgents.length > 0) {
        setAgents(teamAgents);
        return;
      }
      const allRes = await fetch(buildApiUrl('/api/agents'), { headers });
      const allData = await allRes.json();
      const list = allData.data || allData.agents || [];
      const supportOnly = list.filter(a => ['support_agent', 'agent'].includes((a.role || '').toLowerCase()));
      setAgents(supportOnly);
    } catch {
      try {
        const allRes = await fetch(buildApiUrl('/api/agents'), { headers });
        const allData = await allRes.json();
        const list = allData.data || allData.agents || [];
        setAgents(list.filter(a => ['support_agent', 'agent'].includes((a.role || '').toLowerCase())));
      } catch {
        setAgents([]);
      }
    } finally {
      setAgentsLoading(false);
    }
  }, [isManager]);
  useEffect(() => { fetchTeamAgents(); }, [fetchTeamAgents]);

  // Fetch activity history for status/info strip
  const fetchActivity = useCallback(async () => {
    if (!ticketId) return;
    setActivityLoading(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(buildApiUrl(`/api/tickets/${ticketId}/activity`), { headers });
      const data = await res.json();
      if (data.success) setActivity(data.data || []);
    } catch { setActivity([]); }
    finally { setActivityLoading(false); }
  }, [ticketId]);
  useEffect(() => { fetchActivity(); }, [fetchActivity]);
  useEffect(() => {
    if (!ticket?.status) return;
    fetchActivity();
  }, [ticket?.status, fetchActivity]);

  const fetchTaskData = useCallback(async () => {
    if (!ticketId) return;
    setTaskLoading(true);
    try {
      const headers = getAuthHeaders();
      const [taskRes, historyRes] = await Promise.all([
        fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}`), { headers }),
        isManager
          ? fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/history`), { headers })
          : Promise.resolve(null)
      ]);

      const taskJson = await taskRes.json();
      if (taskRes.ok && taskJson.success) {
        const incoming = taskJson.data || { tasks: [], progress: { total: 0, completed: 0 } };
        setTaskData({
          tasks: incoming.tasks || [],
          progress: incoming.progress || { total: 0, completed: 0 },
          derivedOverallEta: incoming.derivedOverallEta || null,
          assignedAgents: incoming.assignedAgents || [],
          removedTasks: incoming.removedTasks || []
        });
      } else {
        setTaskData({ tasks: [], progress: { total: 0, completed: 0 }, removedTasks: [] });
      }

      if (historyRes) {
        const historyJson = await historyRes.json();
        setTaskHistory(historyRes.ok && historyJson.success ? (historyJson.data || []) : []);
      } else {
        setTaskHistory([]);
      }
    } catch (_) {
      setTaskData({ tasks: [], progress: { total: 0, completed: 0 }, removedTasks: [] });
      setTaskHistory([]);
    } finally {
      setTaskLoading(false);
    }
  }, [ticketId, isManager]);
  useEffect(() => { fetchTaskData(); }, [fetchTaskData]);

  const fetchServerTimer = useCallback(async () => {
    if (!ticketId) return;
    try {
      setServerTimerLoading(true);
      setServerTimerError('');
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/sla/timers/${ticketId}/remaining`), {
        method: 'GET',
        headers: headers
      });
      const result = await response.json();
      if (response.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
        setServerTimer(result.data[0]);
      } else {
        setServerTimer(null);
        setServerTimerError(result.message || 'No server timer');
      }
    } catch (e) {
      setServerTimer(null);
      setServerTimerError('Failed to fetch server timer');
    } finally {
      setServerTimerLoading(false);
    }
  }, [ticketId]);

  // Real-time timer updates every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Refetch server SLA timer when ticket identity or lifecycle changes (e.g. reopen)
  useEffect(() => {
    if (ticketId) {
      fetchServerTimer();
    }
  }, [ticketId, ticket?.status, ticket?.updated_at, fetchServerTimer]);

  // Format time for display
  const formatSLATime = (minutes) => {
    if (minutes < 60) {
      return `${minutes}m`;
    } else if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return `${hours}h ${mins}m`;
    } else {
      const days = Math.floor(minutes / (60 * 24));
      const hours = Math.floor((minutes % (60 * 24)) / 60);
      return `${days}d ${hours}h`;
    }
  };

  // Get ticket priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return '#dc2626';
      case 'high': return '#ea580c';
      case 'medium': return '#ca8a04';
      case 'low': return '#16a34a';
      default: return '#6b7280'; // Gray
    }
  };

  const fetchTicketDetails = async () => {
    try {
      setLoading(true);
      
      const headers = getAuthHeaders();
      dlog('🔑 Using auth headers for ticket details');
      
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}`), {
        method: 'GET',
        headers: headers
      });
      
      dlog('📡 Ticket details response status:', response.status);
      
      if (response.status === 401) {
        console.error('❌ Unauthorized - Token might be invalid or missing');
        setError('Authentication required. Please log in again.');
        setLoading(false);
        return;
      }
      
      const data = await response.json();
      
      if (data.success) {
        dlog('🔍 Ticket data received:', data.data);
        dlog('🔍 Attachment fields:', {
          attachment_name: data.data.attachment_name,
          attachment_type: data.data.attachment_type,
          attachment: data.data.attachment
        });
        setTicket(data.data);
        setTicketAttachments(Array.isArray(data.data?.attachments) ? data.data.attachments : []);
        // Customer: fetch unacknowledged notices for popup
        if (isCustomer && ticketId) {
          try {
            // NOTE: do not scope by conversationKey here; customers may not have stable assigned_to,
            // and notify popups should be shown regardless of thread grouping.
            const res = await fetch(buildApiUrl(`/api/chat/notifications/${ticketId}`), {
              method: 'GET',
              headers: getAuthHeaders()
            });
            const n = await res.json().catch(() => ({}));
            const list = Array.isArray(n?.data) ? n.data : [];
            setPendingNotices(list);
            setActiveNotice(list[0] || null);
          } catch (_) {
            setPendingNotices([]);
            setActiveNotice(null);
          }
        }

        // Fetch notify-customer updates for display in ticket detail page.
        try {
          const msgRes = await fetch(buildApiUrl(`/api/chat/notify-updates/${ticketId}`), {
            method: 'GET',
            headers: getAuthHeaders()
          });
          const msgData = await msgRes.json().catch(() => ({}));
          const rows = Array.isArray(msgData?.data) ? msgData.data : [];
          const updates = rows.map((m) => ({
            id: m.id,
            message: m.message,
            sender_name: m.sender_name,
            created_at: m.created_at,
            acknowledged_at: m.acknowledged_at || null,
            channel: m.channel
          }));
          setNotifyUpdates(updates);
        } catch (_) {
          setNotifyUpdates([]);
        }
      } else {
        setError(data.message || 'Failed to fetch ticket details');
      }
    } catch (error) {
      console.error('Error fetching ticket details:', error);
      setError('Failed to fetch ticket details');
    } finally {
      setLoading(false);
    }
  };

  const canCustomerEscalate = (() => {
    if (!isCustomer) return false;
    const statusLower = String(ticket?.status || '').toLowerCase();
    if (statusLower === 'closed' || statusLower === 'resolved') return false;
    // Escalation becomes available during active handling (typically after 2nd reopen).
    if (statusLower !== 'in_progress') return false;
    const reopenCount = Number(ticket?.reopen_count || 0);
    const lastAgentRaw = ticket?.last_agent_reply_at || null;
    const lastAgentAt = lastAgentRaw ? new Date(lastAgentRaw) : null;
    const base = lastAgentAt && !Number.isNaN(lastAgentAt.getTime())
      ? lastAgentAt.getTime()
      : new Date(ticket?.created_at || ticket?.updated_at || Date.now()).getTime();
    const inactiveHours = 24;
    const inactiveLong = Date.now() - base >= inactiveHours * 60 * 60 * 1000;
    return reopenCount >= 2 || inactiveLong;
  })();

  const handleCustomerEscalateSubmit = async () => {
    if (customerEscalating) return;
    const reason = String(customerEscalateReason || '').trim();
    if (!reason) {
      setStatusNotificationType('error');
      setStatusNotificationMessage('Please select a reason.');
      setShowStatusNotification(true);
      return;
    }
    setCustomerEscalating(true);
    try {
      const resp = await fetch(buildApiUrl(`/api/tickets/${ticketId}/customer-escalate`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, comment: String(customerEscalateComment || '').trim() })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        setStatusNotificationType('error');
        setStatusNotificationMessage(data?.message || 'Failed to escalate ticket.');
        setShowStatusNotification(true);
        return;
      }
      setShowCustomerEscalateModal(false);
      setCustomerEscalateReason('');
      setCustomerEscalateComment('');
      // Optimistic update so UI cannot drift back to in_progress.
      setTicket((prev) => ({
        ...(prev || {}),
        status: 'escalated',
        is_escalated: 1,
        escalation_level: data?.data?.escalation_level ?? prev?.escalation_level ?? 1,
        priority: data?.data?.priority ?? prev?.priority
      }));
      await fetchTicketDetails();
      setStatusNotificationType('escalated');
      setStatusNotificationMessage(`Ticket #${ticketId} escalated.`);
      setShowStatusNotification(true);
    } finally {
      setCustomerEscalating(false);
    }
  };

  const fetchSimilarRecommendations = useCallback(async ({ refresh = false } = {}) => {
    const canFetch = !isCustomer && (isManager || isAgent);
    if (!canFetch || !ticketId || isLinkedChild || String(ticket?.status || '').toLowerCase() === 'closed') {
      setSimilarRecommendations([]);
      setReferenceResolutions([]);
      setSelectedSimilarTicketIds([]);
      setRecommendationsError('');
      return;
    }
    setRecommendationsLoading(true);
    setRecommendationsError('');
    try {
      const limitQ = 'limit=200';
      const refreshQ = refresh ? 'refresh=1' : '';
      const qs = [limitQ, refreshQ].filter(Boolean).join('&');
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/similar-recommendations?${qs}`), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setSimilarRecommendations([]);
        setReferenceResolutions([]);
        setRecommendationsError(data.message || 'Failed to load recommendations.');
        return;
      }
      // Backward compatible parsing:
      // - legacy: data.data is an array of similar tickets
      // - new: data.data is { ticket_id, similar_tickets, reference_resolutions }
      if (Array.isArray(data.data)) {
        setSimilarRecommendations(data.data);
        setReferenceResolutions([]);
      } else {
        const similar = Array.isArray(data?.data?.similar_tickets) ? data.data.similar_tickets : [];
        const refs = Array.isArray(data?.data?.reference_resolutions) ? data.data.reference_resolutions : [];
        setSimilarRecommendations(similar);
        setReferenceResolutions(refs);
      }
    } catch (_) {
      setSimilarRecommendations([]);
      setReferenceResolutions([]);
      setRecommendationsError('Failed to load recommendations.');
    } finally {
      setRecommendationsLoading(false);
    }
  }, [isManager, isAgent, isCustomer, ticketId, isLinkedChild, ticket?.status]);

  const fetchLinkedInternal = useCallback(async () => {
    if (!ticketId || isCustomer) {
      setLinkGroup(null);
      setLinkedTicketsInternal([]);
      return;
    }
    setLinkedLoadingInternal(true);
    try {
      const resp = await fetch(buildApiUrl(`/api/ticket-links/ticket/${ticketId}`), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        setLinkGroup(null);
        setLinkedTicketsInternal([]);
        return;
      }
      setLinkGroup(data?.data?.group || null);
      setLinkedTicketsInternal(Array.isArray(data?.data?.linked) ? data.data.linked : []);
      if (data?.data?.group?.label && !linkGroupLabel) setLinkGroupLabel(String(data.data.group.label));
    } catch {
      setLinkGroup(null);
      setLinkedTicketsInternal([]);
    } finally {
      setLinkedLoadingInternal(false);
    }
  }, [ticketId, isCustomer, linkGroupLabel]);

  useEffect(() => {
    void fetchLinkedInternal();
  }, [fetchLinkedInternal]);

  const linkTicketInternal = useCallback(async (targetTicketId) => {
    if (!ticketId || !targetTicketId) return;
    setLinkingTicketId(Number(targetTicketId));
    try {
      await fetch(buildApiUrl(`/api/ticket-links/ticket/${ticketId}/link`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ticket_id: Number(targetTicketId), label: linkGroupLabel || undefined })
      });
      // Optimistically remove from Similar tickets list to avoid re-showing already-linked tickets.
      setSimilarRecommendations((prev) => (Array.isArray(prev) ? prev.filter((r) => Number(r?.id) !== Number(targetTicketId)) : prev));
    } finally {
      setLinkingTicketId(null);
      fetchLinkedInternal();
    }
  }, [ticketId, linkGroupLabel, fetchLinkedInternal]);

  const unlinkTicketInternal = useCallback(async (targetTicketId) => {
    if (!ticketId || !targetTicketId) return;
    setUnlinkingTicketId(Number(targetTicketId));
    try {
      await fetch(buildApiUrl(`/api/ticket-links/ticket/${ticketId}/unlink`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ticket_id: Number(targetTicketId) })
      });
    } finally {
      setUnlinkingTicketId(null);
      fetchLinkedInternal();
    }
  }, [ticketId, fetchLinkedInternal]);

  const shareNoteToLinked = useCallback(async () => {
    const groupId = Number(linkGroup?.id || 0);
    const note = String(shareNoteText || '').trim();
    if (!groupId || !note) return;
    try {
      await fetch(buildApiUrl(`/api/ticket-links/groups/${groupId}/share-note`), {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ note })
      });
      setShareNoteText('');
      setSharedNotesLog((prev) => ([
        { note, created_at: new Date().toISOString() },
        ...(Array.isArray(prev) ? prev : [])
      ]));
      showInlineNotification('Note shared to linked tickets.', 'success', 2500);
    } catch {
      showInlineNotification('Failed to share note.', 'error', 2500);
    }
  }, [linkGroup?.id, shareNoteText]);

  useEffect(() => {
    // Keep notes list scoped to the current linked group/ticket view.
    setSharedNotesLog([]);
  }, [ticketId, linkGroup?.id]);

  // bulkCloseLinked removed

  const toDatetimeLocalInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  useEffect(() => {
    if (!ticket) return;
    setEtaDueAtInput(toDatetimeLocalInput(ticket.eta_due_at));
    setEtaReasonInput(ticket.eta_reason || '');
  }, [ticket?.id, ticket?.eta_due_at, ticket?.eta_reason]);

  useEffect(() => {
    const details = ticket?.resolution_details || {};
    setResolutionForm({
      resolution_summary: details.resolution_summary || '',
      internal_steps: details.internal_steps || '',
      root_cause: details.root_cause || '',
      fix_type: details.fix_type || RESOLUTION_FIX_TYPE_OPTIONS[0],
      reference_data: details.reference_data || ''
    });
  }, [ticket?.id, ticket?.resolution_details]);

  useEffect(() => {
    if (!showEscalateModal) return;
    if (!allowedEscalationLevels.length) {
      setEscalateTargetLevel('');
      return;
    }
    if (!allowedEscalationLevels.includes(escalateTargetLevel)) {
      setEscalateTargetLevel(allowedEscalationLevels[0]);
    }
  }, [showEscalateModal, allowedEscalationLevels, escalateTargetLevel]);

  useEffect(() => {
    const tasks = taskData?.tasks;
    if (!Array.isArray(tasks)) return;
    const next = {};
    for (const t of tasks) {
      if (!t?.id) continue;
      next[t.id] = {
        due: toDatetimeLocalInput(t.sla_due_at),
        reason: t.task_eta_reason || ''
      };
    }
    setTaskEtaDrafts(next);
  }, [taskData?.tasks]);

  const fetchAttachmentAnalysis = useCallback(async () => {
    if (!ticketId || isCustomer) return;
    setAttachmentAnalysisError('');
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/attachment/analysis`), {
        method: 'GET',
        headers
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        return;
      }
      setAttachmentAnalysis(data.data || null);
    } catch (_) {
      // Keep page functional even if analysis fetch fails
    }
  }, [ticketId, isCustomer]);

  const fetchAttachmentAnalysisForAttachmentId = useCallback(async (attachmentId) => {
    const aid = Number(attachmentId || 0);
    if (!ticketId || !aid || isCustomer) return;
    setAttachmentAnalysisErrorById((prev) => ({ ...prev, [aid]: '' }));
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/attachments/${aid}/analysis`), {
        method: 'GET',
        headers
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) return;
      setAttachmentAnalysesById((prev) => ({ ...prev, [aid]: data.data || null }));
    } catch (_) {
      // ignore
    }
  }, [ticketId, isCustomer]);

  useEffect(() => {
    if (!ticket?.attachment_name || isCustomer) {
      setAttachmentAnalysis(null);
      setAttachmentAnalysisError('');
      return;
    }
    fetchAttachmentAnalysis();
  }, [ticket?.attachment_name, ticket?.attachment_type, isCustomer, fetchAttachmentAnalysis]);

  useEffect(() => {
    if (isCustomer) return;
    const list = Array.isArray(ticketAttachments) ? ticketAttachments : [];
    if (!list.length) return;
    for (const a of list) {
      const aid = Number(a?.id || 0);
      if (!aid) continue;
      // Fetch only if we don't already have a value cached for this attachment id.
      if (Object.prototype.hasOwnProperty.call(attachmentAnalysesById || {}, aid)) continue;
      fetchAttachmentAnalysisForAttachmentId(aid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only auto-fetch on attachment list changes
  }, [ticketAttachments, isCustomer, fetchAttachmentAnalysisForAttachmentId]);

  const handleAnalyzeAttachment = async (force = false) => {
    if (!ticketId || isCustomer) return;
    setAttachmentAnalysisLoading(true);
    setAttachmentAnalysisError('');
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/attachment/analyze`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ force })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setAttachmentAnalysisError(data.message || 'This attachment could not be analyzed.');
        return;
      }
      setAttachmentAnalysis(data.data || null);
    } catch (_) {
      setAttachmentAnalysisError('This attachment could not be analyzed.');
    } finally {
      setAttachmentAnalysisLoading(false);
    }
  };

  const handleAnalyzeAttachmentById = async (attachmentId, force = false) => {
    const aid = Number(attachmentId || 0);
    if (!ticketId || !aid || isCustomer) return;
    setAttachmentAnalysisLoadingById((prev) => ({ ...prev, [aid]: true }));
    setAttachmentAnalysisErrorById((prev) => ({ ...prev, [aid]: '' }));
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/attachments/${aid}/analyze`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ force })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setAttachmentAnalysisErrorById((prev) => ({
          ...prev,
          [aid]: data?.message || 'This attachment could not be analyzed.'
        }));
        return;
      }
      setAttachmentAnalysesById((prev) => ({ ...prev, [aid]: data.data || null }));
    } catch (_) {
      setAttachmentAnalysisErrorById((prev) => ({ ...prev, [aid]: 'This attachment could not be analyzed.' }));
    } finally {
      setAttachmentAnalysisLoadingById((prev) => ({ ...prev, [aid]: false }));
    }
  };

  useEffect(() => {
    const p = String(ticket?.priority || 'medium').toLowerCase();
    if (['low', 'medium', 'high', 'urgent'].includes(p)) {
      setPriorityOverrideValue(p);
    }
  }, [ticket?.priority]);

  useEffect(() => {
    if (!location.state?.groupedCreated) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(buildApiUrl(`/api/tickets/${ticketId}`), { headers: getAuthHeaders() });
        const data = await res.json();
        if (!cancelled && data.success) setTicket(data.data);
        await fetchTaskData();
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        navigate(location.pathname, { replace: true, state: {} });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh once after grouping flow
  }, [location.state?.groupedCreated, ticketId]);

  useEffect(() => {
    if (!ticket?.id) return;
    fetchSimilarRecommendations();
  }, [ticket?.id, fetchSimilarRecommendations]);

  // If we navigated here specifically to view a referenced resolution, auto-open the Resolution modal.
  useEffect(() => {
    if (!location.state?.openResolution) return;
    if (!ticket?.id) return;
    if (isCustomer) return;
    (async () => {
      try {
        await openResolutionModal('view');
      } catch (_) {}
      try {
        navigate(location.pathname, { replace: true, state: {} });
      } catch (_) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openResolution, ticket?.id, isCustomer]);

  const openReferenceResolutionPreview = useCallback(async (refTicketId) => {
    const id = Number(refTicketId || 0);
    if (!id || isCustomer) return;
    setReferenceResolutionPreviewLoadingTicketId(id);
    setReferenceResolutionPreviewError('');
    setReferenceResolutionPreviewTicket(null);
    try {
      const res = await fetch(buildApiUrl(`/api/tickets/${id}`), { method: 'GET', headers: getAuthHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setReferenceResolutionPreviewError(data?.message || 'Failed to load resolution.');
        return;
      }
      const t = data?.data || {};
      setReferenceResolutionPreviewTicket({
        ticketId: id,
        title: t?.issue_title || '',
        resolution_details: t?.resolution_details || null
      });
      setShowReferenceResolutionPreview(true);
    } catch {
      setReferenceResolutionPreviewError('Failed to load resolution.');
    } finally {
      setReferenceResolutionPreviewLoadingTicketId(null);
    }
  }, [isCustomer]);

  const openResolutionModal = async (mode = 'view') => {
    // Managers often open resolution after an agent updates it in another session/tab.
    // Refresh ticket payload before showing the modal so the latest resolution is visible.
    try {
      if (!isCustomer) {
        await fetchTicketDetails();
      }
    } catch (_) {}
    setResolutionMode(mode);
    setShowResolutionModal(true);
  };

  const handleResolutionFormChange = (field, value) => {
    setResolutionForm((prev) => ({ ...prev, [field]: value }));
  };

  const getResolutionPayload = () => ({
    resolution_summary: String(resolutionForm.resolution_summary || '').trim(),
    internal_steps: String(resolutionForm.internal_steps || '').trim(),
    root_cause: String(resolutionForm.root_cause || '').trim(),
    fix_type: String(resolutionForm.fix_type || '').trim(),
    reference_data: String(resolutionForm.reference_data || '').trim()
  });

  const validateResolutionForm = () => {
    const payload = getResolutionPayload();
    if (payload.resolution_summary.length < 5) {
      return 'Resolution summary is required (minimum 5 characters).';
    }
    if (payload.internal_steps.length < 5) {
      return 'Internal resolution steps are required (minimum 5 characters).';
    }
    if (!RESOLUTION_FIX_TYPE_OPTIONS.includes(payload.fix_type)) {
      return 'Please select a valid fix type.';
    }
    if (payload.reference_data.length > 500) {
      return 'Reference must be 500 characters or less.';
    }
    return '';
  };

  const saveResolutionDetails = async () => {
    if (childWorkflowLocked) {
      showInlineNotification(
        `This ticket is linked to parent #${ticket?.parent_ticket_id}. Resolution is managed on the parent ticket.`,
        'error',
        3500
      );
      return false;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(
        `This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Resolution is managed on the primary ticket.`,
        'error',
        3500
      );
      return false;
    }
    if (!canEditResolution) {
      showInlineNotification('You do not have permission to update resolution for this ticket.', 'error', 3500);
      return false;
    }
    const validationError = validateResolutionForm();
    if (validationError) {
      showInlineNotification(validationError, 'error', 3500);
      return false;
    }
    setResolutionSaving(true);
    try {
      const fd = new FormData();
      fd.append('resolution_details', JSON.stringify(getResolutionPayload()));
      if (resolutionAttachment) fd.append('resolution_attachment', resolutionAttachment);
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/resolution-details`), {
        method: 'PUT',
        headers: getAuthHeadersFormData(),
        body: fd
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to save resolution details.', 'error', 4000);
        return false;
      }
      await fetchTicketDetails();
      await fetchActivity();
      showInlineNotification('Resolution details saved.', 'in_progress', 2200);
      return true;
    } catch (error) {
      console.error('Error saving resolution details:', error);
      showInlineNotification('Failed to save resolution details.', 'error', 4000);
      return false;
    } finally {
      setResolutionSaving(false);
    }
  };

  const handleResolve = async () => {
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Resolve from the parent ticket.`, 'error');
      return;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(`This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Resolve from the primary ticket.`, 'error');
      return;
    }
    openResolutionModal('resolve');
  };

  const handleNotifyCustomerSubmit = async () => {
    const msg = String(notifyMessage || '').trim();
    const ref = String(notifyReference || '').trim();
    if (!msg) {
      showInlineNotification('Message is required to notify the customer.', 'error', 3000);
      return;
    }
    setNotifySending(true);
    try {
      const fullMessage = ref ? `${msg}\n\nReference: ${ref}` : msg;
      const response = await fetch(buildApiUrl('/api/chat/messages'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ticketId,
          senderType: 'agent',
          senderId: user?.id || user?.userId || null,
          senderName: user?.name || user?.email || 'Support',
          message: fullMessage,
          messageType: 'text',
          conversationKey: buildConversationKeyAgentUser(),
          requiresAck: true
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to notify customer.', 'error', 4000);
        return;
      }
      setShowNotifyModal(false);
      setNotifyMessage('');
      setNotifyReference('');
      // Show the update immediately + refresh from server (for requires_ack/audit fields).
      setNotifyUpdates((prev) => ([
        ...(Array.isArray(prev) ? prev : []),
        {
          id: data?.data?.[0]?.id || data?.data?.id || `local-${Date.now()}`,
          message: fullMessage,
          sender_name: user?.name || user?.email || 'Support',
          created_at: new Date().toISOString(),
          acknowledged_at: null
        }
      ]));
      await fetchTicketDetails();
      await fetchActivity();
      showInlineNotification('Customer notified.', 'in_progress', 2200);
    } catch (e) {
      showInlineNotification('Failed to notify customer.', 'error', 4000);
    } finally {
      setNotifySending(false);
    }
  };

  const acknowledgeActiveNotice = async () => {
    if (!activeNotice?.id) return;
    setAckSubmitting(true);
    try {
      const res = await fetch(buildApiUrl(`/api/chat/messages/${activeNotice.id}/ack`), {
        method: 'PUT',
        headers: getAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to confirm notification.', 'error', 3500);
        return;
      }
      const rest = pendingNotices.filter((m) => Number(m?.id) !== Number(activeNotice.id));
      setPendingNotices(rest);
      setActiveNotice(rest[0] || null);
    } catch (_) {
      showInlineNotification('Failed to confirm notification.', 'error', 3500);
    } finally {
      setAckSubmitting(false);
    }
  };

  const handleEscalate = async () => {
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Escalate from the parent ticket.`, 'error');
      return;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(`This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Escalate from the primary ticket.`, 'error');
      return;
    }
    if (!hasGroupedTasks) {
      if (!canOpenEscalationModal) {
        showInlineNotification(`No valid escalation path from ${currentTicketLevel}.`, 'error');
        return;
      }
      setEscalateReason('');
      setEscalateTargetLevel(isManager ? (allowedEscalationLevels[0] || '') : 'MANAGER');
      setShowEscalateModal(true);
      return;
    }

    try {
      const headers = getAuthHeaders();

      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ status: 'escalated' })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        await fetchTicketDetails();
        await fetchActivity();
        await fetchTaskData();
        showStatusChangeNotification(
          data.updated_scope === 'my_assignment' ? 'assignment_escalated' : 'escalated'
        );
      } else {
        showInlineNotification(data.message || 'Failed to escalate ticket. Please try again.', 'error', 4000);
      }
    } catch (error) {
      console.error('Error escalating ticket:', error);
      showInlineNotification('Error escalating ticket. Please try again.', 'error', 4000);
    }
  };

  const handleSubmitEscalation = async () => {
    if (!escalateTargetLevel) {
      showInlineNotification('Please select escalation level.', 'error');
      return;
    }
    if (!escalateReason || escalateReason.trim().length < 3) {
      showInlineNotification('Escalation reason is required (min 3 characters).', 'error');
      return;
    }

    if (!escalateReason.trim()) {
      showInlineNotification('Please provide a reason for escalation.', 'error', 4000);
      return;
    }
    // Removed workDone validation as requested
    if (escalateAssignmentMode === 'manual' && !escalateSelectedAgentId) {
      showInlineNotification('Please select an agent for manual assignment.', 'error', 4000);
      return;
    }
    if ((escalateAssignmentMode === 'manual' || escalateAssignmentMode === 'auto') && !escalateTargetLevel) {
      showInlineNotification('Please select a target level.', 'error', 4000);
      return;
    }

    setEscalateSubmitting(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/escalate`), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target_level: escalateTargetLevel,
          assignment_mode: escalateAssignmentMode,
          assigned_agent_id: escalateSelectedAgentId,
          reason: escalateReason.trim(),
          work_done: escalateWorkDone.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to escalate ticket.', 'error', 4000);
        setEscalateSubmitting(false);
        return;
      }
      setShowEscalateModal(false);
      setEscalateReason('');
      setEscalateWorkDone('');
      
      if (!isManager && escalateTargetLevel !== 'MANAGER') {
        showInlineNotification('Escalation request submitted for manager approval.', 'escalated');
        setEscalateSubmitting(false);
        await fetchTicketDetails();
        return;
      } else {
        const movedToLevel = String(data?.data?.to_level || escalateTargetLevel || '').toUpperCase();
        if (movedToLevel === 'MANAGER') {
          showInlineNotification('Ticket escalated to manager successfully.', 'escalated');
        } else {
          showInlineNotification(`Ticket escalated to ${movedToLevel} successfully.`, 'escalated');
        }
      }

      setEscalateSubmitting(false);

      await fetchTicketDetails();
      await fetchActivity();
      await fetchTaskData();
      showStatusChangeNotification('escalated');
    } catch (error) {
      console.error('Error escalating ticket:', error);
      showInlineNotification('Error escalating ticket. Please try again.', 'error', 4000);
    } finally {
      setEscalateSubmitting(false);
    }
  };

  const handleInProgress = async () => {
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Change status from the parent ticket.`, 'error');
      return;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(`This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Change status from the primary ticket.`, 'error');
      return;
    }
    try {
      const headers = getAuthHeaders();

      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ status: 'in_progress' })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        await fetchTicketDetails();
        await fetchActivity();
        await fetchTaskData();
        showStatusChangeNotification(
          data.updated_scope === 'my_assignment' ? 'assignment_in_progress' : 'in_progress'
        );
      } else {
        alert(data.message || 'Failed to move ticket to in progress. Please try again.');
      }
    } catch (error) {
      console.error('Error moving ticket to in progress:', error);
      alert('Error moving ticket to in progress. Please try again.');
    }
  };

  const handleReopen = async () => {
    try {
      const headers = getAuthHeaders();
      
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: headers,
        // Reopen must detach any linked workflow and restart as a standalone in_progress ticket.
        body: JSON.stringify({ status: 'reopened', reopen: true })
      });

      if (response.ok) {
        console.log('✅ Ticket reopened successfully');
        await fetchTicketDetails();
        await fetchActivity();
        await fetchTaskData();
        await fetchServerTimer();

        // Show status change notification
        showStatusChangeNotification('reopened');
      } else {
        console.error('Failed to reopen ticket');
        alert('Failed to reopen ticket. Please try again.');
      }
    } catch (error) {
      console.error('Error reopening ticket:', error);
      alert('Error reopening ticket. Please try again.');
    }
  };

  // Customer reopen (uses dedicated backend endpoint)
  const handleCustomerReopen = async () => {
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/reopen`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ reason: String(customerReopenReason || '').trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setStatusNotificationType('error');
        setStatusNotificationMessage(data?.message || 'Failed to reopen ticket.');
        setShowStatusNotification(true);
        return;
      }
      setShowCustomerReopenModal(false);
      setCustomerReopenReason('');
      await fetchTicketDetails();
      await fetchActivity();
      await fetchTaskData();
      await fetchServerTimer();
      showStatusChangeNotification('reopened');
    } catch (_) {
      setStatusNotificationType('error');
      setStatusNotificationMessage('Failed to reopen ticket.');
      setShowStatusNotification(true);
    }
  };

  // Function to show status change notification
  const showStatusChangeNotification = (status) => {
    let message = '';
    let type = '';
    
    switch (status) {
      case 'assignment_in_progress':
        message = 'Your assignment is now in progress';
        type = 'in_progress';
        break;
      case 'assignment_escalated':
        message = 'Your assignment was escalated';
        type = 'escalated';
        break;
      case 'in_progress':
        message = 'Ticket In Progress';
        type = 'in_progress';
        break;
      case 'closed':
        message = 'Ticket Closed';
        type = 'closed';
        break;
      case 'resolved':
        message = 'Ticket Resolved (Pending Confirmation)';
        type = 'resolved';
        break;
      case 'escalated':
        message = 'Ticket Escalated';
        type = 'escalated';
        break;
      case 'reopened':
        message = 'Ticket Reopened';
        type = 'reopened';
        break;
      case 'task_completed':
        message = 'Task completed successfully';
        type = 'task_completed';
        break;
      default:
        message = `Ticket ${status}`;
        type = status;
    }
    
    setStatusNotificationMessage(message);
    setStatusNotificationType(type);
    setShowStatusNotification(true);
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowStatusNotification(false);
      setStatusNotificationMessage('');
      setStatusNotificationType('');
    }, 3000);
  };

  const getNormalizedWorkflowStatus = (raw) => {
    const s = String(raw || '').toLowerCase();
    if (s === 'new') return 'open';
    if (s === 'reopened') return 'in_progress';
    return s || 'open';
  };

  const getStatusLabel = (statusKey) => STATUS_LABELS[statusKey] || String(statusKey || '').replace(/_/g, ' ');

  const getAgentTaskLabel = (value, currentAssignStatus) => {
    if (value === 'in_progress' && currentAssignStatus === 'escalated') return 'Resume work';
    if (value === 'in_progress' && currentAssignStatus === 'new') return 'Start work';
    if (value === 'escalated') return 'Escalate';
    return getStatusLabel(value);
  };

  const buildNextStatusOptions = (currentStatusKey) => {
    const base = Array.isArray(ALLOWED_TRANSITIONS?.[currentStatusKey]) ? ALLOWED_TRANSITIONS[currentStatusKey] : [];

    // role-based filtering
    if (isCustomer) return [];
    if (isAgent && !isManager) {
      if (currentStatusKey === 'resolved') return [];
      // Grouped tickets: agent cannot resolve; flow is in_progress -> escalate or complete task
      if (hasGroupedTasks) {
        if (currentStatusKey === 'open' || currentStatusKey === 'new') return ['in_progress'];
        if (currentStatusKey === 'in_progress') return ['escalated', 'task_completed'];
        if (currentStatusKey === 'escalated') return ['in_progress'];
        return [];
      }
      return base.filter((s) => s !== 'closed');
    }

    // manager: Escalated tickets primary action should be "Resolved" only.
    if (currentStatusKey === 'escalated') {
      return base.filter((s) => s === 'resolved');
    }
    // manager: never allow moving ticket to in_progress from this control
    return base.filter((s) => s !== 'in_progress');
  };

  const getEmptyStatusMessage = (currentStatusKey) => {
    if (currentStatusKey === 'closed') return 'Ticket Closed';
    if (currentStatusKey === 'resolved') return 'Waiting for customer confirmation.';
    if (currentStatusKey === 'escalated') return isAgent ? 'This ticket is under review by manager.' : 'This ticket is under review.';
    return isAgent ? 'No actions available. Awaiting manager action.' : 'No transitions are available.';
  };

  const submitStatusTransition = async ({ nextStatus }) => {
    const ns = String(nextStatus || '').trim();
    if (!ns || statusUpdating) return;
    if (ns === 'escalated') {
      setShowStatusConfirmModal(false);
      await handleEscalate();
      return;
    }
    // Grouped ticket agent: complete my task is handled separately
    if (ns === 'task_completed') {
      setShowStatusConfirmModal(false);
      await completeMyGroupedTasks();
      return;
    }
    // Keep existing "resolve requires structured resolution" workflow safe.
    if (ns === 'resolved' && !hasResolutionDetails) {
      if (isManager) {
        setShowStatusConfirmModal(false);
        showInlineNotification(
          'Resolution steps are not updated yet. Ask the assigned agent to complete resolution details before marking this ticket as resolved.',
          'error',
          4500
        );
      } else {
        showInlineNotification('Capture resolution details before marking as resolved.', 'error', 3500);
        openResolutionModal('resolve');
      }
      return;
    }
    setStatusUpdating(true);
    try {
      const resp = await fetch(buildApiUrl(`/api/tickets/${ticketId}/status`), {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: ns })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.success) {
        showInlineNotification(data?.message || 'Failed to update status.', 'error', 4000);
        return;
      }
      setSelectedNextStatus('');
      setShowStatusConfirmModal(false);
      await fetchTicketDetails();
      await fetchActivity();
      await fetchTaskData();
      showStatusChangeNotification(ns);
    } catch (e) {
      showInlineNotification('Failed to update status.', 'error', 4000);
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAgentTaskAction = async (action) => {
    if (!myAssignment?.id || statusUpdating) return;
    setStatusUpdating(true);
    try {
      const body = {};
      if (action === 'in_progress') {
        body.assignment_status = 'in_progress';
        body.status = 'in_progress';
      } else if (action === 'escalated') {
        body.assignment_status = 'escalated';
      } else {
        return;
      }
      const res = await fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/${myAssignment.id}`), {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await fetchTaskData();
        showStatusChangeNotification(action);
      } else {
        showInlineNotification(data.message || 'Failed to update task.', 'error', 4000);
      }
    } catch (e) {
      showInlineNotification('Failed to update task.', 'error', 4000);
    } finally {
      setStatusUpdating(false);
      setSelectedNextStatus('');
    }
  };

  const showInlineNotification = (message, type = 'in_progress', autoHideMs = 3000) => {
    setStatusNotificationMessage(message);
    setStatusNotificationType(type);
    setShowStatusNotification(true);
    if (autoHideMs > 0) {
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, autoHideMs);
    }
  };

  // Function to close the status notification
  const closeStatusNotification = () => {
    setShowStatusNotification(false);
    setStatusNotificationMessage('');
    setStatusNotificationType('');
  };

  const handleConfirmClose = async () => {
    try {
      if (ticket?.status === 'closed') return;

      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/close`), {
        method: 'PUT',
        headers
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setShowCloseConfirmModal(false);
        await fetchTicketDetails();
        showStatusChangeNotification('closed');
      } else {
        alert(data.message || 'Failed to close ticket');
      }
    } catch (error) {
      console.error('Error confirming ticket close:', error);
      alert('Error closing ticket. Please try again.');
    }
  };

  const submitCustomerResolutionConfirmation = async () => {
    if (!isCustomer || !ticketId) return;
    if (ticket?.status !== 'resolved') return;
    if (customerResolutionAnswer !== 'yes' && customerResolutionAnswer !== 'no') return;
    if (customerResolutionAnswer === 'no' && String(customerRejectionReason || '').trim().length < 3) return;

    setCustomerConfirmSubmitting(true);
    try {
      const headers = getAuthHeaders();

      if (customerResolutionAnswer === 'yes') {
        const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/close`), {
          method: 'PUT',
          headers
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.success) {
          setShowCustomerResolutionConfirm(false);
          setCustomerResolutionAnswer('');
          setCustomerRejectionReason('');
          await fetchTicketDetails();
          await fetchActivity();
          await fetchTaskData();
          await fetchServerTimer();
          showStatusChangeNotification('closed');
        } else {
          alert(data.message || 'Failed to close ticket');
        }
        return;
      }

      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/reject-resolution`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ reason: String(customerRejectionReason || '').trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setShowCustomerResolutionConfirm(false);
        setCustomerResolutionAnswer('');
        setCustomerRejectionReason('');
        await fetchTicketDetails();
        await fetchActivity();
        await fetchTaskData();
        await fetchServerTimer();
        showStatusChangeNotification('reopened');
      } else {
        alert(data.message || 'Failed to reopen ticket');
      }
    } catch (e) {
      console.error('Error submitting resolution confirmation:', e);
      alert('Error submitting. Please try again.');
    } finally {
      setCustomerConfirmSubmitting(false);
    }
  };

  // Auto-show customer confirmation popup when ticket is resolved (pending confirmation).
  useEffect(() => {
    if (!isCustomer) return;
    if (!ticket?.id) return;

    if (ticket.status !== 'resolved') {
      if (showCustomerResolutionConfirm) {
        setShowCustomerResolutionConfirm(false);
        setCustomerResolutionAnswer('');
        setCustomerRejectionReason('');
      }
      if (customerResolutionConfirmDeferred) {
        setCustomerResolutionConfirmDeferred(false);
      }
      return;
    }
    if (customerResolutionConfirmDeferred) return;
    if (!showCustomerResolutionConfirm) {
      setShowCustomerResolutionConfirm(true);
    }
  }, [
    isCustomer,
    ticket?.id,
    ticket?.status,
    showCustomerResolutionConfirm,
    customerResolutionConfirmDeferred
  ]);

  // Assign equally when unassigned
  const handleAssignEqually = async () => {
    if (!isManager) {
      showInlineNotification('Only managers can assign tickets.', 'error');
      return;
    }
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Assignment is managed through the parent.`, 'error');
      return;
    }
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/assign-equally`), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({})
      });
      const data = await response.json();
      if (response.ok && data.success) {
        const assignedName = (data.data && (data.data.assigned_to_name || data.data.agent_name)) || 'agent';
        try {
          alert(`Assigned to ${assignedName}`);
        } catch (e) {
          // no-op if alert not available
        }
        await fetchTicketDetails();
      } else {
        alert(data.message || 'Failed to assign ticket');
      }
    } catch (error) {
      console.error('Error assigning ticket:', error);
      alert('Error assigning ticket');
    }
  };

  // Manager Override: Reassign ticket to different agent
  const handleReassign = async () => {
    if (!isManager) {
      showInlineNotification('Only managers can reassign tickets.', 'error');
      return;
    }
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Reassign from the parent ticket.`, 'error');
      return;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(`This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Reassign from the primary ticket.`, 'error');
      return;
    }
    if (!reassignAgentId) return;
    setReassigning(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch(buildApiUrl(`/api/tickets/${ticketId}/reassign`), {
        method: 'POST',
        headers,
        body: JSON.stringify({ agent_id: Number(reassignAgentId) })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const agentName = data.data?.assigned_to_name || agents.find(a => a.id === Number(reassignAgentId))?.name || 'agent';
        setReassignAgentId('');
        await fetchTicketDetails();
        fetchActivity();
        showReassignNotification(agentName);
      } else {
        alert(data.message || 'Failed to reassign ticket');
      }
    } catch (err) {
      console.error('Error reassigning:', err);
      alert('Error reassigning ticket');
    } finally {
      setReassigning(false);
    }
  };

  const toggleSimilarSelection = (targetId) => {
    const numericId = Number(targetId);
    if (!numericId) return;
    setSelectedSimilarTicketIds((prev) =>
      prev.includes(numericId) ? prev.filter((id) => id !== numericId) : [...prev, numericId]
    );
  };

  const handleCombineSimilarTickets = async () => {
    if (!isManager || !ticketId) return;
    if (!selectedSimilarTicketIds.length) {
      showInlineNotification('Select at least one recommended ticket to link.', 'error');
      return;
    }
    setCombineSubmitting(true);
    try {
      const sendLinkRequest = async (confirmResolutionReuse = false) =>
        fetch(buildApiUrl(`/api/tickets/${ticketId}/link-children`), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            child_ticket_ids: selectedSimilarTicketIds,
            reason: combineReason.trim(),
            confirm_resolution_reuse: confirmResolutionReuse
          })
        });

      let response = await sendLinkRequest(false);
      let data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        if (response.status === 409 && data?.data?.requires_resolution_confirmation && data?.data?.resolution_summary) {
          setResolutionReuseModal({ summary: String(data.data.resolution_summary || '').trim() });
          return;
        }
      }
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to combine linked tickets.', 'error', 4000);
        return;
      }
      setSelectedSimilarTicketIds([]);
      setCombineReason('');
      await fetchTicketDetails();
      await fetchActivity();
      await fetchSimilarRecommendations();
      showInlineNotification('Similar tickets linked to this parent ticket.', 'in_progress');
    } catch (error) {
      console.error('Error combining similar tickets:', error);
      showInlineNotification('Failed to combine linked tickets.', 'error', 4000);
    } finally {
      setCombineSubmitting(false);
    }
  };

  const confirmResolutionReuseAndCombine = async () => {
    if (!resolutionReuseModal?.summary) return;
    if (!isManager || !ticketId) return;
    setCombineSubmitting(true);
    try {
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/link-children`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          child_ticket_ids: selectedSimilarTicketIds,
          reason: combineReason.trim(),
          confirm_resolution_reuse: true
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to combine linked tickets.', 'error', 4000);
        return;
      }
      setResolutionReuseModal(null);
      setSelectedSimilarTicketIds([]);
      setCombineReason('');
      await fetchTicketDetails();
      await fetchActivity();
      await fetchSimilarRecommendations();
      showInlineNotification('Similar tickets linked to this parent ticket.', 'in_progress');
    } catch (e) {
      showInlineNotification('Failed to combine linked tickets.', 'error', 4000);
    } finally {
      setCombineSubmitting(false);
    }
  };

  const handleUnlinkChildTicket = async (childId) => {
    if (!isManager || !ticketId || !childId) return;
    setUnlinkingChildId(childId);
    try {
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/unlink-child/${childId}`), {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        showInlineNotification(data.message || 'Failed to unlink child ticket.', 'error', 4000);
        return;
      }
      await fetchTicketDetails();
      await fetchActivity();
      await fetchSimilarRecommendations();
      showInlineNotification(`Ticket #${childId} was unlinked.`, 'in_progress');
    } catch (error) {
      console.error('Error unlinking child ticket:', error);
      showInlineNotification('Failed to unlink child ticket.', 'error', 4000);
    } finally {
      setUnlinkingChildId(null);
    }
  };

  const handlePriorityOverrideSave = async () => {
    if (!isManager || !ticketId) return;
    if (!priorityOverrideValue) return;
    setPrioritySaving(true);
    try {
      const headers = getAuthHeaders();
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/priority`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          priority: priorityOverrideValue,
          overrideReason: priorityOverrideReason
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        alert(data.message || 'Failed to update priority');
        return;
      }
      await fetchTicketDetails();
      if (isManager) fetchActivity();
      setPriorityOverrideReason('');
      setStatusNotificationMessage('Ticket priority updated');
      setStatusNotificationType('in_progress');
      setShowStatusNotification(true);
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, 2500);
    } catch (error) {
      console.error('Error updating priority:', error);
      alert('Failed to update priority');
    } finally {
      setPrioritySaving(false);
    }
  };

  const handleUpdateEta = async () => {
    if (childWorkflowLocked) {
      showInlineNotification(`This ticket is linked to parent #${ticket.parent_ticket_id}. Update ETA on the parent ticket.`, 'error');
      return;
    }
    if (linkedWorkflowLocked) {
      showInlineNotification(`This ticket is linked under primary ticket #${linkedPrimaryTicketId}. Update ETA from the primary ticket.`, 'error');
      return;
    }
    if (!etaUpdateAllowed) {
      alert('Only agents can update ETA.');
      return;
    }
    if (!ticketId || !etaDueAtInput || !etaReasonInput.trim()) {
      alert('ETA date/time and reason are required.');
      return;
    }
    setEtaSaving(true);
    try {
      const headers = getAuthHeaders();
      const etaDate = new Date(etaDueAtInput);
      if (!Number.isFinite(etaDate.getTime())) {
        alert('Please enter a valid ETA date/time.');
        return;
      }
      const response = await fetch(buildApiUrl(`/api/tickets/${ticketId}/eta`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          etaDueAt: etaDate.toISOString(),
          reason: etaReasonInput.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        alert(data.message || 'Failed to update ETA');
        return;
      }
      await fetchTicketDetails();
      await fetchActivity();
      setStatusNotificationMessage('Ticket ETA updated');
      setStatusNotificationType('in_progress');
      setShowStatusNotification(true);
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, 2500);
    } catch (error) {
      console.error('Error updating ETA:', error);
      alert('Failed to update ETA');
    } finally {
      setEtaSaving(false);
    }
  };

  const updateTaskEtaDraft = (taskId, field, value) => {
    setTaskEtaDrafts((prev) => {
      const cur = prev[taskId] || { due: '', reason: '' };
      return { ...prev, [taskId]: { ...cur, [field]: value } };
    });
  };

  const handleSaveGroupedTaskEta = async (taskId, { manager = false } = {}) => {
    const draft = taskEtaDrafts[taskId];
    const due = draft?.due;
    const reason = (draft?.reason || '').trim();
    if (!due) {
      alert('Please choose a task ETA date and time.');
      return;
    }
    if (!manager && (!reason || reason.length < 3)) {
      alert('Reason is required (min 3 characters) when updating task ETA.');
      return;
    }
    setTaskEtaSavingId(taskId);
    try {
      const body = {
        sla_due_at: new Date(due).toISOString(),
        ...(reason ? { task_eta_reason: reason } : {})
      };
      const res = await fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/${taskId}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to update task ETA');
        return;
      }
      await fetchTaskData();
      await fetchTicketDetails();
      if (isManager) fetchActivity();
      setStatusNotificationMessage('Task ETA saved');
      setStatusNotificationType('in_progress');
      setShowStatusNotification(true);
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, 2500);
    } catch (_) {
      alert('Failed to update task ETA');
    } finally {
      setTaskEtaSavingId(null);
    }
  };

  const showReassignNotification = (agentName) => {
    setStatusNotificationMessage(`Ticket has been reassigned to ${agentName}`);
    setStatusNotificationType('reassign');
    setShowStatusNotification(true);
    setTimeout(() => {
      setShowStatusNotification(false);
      setStatusNotificationMessage('');
      setStatusNotificationType('');
    }, 4000);
  };

  const openRemoveAgentModal = (task) => {
    if (!task) return;
    setRemoveAgentReason('');
    setRemoveAgentModal({
      taskId: task.id,
      agentId: task.assigned_agent_id || null,
      agentName: task.assigned_agent_name || `Agent #${task.assigned_agent_id || ''}`.trim(),
      taskName: task.task_name || task.description || '—',
      taskStatus: task.status || 'pending',
      slaDueAt: task.sla_due_at || null
    });
  };

  const closeRemoveAgentModal = () => {
    if (removingAgent) return;
    setRemoveAgentModal(null);
    setRemoveAgentReason('');
  };

  const handleTaskReassign = async (taskId, newAgentId) => {
    if (!taskId || !newAgentId) return;
    setTaskReassigning(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/${taskId}/reassign`),
        {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ assigned_agent_id: Number(newAgentId) })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setTaskReassignId(null);
        setTaskReassignAgentId('');
        await fetchTaskData();
        await fetchTicketDetails();
        showInlineNotification('Task reassigned successfully', 'in_progress');
      } else {
        showInlineNotification(data.message || 'Failed to reassign task', 'error');
      }
    } catch (e) {
      showInlineNotification('Failed to reassign task', 'error');
    } finally {
      setTaskReassigning(false);
    }
  };

  const handleConfirmRemoveAgent = async () => {
    if (!removeAgentModal) return;
    const reason = String(removeAgentReason || '').trim();
    if (reason.length < 5) {
      alert('Please enter a reason (at least 5 characters) for removing this agent.');
      return;
    }
    setRemovingAgent(true);
    try {
      const res = await fetch(
        buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/${removeAgentModal.taskId}`),
        {
          method: 'DELETE',
          headers: getAuthHeaders(),
          body: JSON.stringify({ reason })
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        alert(data.message || 'Failed to remove agent from group.');
        return;
      }
      const removedName = data.data?.removed_agent_name || removeAgentModal.agentName || 'Agent';
      setRemoveAgentModal(null);
      setRemoveAgentReason('');
      await fetchTaskData();
      await fetchTicketDetails();
      if (isManager) fetchActivity();
      setStatusNotificationMessage(`${removedName} removed from group`);
      setStatusNotificationType('reassign');
      setShowStatusNotification(true);
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, 3500);
    } catch (err) {
      console.error('Remove agent from group error:', err);
      alert('Failed to remove agent from group.');
    } finally {
      setRemovingAgent(false);
    }
  };

  const updateTaskStatus = async (taskId, status) => {
    try {
      const res = await fetch(buildApiUrl(`/api/ticket-tasks/ticket/${ticketId}/${taskId}`), {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (!(res.ok && data.success)) {
        alert(data.message || 'Failed to update task');
        return;
      }
      await fetchTaskData();
      await fetchTicketDetails();
    } catch (_) {
      alert('Failed to update task');
    }
  };

  const completeMyGroupedTasks = async () => {
    const myId = Number(user?.id || user?.userId || 0);
    const pendingMine = (taskData?.tasks || []).filter(
      (t) => t && t.status !== 'completed' && Number(t.assigned_agent_id) === myId
    );
    if (!pendingMine.length) {
      showStatusChangeNotification('task_completed');
      setSelectedNextStatus('');
      return;
    }
    try {
      setCompletingTasks(true);
      for (const task of pendingMine) {
        // eslint-disable-next-line no-await-in-loop
        await updateTaskStatus(task.id, 'completed');
      }
      await fetchTaskData();
      await fetchTicketDetails();
      showStatusChangeNotification('task_completed');
      setSelectedNextStatus('');
    } catch (_) {
      setStatusNotificationMessage('Failed to complete assigned task(s).');
      setStatusNotificationType('error');
      setShowStatusNotification(true);
      setTimeout(() => {
        setShowStatusNotification(false);
        setStatusNotificationMessage('');
        setStatusNotificationType('');
      }, 3000);
    } finally {
      setCompletingTasks(false);
    }
  };

  const formatDate = (dateString) => {
    return formatDateTimeIST(dateString);
  };

  if (loading) {
    return (
      <div className="ticket-detail-loading">
        <div className="loading-spinner"></div>
        <p>Loading ticket details...</p>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="ticket-detail-error">
        <h2>Error</h2>
        <p>{error || 'Ticket not found'}</p>
        <button onClick={() => navigate(-1)} className="back-btn">Go Back</button>
      </div>
    );
  }

  const taskList = Array.isArray(taskData?.tasks) ? taskData.tasks : [];
  const removedTaskList = Array.isArray(taskData?.removedTasks) ? taskData.removedTasks : [];
  const myAgentId = Number(user?.id || user?.userId || 0);
  const myGroupedTasksForEta = taskList.filter((t) => Number(t.assigned_agent_id) === myAgentId);
  const ticketStatusLower = String(ticket?.status || '').toLowerCase();
  const canRemoveAgentsFromGroup =
    isManager &&
    !isCustomer &&
    !['closed', 'resolved'].includes(ticketStatusLower);
  const primaryAssigneeIdForGroup = Number(ticket?.assigned_to || 0);
  /** Reason that blocks removing this agent from the group, or '' if removal is allowed. */
  const getRemoveAgentBlockReason = (task) => {
    if (!task) return 'Invalid task';
    if (String(task.status || '').toLowerCase() === 'completed') {
      return 'This agent has already completed their assigned work and cannot be removed from the group.';
    }
    if (
      primaryAssigneeIdForGroup &&
      Number(task.assigned_agent_id) === primaryAssigneeIdForGroup
    ) {
      return "Primary assignee cannot be removed directly. Reassign the ticket's primary ownership first.";
    }
    if (taskList.length <= 2) {
      return 'A group ticket must contain at least two active agents. Reassign or dissolve the group instead.';
    }
    return '';
  };
  const groupedAgentIds = new Set(
    taskList
      .map((t) => t?.assigned_agent_id)
      .filter((id) => id !== null && id !== undefined && `${id}`.trim() !== '')
      .map((id) => String(id))
  );
  const totalTaskCount = Number(taskData?.progress?.total || 0);
  const groupedAssignedAgentsCount = Number((taskData?.assignedAgents || []).length);
  // Agent task list can be filtered to self, so use overall progress.total for staff consistency.
  // Customer view should never expose internal grouped/split handling.
  const hasGroupedTasks = !isCustomer && totalTaskCount > 0;
  const hasPendingMyGroupedTasks = (taskData?.tasks || []).some(
    (t) => t && t.status !== 'completed' && Number(t.assigned_agent_id) === myAgentId
  );
  const groupedAssignedAgentNames = Array.from(new Set(
    [
      ...(ticket?.assigned_to_name ? [ticket.assigned_to_name] : []),
      ...((taskData?.assignedAgents || []).map((a) => a?.name).filter(Boolean)),
      ...taskList.map((t) => t?.assigned_agent_name).filter(Boolean)
    ]
  ));
  const showMultiAgentNames = !isCustomer && groupedAssignedAgentNames.length > 1;
  const namesFromTasksOnly = Array.from(new Set(taskList.map((t) => t?.assigned_agent_name).filter(Boolean)));
  const apiGroupedAgents = String(ticket?.grouped_assigned_agents || '').trim();
  let assignedAgentDisplay = ticket.assigned_to_name || 'Unassigned';
  if (!isCustomer && hasGroupedTasks) {
    if (apiGroupedAgents) assignedAgentDisplay = apiGroupedAgents;
    else if (namesFromTasksOnly.length) assignedAgentDisplay = namesFromTasksOnly.join(', ');
    else assignedAgentDisplay = 'Unassigned';
  } else if (!isCustomer && (showMultiAgentNames || hasGroupedTasks)) {
    assignedAgentDisplay =
      groupedAssignedAgentNames.length > 0 ? groupedAssignedAgentNames.join(', ') : assignedAgentDisplay;
  }
  const rawTicketStatus = (ticket?.status || 'new').toLowerCase();
  const finalPriority = String(ticket?.priority || 'medium').toLowerCase();
  const ticketOpenForManagerActions = rawTicketStatus !== 'closed';
  const canConvertToGrouped =
    isManager &&
    !hasGroupedTasks &&
    ['new', 'in_progress', 'escalated'].includes(rawTicketStatus);

  const myAssignment =
    (taskData?.tasks || []).find((t) => t && Number(t.assigned_agent_id) === myAgentId) || null;
  const myAssignStatus = (myAssignment?.assignment_status || 'new').toLowerCase();
  const myWorkStatus = (myAssignment?.status || 'pending').toLowerCase();
  const groupedAgentSlice = hasGroupedTasks && isAgent && !isManager && myAssignment;
  const showGroupedInProgressBtn =
    groupedAgentSlice &&
    myWorkStatus !== 'completed' &&
    myAssignStatus === 'new' &&
    ticket.status !== 'closed';
  const showGroupedEscalateBtn =
    groupedAgentSlice &&
    myWorkStatus !== 'completed' &&
    myAssignStatus !== 'escalated' &&
    ticket.status !== 'closed';
  const showSimpleInProgressBtn =
    !hasGroupedTasks &&
    (ticket.status === 'new' || ticket.status === 'escalated' || ticket.status === 'in_progress');
  const customerVisibleStatus = (isCustomer && rawTicketStatus === 'new' && (ticket?.is_reopened || ticket?.first_response_at || ticket?.resolved_at || ticket?.closed_at))
    ? 'in_progress'
    : rawTicketStatus;
  const canOpenEscalationModal = !hasGroupedTasks && allowedEscalationLevels.length > 0;
  const getTogglePillClass = (isActive) =>
    `td-action-pill ${isActive ? 'td-action-pill--primary' : 'td-action-pill--secondary'}`;
  /** In progress vs Mark resolved: default (new/escalated/resolved) emphasizes Mark resolved; in_progress emphasizes In progress. */
  const ticketActionsInProgressActive = ticket.status === 'in_progress';
  const ticketActionsResolvedActive =
    !ticketActionsInProgressActive &&
    (ticket.status === 'resolved' ||
      ticket.status === 'new' ||
      ticket.status === 'escalated');
  const resolutionDetails = ticket?.resolution_details || null;
  // Some API shapes omit/rename `has_resolution_details` for manager views.
  // Treat presence of a summary as the source of truth for visibility.
  const hasResolutionDetails = Boolean(resolutionDetails?.resolution_summary);
  const parentResolutionDetails = parentTicketSummary?.resolution_details || null;
  const hasParentResolutionDetails = Boolean(parentResolutionDetails?.resolution_summary);
  const isCombinedParentTicket = !isLinkedChild && linkedChildren.length > 0;
  const isParentResolutionView = childWorkflowLocked;
  const displayedResolutionDetails = isParentResolutionView ? parentResolutionDetails : resolutionDetails;
  const hasDisplayedResolutionDetails = isParentResolutionView ? hasParentResolutionDetails : hasResolutionDetails;
  const linkedPrimaryTicketId = Number(linkGroup?.primary_ticket_id || 0);
  const linkedResolutionLocked =
    !isCustomer &&
    Boolean(linkGroup?.id) &&
    linkedPrimaryTicketId > 0 &&
    linkedPrimaryTicketId !== Number(ticketId);
  const linkedWorkflowLocked = linkedResolutionLocked;
  const isInLinkedGroup = Boolean(linkGroup?.id) && linkedPrimaryTicketId > 0;
  const isLinkedGroupParent = isInLinkedGroup && linkedPrimaryTicketId === Number(ticketId);
  const isLinkedGroupChild = isInLinkedGroup && linkedPrimaryTicketId !== Number(ticketId);
  const effectiveParentTicketId = isLinkedChild
    ? Number(ticket?.parent_ticket_id || 0)
    : (isLinkedGroupChild ? linkedPrimaryTicketId : 0);
  const parentTicketPath = effectiveParentTicketId
    ? (
      isManager
        ? `/manager/ticket/${effectiveParentTicketId}`
        : isAgent
          ? `/agent/ticket/${effectiveParentTicketId}`
          : `/customer/ticket/${effectiveParentTicketId}`
    )
    : null;
  const similarChildLocked = childWorkflowLocked || linkedWorkflowLocked;
  const canEditResolution = Boolean(ticket?.can_edit_resolution) && !childWorkflowLocked && !linkedResolutionLocked;
  const showResolutionActionButtons =
    // Staff-only. Customers should not see resolution UI entry points.
    !isCustomer &&
    (childWorkflowLocked || isCombinedParentTicket || hasResolutionDetails || hasParentResolutionDetails || canEditResolution);
  const canResolveWithStructuredForm =
    !isCustomer &&
    !childWorkflowLocked &&
    !linkedResolutionLocked &&
    ticket.status !== 'closed' &&
    (isManager || isAgent);

  const ticketState = rawTicketStatus; // staff-facing state machine
  const isStateNew = ticketState === 'new';
  const isStateInProgress = ticketState === 'in_progress';
  const isStateResolved = ticketState === 'resolved';
  const isStateClosed = ticketState === 'closed';
  const isStateEscalated = ticketState === 'escalated';
  const workflowStatus = getNormalizedWorkflowStatus(ticketState);
  const nextStatusOptions = buildNextStatusOptions(workflowStatus);
  const agentTaskOptions = (() => {
    if (!hasGroupedTasks || !isAgent || isManager || !myAssignment) return [];
    if (myWorkStatus === 'completed') return [];
    if (myAssignStatus === 'escalated') return []; // escalated = handed off, no further actions
    if (myAssignStatus === 'new') return ['in_progress'];
    if (myAssignStatus === 'in_progress') return ['escalated', 'task_completed'];
    return [];
  })();

  return (
    <div className="ticket-detail-modern-page">
      {showStatusNotification && (
        <div className="status-notification-popup">
          <div className="notification-content">
            <div className="notification-text">
              <h3>{statusNotificationMessage}</h3>
            </div>
            <button
              className="notification-close-btn"
              onClick={closeStatusNotification}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {showChatSupport ? (
        <div className={`ticket-support-chat-fullpage ticket-support-chat-fullpage--${(ticket?.status || 'new').replace(/\s+/g, '_')}`}>
          <div className="ticket-support-chat-fullpage-toolbar">
            <button
              type="button"
              onClick={() => setShowChatSupport(false)}
              className="td-btn td-btn-secondary"
            >
              ← Ticket details
            </button>
            <h1 className="ticket-support-chat-fullpage-title">
              Support chat · Ticket #{ticketId}
            </h1>
          </div>
          <div className="ticket-support-chat-fullpage-body">
            <SupportTicketChatTabs
              ticket={ticket}
              user={user}
              activity={activity}
              activityLoading={activityLoading}
              onReplyAdded={() => {
                fetchTicketDetails();
                fetchActivity();
              }}
            />
          </div>
        </div>
      ) : (
      <>
      <div className="td-top-bar">
        <div className="td-top-bar-inner">
          <button type="button" onClick={handleBackNavigation} className="td-toolbar-back">
            <TdSvg width="16" height="16" aria-hidden><polyline points="18 6 9 12 18 18" /></TdSvg>
            Back
          </button>
          {!isCeo ? (
            <button type="button" onClick={handleOpenSupportChat} className="td-toolbar-chat">
              <TdSvg width="18" height="18" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </TdSvg>
              Open Support Chat
            </button>
          ) : null}
        </div>
      </div>

      <div className="ticket-detail-modern-card">
        <div className="ticket-detail-modern-header">
          <div className="td-header-left">
            <span className="td-header-label">Ticket ID:</span>
            <span className="td-header-strong">#{ticketId}</span>
            {!isCustomer && (isLinkedGroupParent || isCombinedParentTicket) && (
              <span className="td-grouped-badge" title="Parent ticket for linked tickets">Parent Ticket</span>
            )}
          </div>
          <div className="td-header-right">
            {!isCeo && !isCustomer && (userRoleIsAgent || userRoleIsManager) ? (
              <button
                type="button"
                className="td-action-pill td-action-pill--outline td-action-pill--compact"
                onClick={() => setShowReferenceResolutionsModal(true)}
                title="View older resolved/closed similar tickets"
                disabled={recommendationsLoading || !(Array.isArray(referenceResolutions) && referenceResolutions.length > 0)}
              >
                {recommendationsLoading
                  ? 'Reference Resolutions (Loading…)'
                  : `Reference Resolutions (${Array.isArray(referenceResolutions) ? referenceResolutions.length : 0})`}
              </button>
            ) : null}
            <span className="td-header-meta">Created:</span>
            <span className="td-header-strong td-header-strong--muted">{formatDate(ticket.created_at)}</span>
          </div>
        </div>

          {String(ticket?.reopen_reason || '').trim() ? (
            <div
              style={{
                marginTop: 12,
                padding: '12px 16px',
                borderRadius: 8,
                background: '#fffbe6',
                border: '1px solid #ffe58f',
                color: '#ad6800',
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Reopening Reason
              </strong>
              {String(ticket.reopen_reason).trim()}
            </div>
          ) : null}

        {!isCustomer && isLinkedGroupChild && effectiveParentTicketId > 0 && (
          <section className="td-section td-linked-child-banner">
            <h3 className="td-section-title">Linked Ticket</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <p className="td-muted" style={{ marginBottom: 10 }}>
              🔗 This ticket is linked to Parent Ticket #{effectiveParentTicketId}.<br />
              All linked tickets share a common resolution.
            </p>
            <div>
              <button
                type="button"
                className="td-action-pill td-action-pill--secondary"
                onClick={() => {
                  if (parentTicketPath) navigate(parentTicketPath);
                }}
                title="Open parent ticket"
              >
                View Parent Ticket →
              </button>
            </div>
          </section>
        )}

        {!isCustomer && isLinkedChild && parentTicketSummary?.id && (
          <section className="td-section td-linked-child-banner">
            <h3 className="td-section-title">Linked Child Ticket</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <p className="td-muted">
              This ticket is linked to parent ticket #{parentTicketSummary.id}.
              {' '}
              It will share the same resolution as the parent ticket.
              {parentTicketDetailViewPath ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="td-link-btn"
                    onClick={() => navigate(parentTicketDetailViewPath, { state: { returnTicketId: ticketId } })}
                  >
                    View details
                  </button>
                </>
              ) : null}
            </p>
          </section>
        )}

        <section className="td-section">
          <h3 className="td-section-title">Basic Information</h3>
          <div className="td-section-divider" aria-hidden="true" />
          <div className="td-field-list">
            <TdFieldRow label="Customer" icon={TD_ICONS.user}>
              <span className="td-text-value">{ticket.name || '—'}</span>
            </TdFieldRow>
            <TdFieldRow label="Email" icon={TD_ICONS.mail}>
              <span className="td-text-value">{ticket.email || '—'}</span>
            </TdFieldRow>
          </div>
        </section>

        <section className="td-section">
          <h3 className="td-section-title">Issue Details</h3>
          <div className="td-section-divider" aria-hidden="true" />
          <div className="td-field-list">
            <TdFieldRow label="Issue type" icon={TD_ICONS.tag}>
              <span className="td-text-value">
                {ticket.issue_type === 'Other' && ticket.issue_type_other
                  ? ticket.issue_type_other
                  : (ticket.issue_type || '—')}
              </span>
            </TdFieldRow>
            <TdFieldRow label="Issue description" icon={TD_ICONS.fileText}>
              <span className="td-text-value">{ticket.description || '—'}</span>
            </TdFieldRow>

            <TdFieldRow label="Attachments" icon={TD_ICONS.paperclip} className="td-field-row--attachment">
              {ticketAttachments.length > 0 ? (
                <div className="td-attachment-analysis-wrap">
                  <ul className="td-attachments-multi">
                    {ticketAttachments.map((a) => (
                      <li key={a.id} className="td-attachments-multi-item">
                        <span className="td-attachment-name">{a.file_name || 'File'}</span>
                        <span className="td-attachment-type">({a.file_type || 'Unknown type'})</span>
                        <button
                          type="button"
                          className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                          onClick={async () => {
                            try {
                              const headers = getAuthHeaders();
                              const res = await authenticatedFetch(
                                buildApiUrl(`/api/tickets/${ticket.id}/attachments/${a.id}`),
                                { method: 'GET', headers }
                              );
                              if (!res.ok) throw new Error('Failed to load attachment');
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              window.open(url, '_blank', 'noopener,noreferrer');
                              setTimeout(() => URL.revokeObjectURL(url), 60_000);
                            } catch (e) {
                              alert('Unable to open this attachment right now. Please try again.');
                            }
                          }}
                        >
                          Open
                        </button>
                        {!isCustomer && (
                          <button
                            type="button"
                            className="td-action-pill td-action-pill--primary td-action-pill--compact"
                            onClick={() => handleAnalyzeAttachmentById(a.id, Boolean(attachmentAnalysesById?.[Number(a.id)]))}
                            disabled={Boolean(attachmentAnalysisLoadingById?.[Number(a.id)])}
                            style={{ marginLeft: 8 }}
                          >
                            {attachmentAnalysisLoadingById?.[Number(a.id)]
                              ? 'Analyzing attachment...'
                              : (attachmentAnalysesById?.[Number(a.id)] ? 'Re-analyze attachment' : 'Analyze Attachment')}
                          </button>
                        )}

                        {!isCustomer && attachmentAnalysisErrorById?.[Number(a.id)] ? (
                          <div className="td-attachment-analysis-error" style={{ marginTop: 8 }}>
                            {attachmentAnalysisErrorById?.[Number(a.id)]}
                          </div>
                        ) : null}

                        {!isCustomer && attachmentAnalysesById?.[Number(a.id)] ? (
                          <div className="td-attachment-analysis-card" style={{ marginTop: 10 }}>
                            <div className="td-attachment-analysis-title">AI Attachment Summary</div>
                            <div className="td-attachment-analysis-line">
                              <strong>Summary:</strong> {attachmentAnalysesById?.[Number(a.id)]?.summary || '—'}
                            </div>
                            <div className="td-attachment-analysis-line">
                              <strong>Key Points:</strong>
                              <ul className="td-attachment-analysis-points">
                                {(attachmentAnalysesById?.[Number(a.id)]?.key_points || []).length > 0
                                  ? (attachmentAnalysesById?.[Number(a.id)]?.key_points || []).map((p, i) => (
                                    <li key={`apm-${a.id}-${i}`}>{p}</li>
                                  ))
                                  : <li>No key points generated.</li>}
                              </ul>
                            </div>
                            <div className="td-attachment-analysis-line">
                              <strong>Document Type:</strong> {attachmentAnalysesById?.[Number(a.id)]?.document_type || '—'}
                            </div>
                            <div className="td-attachment-analysis-line">
                              <strong>Recommended Focus:</strong> {attachmentAnalysesById?.[Number(a.id)]?.recommended_focus || '—'}
                            </div>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (ticket.attachment_name || ticket.attachment) ? (
                <div className="td-attachment-analysis-wrap">
                  <span className="td-attachment-inline">
                    <span className="td-attachment-name">{ticket.attachment_name || ticket.attachment || 'File'}</span>
                    <span className="td-attachment-type">({ticket.attachment_type || 'Unknown type'})</span>
                    <button
                      type="button"
                      className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                      onClick={() => setShowAttachmentModal(true)}
                    >
                      Open media
                    </button>
                    {!isCustomer && (
                      <button
                        type="button"
                        className="td-action-pill td-action-pill--primary td-action-pill--compact"
                        onClick={() => handleAnalyzeAttachment(Boolean(attachmentAnalysis))}
                        disabled={attachmentAnalysisLoading}
                      >
                        {attachmentAnalysisLoading ? 'Analyzing attachment...' : (attachmentAnalysis ? 'Re-analyze attachment' : 'Analyze Attachment')}
                      </button>
                    )}
                  </span>
                  {!isCustomer && attachmentAnalysisError && (
                    <div className="td-attachment-analysis-error">{attachmentAnalysisError}</div>
                  )}
                  {!isCustomer && attachmentAnalysis && (
                    <div className="td-attachment-analysis-card">
                      <div className="td-attachment-analysis-title">AI Attachment Summary</div>
                      <div className="td-attachment-analysis-line"><strong>Summary:</strong> {attachmentAnalysis.summary || '—'}</div>
                      <div className="td-attachment-analysis-line">
                        <strong>Key Points:</strong>
                        <ul className="td-attachment-analysis-points">
                          {(attachmentAnalysis.key_points || []).length > 0
                            ? (attachmentAnalysis.key_points || []).map((p, i) => <li key={`ap-${i}`}>{p}</li>)
                            : <li>No key points generated.</li>}
                        </ul>
                      </div>
                      <div className="td-attachment-analysis-line"><strong>Document Type:</strong> {attachmentAnalysis.document_type || '—'}</div>
                      <div className="td-attachment-analysis-line"><strong>Recommended Focus:</strong> {attachmentAnalysis.recommended_focus || '—'}</div>
                    </div>
                  )}
                </div>
              ) : (
                <span className="td-text-value td-text-muted">No attachments</span>
              )}
            </TdFieldRow>
            <TdFieldRow label="Product" icon={TD_ICONS.package}>
              <span className="td-text-value">{ticket.product || '—'}</span>
            </TdFieldRow>
            <TdFieldRow label="Module" icon={TD_ICONS.layers}>
              <span className="td-text-value">{ticket.module || '—'}</span>
            </TdFieldRow>
            <TdFieldRow label="Status" icon={TD_ICONS.tag}>
              <span className="td-status-inline">
                <span className={`td-status-badge status-${customerVisibleStatus}`}>
                  {customerVisibleStatus.replace('_', ' ')}
                </span>
                {!isCustomer && hasGroupedTasks && (
                  <span className="td-grouped-badge" title={ticket.group_title || 'Grouped ticket'}>Grouped</span>
                )}
                {!isCustomer && isAgent && !isManager && hasGroupedTasks && myAssignment && (
                  <span
                    className="td-grouped-badge"
                    title="Your individual task status"
                    style={{ background: myWorkStatus === 'completed' ? '#f6ffed' : '#e6f7ff', color: myWorkStatus === 'completed' ? '#389e0d' : '#096dd9', marginLeft: 6 }}
                  >
                    Your task: {myWorkStatus === 'completed' ? 'Completed' : (myAssignment.assignment_status || 'new').replace('_', ' ')}
                  </span>
                )}
              </span>
            </TdFieldRow>
            <TdFieldRow label="Priority" icon={TD_ICONS.tag}>
              <span className="td-status-inline">
                <span
                  className="td-status-badge"
                  style={{
                    backgroundColor: `${getPriorityColor(finalPriority)}22`,
                    color: getPriorityColor(finalPriority),
                    border: `1px solid ${getPriorityColor(finalPriority)}55`
                  }}
                >
                  {finalPriority}
                </span>
                {isManager && String(ticket?.priority_reason || '').trim() ? (
                  <span className="td-header-meta" style={{ marginLeft: 10 }}>
                    AI Reason: {String(ticket.priority_reason).trim()}
                  </span>
                ) : null}
              </span>
            </TdFieldRow>
            <TdFieldRow label="Assigned agent" icon={TD_ICONS.user}>
              <span className="td-text-value td-text-value--assignee">
                {assignedAgentDisplay}
              </span>
            </TdFieldRow>
            {isManager && (
              <TdFieldRow label="Assignment reason" icon={TD_ICONS.tag}>
                <span className="td-text-value">{ticket.assignment_reason || '—'}</span>
              </TdFieldRow>
            )}
            {!isCustomer && (
              <TdFieldRow label="Current level" icon={TD_ICONS.layers}>
                <span className="td-text-value">{currentTicketLevel}</span>
              </TdFieldRow>
            )}
            {!isCustomer && (
              <TdFieldRow label="Current owner" icon={TD_ICONS.user}>
                <span className="td-text-value">
                  {ticket.current_owner_name || ticket.assigned_to_name || 'Unassigned'}
                </span>
              </TdFieldRow>
            )}
            <TdFieldRow label="Last updated" icon={TD_ICONS.calendar}>
              <span className="td-text-value">{formatDate(ticket.updated_at || ticket.created_at)}</span>
            </TdFieldRow>
            {!isCustomer && (
              <TdFieldRow label="Ticket type" icon={TD_ICONS.layers}>
                <span className="td-text-value">{hasGroupedTasks ? 'Grouped ticket' : 'Single ticket'}</span>
              </TdFieldRow>
            )}
          </div>
        </section>

        <section className="td-section td-section--actions">
          {!isCeo && (isManager ? (
            <div className="td-actions-card">
              <div className="td-actions-card-head">
                <div className="td-actions-card-titles">
                  <h3 className="td-actions-card-title">Ticket Actions</h3>
                  <div className="td-actions-card-subtitle">Manage and resolve this support ticket</div>
                </div>
              </div>
              <div className="td-actions-divider" aria-hidden="true" />
              <div className="td-actions-panel">
                {!isCustomer ? (
                  <div className="td-ticket-status-panel">
                    <div className="td-ticket-status-header">
                      <div className="td-actions-group-label td-ticket-status-group-label">PRIMARY ACTIONS</div>
                      <span className={`td-status-pill td-status-pill--${String(workflowStatus || 'open').toLowerCase()}`}>
                        Current {getStatusLabel(workflowStatus)}
                      </span>
                    </div>

                    {workflowStatus === 'closed' ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10 }}>
                        Ticket closed.
                      </div>
                    ) : nextStatusOptions.length === 0 ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10 }}>
                        {getEmptyStatusMessage(workflowStatus)}
                      </div>
                    ) : (!isManager && ticket.pending_escalation_request) ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10, color: '#f59e0b', fontWeight: '500' }}>
                        ⏳ Waiting for manager approval for escalation.
                      </div>
                    ) : (
                      <div className="td-ticket-status-controls">
                        <select
                          className="td-confirm-select td-ticket-status-select"
                          value={selectedNextStatus}
                          onChange={(e) => setSelectedNextStatus(e.target.value)}
                        >
                          <option value="">Select next status…</option>
                          {nextStatusOptions.map((s) => {
                            const meta = STATUS_META[s] || {};
                            return (
                              <option key={`next-${s}`} value={s}>
                                {meta.icon ? `${meta.icon} ` : ''}{getStatusLabel(s)}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          className="td-mgr-btn td-mgr-btn--blue td-ticket-status-update"
                          disabled={!selectedNextStatus || statusUpdating}
                          onClick={() => {
                            if (!selectedNextStatus) return;
                            if (selectedNextStatus === 'escalated') {
                              handleEscalate();
                              return;
                            }
                            if (selectedNextStatus === 'task_completed') {
                              completeMyGroupedTasks();
                              return;
                            }
                            setShowStatusConfirmModal(true);
                          }}
                        >
                          {statusUpdating || completingTasks ? 'Updating…' : 'Update status'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="td-actions-group">
                  <div className="td-actions-group-label">SECONDARY ACTIONS</div>
                  <div className="td-actions-row">
                    <button type="button" onClick={() => setShowNotifyModal(true)} className="td-action-btn td-action-btn--secondary">
                      <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.bell}</span>
                      Notify Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => openResolutionModal('view')}
                      className="td-action-btn td-action-btn--secondary"
                      disabled={childWorkflowLocked ? !hasDisplayedResolutionDetails : false}
                    >
                      <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.fileText}</span>
                      Resolution
                    </button>
                  </div>
                </div>

                <div className="td-mgr-secondary-stack">
                <div className="td-mgr-secondary-card">
                  <div className="td-mgr-secondary-icon" aria-hidden="true">{TD_ICONS.shield}</div>
                  <div className="td-mgr-secondary-body">
                    <div className="td-mgr-secondary-title">Manager Override</div>
                    <div className="td-mgr-secondary-desc">
                      Override the ticket priority if it requires faster attention. This is recorded for auditing.
                    </div>
                    <div className="td-mgr-secondary-controls">
                      <select
                        value={priorityOverrideValue}
                        onChange={(e) => setPriorityOverrideValue(e.target.value)}
                        className="td-mgr-input"
                        disabled={similarChildLocked}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Critical</option>
                      </select>
                      <input
                        type="text"
                        value={priorityOverrideReason}
                        onChange={(e) => setPriorityOverrideReason(e.target.value)}
                        placeholder="Override reason (optional)"
                        className="td-mgr-input td-mgr-input--grow"
                        disabled={similarChildLocked}
                      />
                      <button
                        type="button"
                        onClick={handlePriorityOverrideSave}
                        className="td-mgr-btn td-mgr-btn--blue"
                        disabled={prioritySaving || similarChildLocked}
                      >
                        {prioritySaving ? 'Saving…' : 'Save priority'}
                      </button>
                    </div>
                  </div>
                </div>

                {!hasGroupedTasks && (
                  <div className="td-mgr-secondary-card">
                    <div className="td-mgr-secondary-icon" aria-hidden="true">{TD_ICONS.userSwitch}</div>
                    <div className="td-mgr-secondary-body">
                      <div className="td-mgr-secondary-title">Reassign Ticket</div>
                      <div className="td-mgr-secondary-desc">Transfer ownership of this ticket to another agent.</div>
                      <div className="td-mgr-secondary-controls">
                        <select
                          id="reassignAgent"
                          value={reassignAgentId}
                          onChange={(e) => setReassignAgentId(e.target.value)}
                          className="td-mgr-input td-mgr-input--grow"
                          disabled={agentsLoading}
                        >
                          <option value="">{agentsLoading ? 'Loading…' : 'Reassign to…'}</option>
                          {agents
                            .filter(a => Number(a.id) !== Number(ticket.assigned_to))
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name} ({a.email})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleReassign}
                          className="td-mgr-btn td-mgr-btn--outline"
                          disabled={!reassignAgentId || reassigning}
                        >
                          {reassigning ? 'Reassigning…' : 'Reassign'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="td-mgr-secondary-card">
                  <div className="td-mgr-secondary-icon" aria-hidden="true">{TD_ICONS.users}</div>
                  <div className="td-mgr-secondary-body td-mgr-secondary-body--row">
                    <div>
                      <div className="td-mgr-secondary-title">Group Ticket</div>
                      <div className="td-mgr-secondary-desc">
                        Split work across agents on a dedicated page (group name, internal note, one row per agent including the current assignee).
                      </div>
                    </div>
                    <button
                      type="button"
                      className="td-mgr-btn td-mgr-btn--blue"
                      onClick={() => navigate(`/manager/ticket/${ticketId}/group`)}
                      disabled={!canConvertToGrouped || similarChildLocked || !ticketOpenForManagerActions}
                    >
                      Group ticket
                    </button>
                  </div>
                </div>
              </div>
              </div>
            </div>
          ) : (
            <div className="td-actions-card">
              <div className="td-actions-card-head">
                <div className="td-actions-card-titles">
                  <h3 className="td-actions-card-title">Ticket Actions</h3>
                  <div className="td-actions-card-subtitle">Manage and resolve this support ticket</div>
                </div>
              </div>
              <div className="td-actions-divider" aria-hidden="true" />
              <div className="td-actions-panel">
                {/* Ticket Status panel (agent/manager routes; customers never see) */}
                {!isCustomer ? (
                  <div className="td-ticket-status-panel">
                    <div className="td-ticket-status-header">
                      <div className="td-actions-group-label td-ticket-status-group-label">PRIMARY ACTIONS</div>
                      {isAgent && !isManager && hasGroupedTasks && myAssignment ? (
                        <span className={`td-status-pill td-status-pill--${myWorkStatus === 'completed' ? 'resolved' : myAssignStatus}`}>
                          {myWorkStatus === 'completed'
                            ? 'Your task: Completed'
                            : `Your task: ${getStatusLabel(myAssignStatus)}`}
                        </span>
                      ) : (
                        <span className={`td-status-pill td-status-pill--${String(workflowStatus || 'open').toLowerCase()}`}>
                          Current {getStatusLabel(workflowStatus)}
                        </span>
                      )}
                    </div>

                    {workflowStatus === 'closed' ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10 }}>
                        🔒 Ticket Closed — This ticket is finalized and cannot be modified.
                      </div>
                    ) : isAgent && !isManager && hasGroupedTasks && myAssignment ? (
                      agentTaskOptions.length === 0 ? (
                        <div className="td-actions-statusline" style={{ marginTop: 10 }}>
                          {myWorkStatus === 'completed'
                            ? 'Your task is completed. Waiting for other agents and manager to resolve the ticket.'
                            : myAssignStatus === 'escalated'
                              ? 'Task escalated — awaiting manager action.'
                              : 'No actions available.'}
                        </div>
                      ) : (
                        <div className="td-ticket-status-controls">
                          <select
                            className="td-confirm-select td-ticket-status-select"
                            value={selectedNextStatus}
                            onChange={(e) => setSelectedNextStatus(e.target.value)}
                          >
                            <option value="">Select next status…</option>
                            {agentTaskOptions.map((s) => (
                              <option key={`next-${s}`} value={s}>
                                {getAgentTaskLabel(s, myAssignStatus)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="td-mgr-btn td-mgr-btn--blue td-ticket-status-update"
                            disabled={!selectedNextStatus || statusUpdating}
                            onClick={() => {
                              if (!selectedNextStatus) return;
                              if (selectedNextStatus === 'task_completed') {
                                completeMyGroupedTasks();
                                return;
                              }
                              handleAgentTaskAction(selectedNextStatus);
                            }}
                          >
                            {statusUpdating || completingTasks ? 'Updating…' : 'Update status'}
                          </button>
                        </div>
                      )
                    ) : nextStatusOptions.length === 0 ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10 }}>
                        {getEmptyStatusMessage(workflowStatus)}
                      </div>
                    ) : (!isManager && ticket?.pending_escalation_request) ? (
                      <div className="td-actions-statusline" style={{ marginTop: 10, color: '#f59e0b', fontWeight: '500' }}>
                        ⏳ Waiting for manager approval for escalation.
                      </div>
                    ) : (
                      <div className="td-ticket-status-controls">
                        <select
                          className="td-confirm-select td-ticket-status-select"
                          value={selectedNextStatus}
                          onChange={(e) => setSelectedNextStatus(e.target.value)}
                        >
                          <option value="">Select next status…</option>
                          {nextStatusOptions.map((s) => {
                            const meta = STATUS_META[s] || {};
                            return (
                              <option key={`next-${s}`} value={s}>
                                {meta.icon ? `${meta.icon} ` : ''}{getStatusLabel(s)}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          className="td-mgr-btn td-mgr-btn--blue td-ticket-status-update"
                          disabled={!selectedNextStatus || statusUpdating}
                          onClick={() => {
                            if (!selectedNextStatus) return;
                            if (selectedNextStatus === 'escalated') {
                              handleEscalate();
                              return;
                            }
                            if (selectedNextStatus === 'task_completed') {
                              completeMyGroupedTasks();
                              return;
                            }
                            setShowStatusConfirmModal(true);
                          }}
                        >
                          {statusUpdating || completingTasks ? 'Updating…' : 'Update status'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="td-actions-group">
                  <div className="td-actions-group-label">SECONDARY ACTIONS</div>
                  {isAgent && isStateResolved ? (
                    <div className="td-actions-statusline">
                      Ticket resolved — waiting for user confirmation.
                    </div>
                  ) : null}
                  {(isAgent || isCustomer) && isStateClosed ? (
                    <div className="td-actions-statusline">
                      This ticket is closed.
                    </div>
                  ) : null}
                  <div className="td-actions-row">
                    {isCustomer && isStateClosed ? (
                      <button
                        type="button"
                        className="td-action-btn td-action-btn--secondary"
                        onClick={() => setShowCustomerReopenModal(true)}
                      >
                        Reopen ticket
                      </button>
                    ) : null}
                    {isCustomer && !isStateClosed && !isStateResolved ? (
                      <button type="button" className="td-action-btn td-action-btn--secondary" disabled>
                        Awaiting resolution
                      </button>
                    ) : null}

                    {(isCustomer || isManager) && isStateResolved ? (
                      <button
                        type="button"
                        className="td-action-btn td-action-btn--primary"
                        onClick={() => {
                          if (isCustomer) {
                            setCustomerResolutionConfirmDeferred(false);
                            setShowCustomerResolutionConfirm(true);
                            return;
                          }
                          setShowCloseConfirmModal(true);
                        }}
                      >
                        <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.checkCircle}</span>
                        Close ticket
                      </button>
                    ) : null}

                    {isCustomer && !isStateClosed && !isStateResolved && !ticket?.is_escalated && canCustomerEscalate ? (
                      <button
                        type="button"
                        className="td-action-btn td-action-btn--escalate"
                        onClick={() => setShowCustomerEscalateModal(true)}
                      >
                        <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.alertTriangle}</span>
                        Escalate
                      </button>
                    ) : null}

                    {/* Status transitions moved to strict dropdown panel below */}

                    {!isCustomer && isAgent && (
                      <button
                        type="button"
                        className="td-action-btn td-action-btn--secondary"
                        onClick={() => setShowNotifyModal(true)}
                        disabled={childWorkflowLocked || isLinkedGroupChild}
                      >
                        <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.bell}</span>
                        Notify Customer
                      </button>
                    )}

                    {!isCustomer && (
                      <button
                        type="button"
                        className="td-action-btn td-action-btn--secondary"
                        onClick={() => {
                          // Child tickets can view (read-only) the parent/primary resolution once available.
                          if (childWorkflowLocked) {
                            openResolutionModal('view');
                            return;
                          }
                          if (isLinkedGroupChild) {
                            openResolutionModal('view');
                            return;
                          }
                          openResolutionModal(hasResolutionDetails ? 'view' : (canEditResolution ? 'edit' : 'view'));
                        }}
                        disabled={
                          childWorkflowLocked
                            ? !hasDisplayedResolutionDetails
                            : (isLinkedGroupChild
                              ? !hasResolutionDetails
                              : (!hasResolutionDetails && !canEditResolution))
                        }
                        title={
                          childWorkflowLocked
                            ? (hasDisplayedResolutionDetails
                              ? `View parent ticket #${ticket.parent_ticket_id} resolution`
                              : 'Parent ticket resolution is not available yet.')
                            : isLinkedGroupChild
                              ? (hasResolutionDetails
                                ? `View Parent Ticket #${effectiveParentTicketId || linkedPrimaryTicketId} resolution`
                                : `Resolution is managed by Parent Ticket #${effectiveParentTicketId || linkedPrimaryTicketId}. Waiting for parent.`)
                            : 'Open resolution details'
                        }
                      >
                        <span className="td-action-btn-ic" aria-hidden="true">{TD_ICONS.fileText}</span>
                        Resolution
                      </button>
                    )}
                  </div>
                  {isAgent && isLinkedGroupChild && effectiveParentTicketId > 0 && (
                    <p className="td-actions-caption" style={{ marginTop: 10 }}>
                      {hasResolutionDetails
                        ? 'Resolution updated.'
                        : `Resolution is managed by Parent Ticket #${effectiveParentTicketId}. Waiting for resolution update from parent.`}
                    </p>
                  )}
                </div>

              </div>
            </div>
          ))}
        </section>

        {showCustomerEscalateModal ? (
          <div className="td-confirm-modal-overlay" role="dialog" aria-modal="true" aria-label="Escalate ticket">
            <div className="td-confirm-modal td-cust-escalate-modal">
              <div className="td-cust-escalate-head">
                <h3>Escalate</h3>
                <button type="button" className="td-cust-escalate-x" onClick={() => setShowCustomerEscalateModal(false)} aria-label="Close">
                  ×
                </button>
              </div>
              <p style={{ marginTop: 0 }}>
                Escalate only if the issue is still unresolved or support has not replied for a while.
              </p>
              <div className="td-cust-escalate-grid">
                <label className="td-confirm-reason">
                  <span className="td-confirm-reason-label">Reason (required)</span>
                  <select
                    className="td-confirm-select"
                    value={customerEscalateReason}
                    onChange={(e) => setCustomerEscalateReason(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Issue not resolved">Issue not resolved</option>
                    <option value="Delay in response">Delay in response</option>
                    <option value="Incorrect resolution">Incorrect resolution</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="td-confirm-reason">
                  <span className="td-confirm-reason-label">Comment (optional)</span>
                  <textarea
                    className="td-confirm-textarea"
                    rows={4}
                    value={customerEscalateComment}
                    onChange={(e) => setCustomerEscalateComment(e.target.value)}
                    placeholder="Add any additional details (optional)"
                  />
                </label>
              </div>
              <div className="td-confirm-actions td-confirm-actions--spaced">
                <button type="button" className="td-confirm-choice" onClick={() => setShowCustomerEscalateModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="td-confirm-choice td-confirm-choice--active"
                  onClick={handleCustomerEscalateSubmit}
                  disabled={customerEscalating || !String(customerEscalateReason || '').trim()}
                >
                  {customerEscalating ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showCustomerReopenModal ? (
          <div className="td-confirm-modal-overlay" role="dialog" aria-modal="true" aria-label="Reopen ticket">
            <div className="td-confirm-modal">
              <h3 style={{ marginTop: 0 }}>Reopen ticket</h3>
              <p className="td-muted" style={{ marginTop: 0 }}>
                Please tell us why you are reopening this ticket (required).
              </p>
              <label className="td-confirm-reason" style={{ width: '100%' }}>
                <span className="td-confirm-reason-label">Reason</span>
                <textarea
                  className="td-confirm-textarea"
                  rows={4}
                  value={customerReopenReason}
                  onChange={(e) => setCustomerReopenReason(e.target.value)}
                  placeholder="Type your reason…"
                />
              </label>
              <div className="td-confirm-actions td-confirm-actions--spaced">
                <button type="button" className="td-confirm-choice" onClick={() => { setShowCustomerReopenModal(false); setCustomerReopenReason(''); }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="td-confirm-choice td-confirm-choice--active"
                  onClick={handleCustomerReopen}
                  disabled={String(customerReopenReason || '').trim().length < 3}
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {(!isCustomer &&
          ['new', 'in_progress'].includes(String(ticket?.status || '').toLowerCase()) &&
          isInLinkedGroup &&
          (isManager || (isAgent && isLinkedGroupParent)) &&
          !isLinkedGroupChild) ? (
          <section className="td-section td-linked-redesign">
            <div className="td-mgr-actions-card td-linked-outline">
              <div className="td-linked-head">
                <div className="td-linked-head-left">
                  <span className="td-linked-head-ic" aria-hidden="true">{TD_ICONS.users}</span>
                  <div className="td-linked-head-text">
                    <h3 className="td-section-title" style={{ margin: 0 }}>Linked tickets</h3>
                    <div className="td-muted td-linked-subtitle">
                      {linkGroup?.ticket_ids?.length ? `${linkGroup.ticket_ids.length} tickets linked` : 'No linked tickets yet.'}
                    </div>
                  </div>
                </div>
              </div>

              {linkedLoadingInternal ? (
                <p className="td-muted" style={{ marginTop: 10 }}>Loading linked tickets…</p>
              ) : !linkGroup ? (
                <p className="td-muted" style={{ marginTop: 10 }}>No linked tickets yet.</p>
              ) : (
                <>
                  <div className="td-linked-ticket-list td-linked-ticket-list--redesign">
                    {linkedTicketsInternal.map((lt) => (
                      <div key={lt.id} className="td-linked-ticket-item td-linked-ticket-item--redesign">
                        <div className="td-linked-ticket-left">
                          <div className="td-linked-ticket-title" title={lt.issue_title || ''}>
                            <strong>#{lt.id}</strong> {lt.issue_title || 'No title'}
                          </div>
                          <div className="td-linked-ticket-meta">
                            <span className={`td-status-pill td-status-pill--${String(lt.status || 'new').toLowerCase()}`}>
                              {String(lt.status || 'new').replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div className="td-linked-ticket-actions">
                          <button
                            type="button"
                            className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                            onClick={() => {
                              const path = isManager
                                ? `/manager/ticket/${lt.id}`
                                : isAgent
                                  ? `/agent/ticket/${lt.id}`
                                  : `/customer/ticket/${lt.id}`;
                              window.open(path, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            Open
                          </button>
                          {isManager ? (
                            <button
                              type="button"
                              className="td-action-pill td-action-pill--secondary td-action-pill--compact td-action-pill--danger-ghost"
                              onClick={() => unlinkTicketInternal(lt.id)}
                              disabled={unlinkingTicketId === lt.id}
                            >
                              {unlinkingTicketId === lt.id ? 'Unlinking…' : 'Unlink'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(isManager || (isAgent && isLinkedGroupParent)) ? (
                    <>
                      {isManager ? (
                        <div className="td-linked-action-card">
                          <div className="td-linked-action-head">
                            <span className="td-linked-action-ic" aria-hidden="true">{TD_ICONS.fileText}</span>
                            <span className="td-linked-action-title">SHARE NOTE (INTERNAL)</span>
                          </div>
                          <textarea
                            className="td-textarea"
                            rows={3}
                            value={shareNoteText}
                            onChange={(e) => setShareNoteText(e.target.value)}
                            placeholder="This will be added as an internal note on all linked tickets."
                          />
                          {Array.isArray(sharedNotesLog) && sharedNotesLog.length > 0 ? (
                            <div style={{ marginTop: 10 }}>
                              <div className="td-muted" style={{ fontWeight: 700, marginBottom: 6 }}>Sent notes</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {sharedNotesLog.slice(0, 10).map((n, idx) => (
                                  <div
                                    key={`sn-${idx}`}
                                    style={{
                                      border: '1px solid #e5e7eb',
                                      borderRadius: 10,
                                      padding: '10px 12px',
                                      background: '#f9fafb'
                                    }}
                                  >
                                    <div className="td-muted" style={{ marginBottom: 6 }}>
                                      {n?.created_at ? formatDateTimeIST(n.created_at) : '—'}
                                    </div>
                                    <div style={{ whiteSpace: 'pre-wrap', color: '#111827', fontWeight: 600 }}>
                                      {String(n?.note || '')}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                          <div className="td-linked-action-foot">
                            <span className="td-muted">Visible to your team only • {linkGroup?.ticket_ids?.length || 0} recipients</span>
                            <button
                              type="button"
                              className="td-action-pill td-action-pill--primary td-action-pill--compact"
                              onClick={shareNoteToLinked}
                              disabled={!String(shareNoteText || '').trim()}
                            >
                              Share note
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {/* Bulk close section removed */}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </section>
        ) : null}

        {isManager && ['new', 'in_progress'].includes(String(ticket?.status || '').toLowerCase()) && !isLinkedGroupChild ? (
          <section className="td-section">
            <h3 className="td-section-title">Similar tickets</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-similar-controls-row" style={{ justifyContent: 'flex-start', marginBottom: 8 }}>
              <button
                type="button"
                className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                onClick={() => fetchSimilarRecommendations({ refresh: true })}
                disabled={recommendationsLoading}
              >
                {recommendationsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
            {recommendationsLoading ? (
              <p className="td-muted">Checking similar tickets…</p>
            ) : recommendationsError ? (
              <p className="td-muted" style={{ color: '#b91c1c' }}>
                Recommendation check failed: {recommendationsError}
              </p>
            ) : similarRecommendations.length === 0 ? (
              <p className="td-muted">No strong matches found in the last 7 days.</p>
            ) : (
              <div className="td-similar-ticket-list">
                {similarRecommendations
                  .filter((item) => {
                    const id = Number(item?.id || 0);
                    if (!id) return false;
                    if (Number(id) === Number(ticketId)) return false;
                    // Hide anything already linked (previously-linked should never re-appear here).
                    if (Array.isArray(linkedTicketsInternal) && linkedTicketsInternal.some((lt) => Number(lt?.id) === id)) return false;
                    return true;
                  })
                  .map((item) => {
                  const score = Number(item.score || 0);
                  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
                  return (
                    <div key={item.id} className="td-similar-ticket-card">
                      <div className="td-similar-ticket-head">
                        <div className="td-similar-ticket-title">
                          <strong>#{item.id}</strong> {item.issue_title || 'No title'}
                        </div>
                        <div className="td-similar-ticket-badges">
                          <span className={`td-status-pill td-status-pill--${String(item.status || 'new').toLowerCase()}`}>
                            {String(item.status || 'new').replace('_', ' ')}
                          </span>
                          <span className="td-score-pill" title="Similarity score">
                            {score}%
                          </span>
                        </div>
                      </div>
                      <div className="td-muted" style={{ marginTop: 6 }}>
                        Created: {item.created_at ? formatDateTimeIST(item.created_at) : '—'}
                      </div>
                      {reasons.length > 0 ? (
                        <div className="td-similar-ticket-reasons">
                          {reasons.slice(0, 3).map((r, idx) => (
                            <div key={`${item.id}-r-${idx}`} className="td-similar-ticket-reason">
                              {String(r)}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="td-similar-ticket-actions">
                          <button
                            type="button"
                            className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                            onClick={() => window.open(`/ticket/${item.id}`, '_blank')}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            className="td-action-pill td-action-pill--primary td-action-pill--compact"
                            onClick={() => linkTicketInternal(item.id)}
                            disabled={linkingTicketId === item.id}
                          >
                            {linkingTicketId === item.id ? 'Linking…' : 'Link'}
                          </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ) : null}

        {isCustomer && notifyUpdates.length > 0 && (
          <section className="td-section">
            <h3 className="td-section-title">Message action</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-resolution-readonly" style={{ marginTop: 6 }}>
              <div className="td-muted" style={{ marginBottom: 8 }}>
                Updates sent by support (in-app + email). Latest shown first.
              </div>
              <div className="td-similar-ticket-reasons" style={{ marginTop: 0 }}>
                {notifyUpdates.map((u) => (
                  <div key={u.id} className="td-similar-ticket-reason">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <strong style={{ fontWeight: 600 }}>
                        {u.sender_name || 'Support'}
                        {u.channel === 'email' && <span title="Sent via Email" style={{ marginLeft: 8 }}>📧</span>}
                      </strong>
                      <span className="td-muted" style={{ whiteSpace: 'nowrap' }}>
                        {u.created_at ? formatDateTimeIST(u.created_at) : ''}
                      </span>
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>
                      {String(u.message || '').trim() || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {!isCustomer && notifyUpdates.length > 0 && (
          <section className="td-section">
            <h3 className="td-section-title">Resolution</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-resolution-readonly" style={{ marginTop: 6 }}>
              <div className="td-resolution-row">
                <span className="td-resolution-label">Message action</span>
                <span className="td-resolution-value td-resolution-pre">
                  {notifyUpdates.length > 0
                    ? notifyUpdates.map((u) => String(u?.message || '').trim()).filter(Boolean).join('\n\n')
                    : '—'}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* Ticket Actions moved directly under Issue Details */}

        {!isCustomer && escalationHistory.length > 0 && (
          <section className="td-section">
            <h3 className="td-section-title">Escalation History</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-escalation-history">
              {escalationHistory.map((entry) => (
                <div key={entry.id} className="td-escalation-history-item">
                  <div className="td-escalation-history-main">
                    <strong>{entry.from_level}</strong>
                    <span aria-hidden="true">→</span>
                    <strong>{entry.to_level}</strong>
                    <span>
                      {entry.from_agent_name || 'Unknown'} to {String(entry.to_level || '').toUpperCase() === 'MANAGER' ? 'Manager' : (entry.to_agent_name || 'Unassigned')}
                    </span>
                  </div>
                  <div className="td-escalation-history-reason">
                    Reason: {entry.escalation_reason}
                  </div>
                  <div className="td-escalation-history-time">
                    {formatDate(entry.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!isCustomer && hasGroupedTasks && isManager && (
          <section className="td-section">
            <h3 className="td-section-title">Tasks</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-field-list">
              <TdFieldRow label="Grouped tasks" icon={TD_ICONS.layers}>
                <span className="td-text-value">
                  {taskLoading
                    ? 'Loading…'
                    : `Progress: ${taskData.progress?.completed || 0}/${taskData.progress?.total || 0} completed`}
                </span>
              </TdFieldRow>
            </div>
          </section>
        )}

        {!isCustomer && isAgent && !isManager && hasGroupedTasks && (
          <section className="td-section td-grouped-agent-task">
            <h3 className="td-section-title">Your assigned task</h3>
            <div className="td-section-divider" aria-hidden="true" />
            {ticket?.group_title && (
              <p className="td-muted td-grouped-title-line">
                <strong>Group:</strong> {ticket.group_title}
              </p>
            )}
            {taskLoading ? (
              <p className="td-muted">Loading tasks…</p>
            ) : (
              <>
                <p className="td-muted td-group-progress-line">
                  Overall group progress: {taskData.progress?.completed || 0}/{taskData.progress?.total || 0} tasks completed (all agents).
                </p>
                <ul className="td-my-task-list">
                  {(taskData?.tasks || []).map((t) => (
                    <li key={t.id} className="td-my-task-item">
                      <div className="td-my-task-work">{t.description || t.task_name || '—'}</div>
                      <div className="td-my-task-meta">
                        Your stage: <strong>{(t.assignment_status || 'new').replace('_', ' ')}</strong>
                        {' · '}
                        Work: <strong>{(t.status || 'pending').replace('_', ' ')}</strong>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {!isCustomer && isManager && hasGroupedTasks && (
          <section className="td-section td-grouped-manager-summary">
            <h3 className="td-section-title">Grouped ticket</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-field-list">
              <TdFieldRow label="Group name" icon={TD_ICONS.layers}>
                <span className="td-text-value">{ticket.group_title || '—'}</span>
              </TdFieldRow>
              <TdFieldRow label="Created" icon={TD_ICONS.calendar}>
                <span className="td-text-value">{ticket.grouped_at ? formatDate(ticket.grouped_at) : '—'}</span>
              </TdFieldRow>
              {ticket.group_internal_note ? (
                <TdFieldRow label="Internal note" icon={TD_ICONS.tag} className="td-field-row--note">
                  <span className="td-text-value">{ticket.group_internal_note}</span>
                </TdFieldRow>
              ) : null}
            </div>
            <h4 className="td-grouped-subheading">Agent assignments</h4>
            <p className="td-muted" style={{ marginBottom: 12 }}>
              <strong>Assignment</strong> is the agent handoff stage; <strong>Work</strong> is the task itself.
              When a grouped ticket is reopened (customer or manager), both reset to a fresh cycle and each assigned agent is emailed.
            </p>
            {taskLoading ? (
              <p className="td-muted">Loading…</p>
            ) : (
              <ul className="td-grouped-assignment-list">
                {taskList.map((t) => {
                  const assignLabel = (t.assignment_status || 'new').replace(/_/g, ' ');
                  const workLabel = (t.status || 'pending').replace(/_/g, ' ');
                  const removeBlockReason = canRemoveAgentsFromGroup ? getRemoveAgentBlockReason(t) : 'Manager only';
                  const removeAllowed = canRemoveAgentsFromGroup && !removeBlockReason;
                  const isEscalated = (t.assignment_status || '').toLowerCase() === 'escalated';
                  const isReassigningThis = taskReassignId === t.id;
                  return (
                  <li key={t.id} className="td-grouped-assignment-item">
                    <div className="td-grouped-assignment-head">
                      <strong>{t.assigned_agent_name || `Agent #${t.assigned_agent_id}`}</strong>
                      <span className="td-task-pill">Assignment: {assignLabel}</span>
                      <span className={`td-task-pill status-${t.status === 'completed' ? 'completed' : t.status || 'pending'}`}>
                        Work: {workLabel}
                      </span>
                      {isEscalated && (
                        isReassigningThis ? (
                          <div className="td-task-reassign-controls" style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
                            <select
                              value={taskReassignAgentId}
                              onChange={(e) => setTaskReassignAgentId(e.target.value)}
                              disabled={agentsLoading || taskReassigning}
                              style={{ minWidth: 160, padding: '4px 8px', fontSize: 13 }}
                            >
                              <option value="">{agentsLoading ? 'Loading…' : 'Assign to…'}</option>
                              {agents
                                .filter(a => Number(a.id) !== Number(t.assigned_agent_id))
                                .map(a => (
                                  <option key={a.id} value={a.id}>
                                    {a.name}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleTaskReassign(t.id, taskReassignAgentId)}
                              disabled={!taskReassignAgentId || taskReassigning}
                              style={{ padding: '4px 10px', fontSize: 13 }}
                            >
                              {taskReassigning ? '…' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => { setTaskReassignId(null); setTaskReassignAgentId(''); }}
                              disabled={taskReassigning}
                              style={{ padding: '4px 10px', fontSize: 13 }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="td-grouped-reassign-btn"
                            onClick={() => { setTaskReassignId(t.id); setTaskReassignAgentId(''); }}
                            title="Reassign this escalated task to another agent"
                          >
                            Reassign
                          </button>
                        )
                      )}
                      {!isEscalated && canRemoveAgentsFromGroup && (
                        removeAllowed ? (
                          <button
                            type="button"
                            className="td-grouped-remove-btn"
                            onClick={() => openRemoveAgentModal(t)}
                            title="Remove this agent from the group"
                          >
                            Remove from Group
                          </button>
                        ) : (
                          <span
                            className="td-grouped-remove-btn td-grouped-remove-btn--disabled"
                            title={removeBlockReason}
                            aria-disabled="true"
                          >
                            Remove from Group
                          </span>
                        )
                      )}
                    </div>
                    <div className="td-grouped-assignment-body">{t.description || t.task_name || '—'}</div>
                  </li>
                  );
                })}
              </ul>
            )}
            {!taskLoading && removedTaskList.length > 0 && (
              <div className="td-grouped-removed-section">
                <button
                  type="button"
                  className="td-grouped-removed-toggle"
                  onClick={() => setShowRemovedAgents((v) => !v)}
                  aria-expanded={showRemovedAgents}
                >
                  {showRemovedAgents ? '▾' : '▸'} Previously Assigned Agents ({removedTaskList.length})
                </button>
                {showRemovedAgents && (
                  <ul className="td-grouped-removed-list">
                    {removedTaskList.map((rt) => (
                      <li key={`removed-${rt.id}`} className="td-grouped-removed-item">
                        <div className="td-grouped-removed-head">
                          <strong>{rt.assigned_agent_name || `Agent #${rt.assigned_agent_id}`}</strong>
                          <span className="td-grouped-removed-meta">
                            Removed {rt.removed_at ? formatDate(rt.removed_at) : ''}
                            {rt.removed_by_name ? ` by ${rt.removed_by_name}` : ''}
                          </span>
                        </div>
                        {rt.task_name || rt.description ? (
                          <div className="td-grouped-removed-task">
                            <span className="td-muted">Was assigned: </span>
                            {rt.description || rt.task_name}
                          </div>
                        ) : null}
                        <div className="td-grouped-removed-reason">
                          <span className="td-muted">Reason: </span>
                          {rt.removal_reason || '—'}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

      {showReferenceResolutionsModal && !isCeo && !isCustomer ? (
          <div
            className="td-confirm-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Reference Resolutions"
            onClick={() => setShowReferenceResolutionsModal(false)}
          >
            <div
              className="td-confirm-modal td-refres-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="td-refres-head">
                <h3 style={{ margin: 0 }}>Reference Resolutions</h3>
                <button
                  type="button"
                  className="td-cust-escalate-x"
                  onClick={() => setShowReferenceResolutionsModal(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="td-muted" style={{ marginTop: 10 }}>
                Older resolved/closed tickets with recorded resolution details. Use these as reference for fixes and steps.
              </p>

              <div className="td-refres-list">
                {(Array.isArray(referenceResolutions) ? referenceResolutions : []).map((item) => {
                  const id = Number(item?.ticket_id || 0);
                  if (!id) return null;
                  const title = String(item?.title || 'No title');
                  const preview = String(item?.resolution_preview || '').trim();
                  const score = Number(item?.similarity_score || 0);
                  const viewPath = isManager ? `/manager/ticket/${id}` : isAgent ? `/agent/ticket/${id}` : `/ticket/${id}`;
                  return (
                    <div key={`td-refres-${id}`} className="td-refres-item">
                      <div className="td-refres-item-head">
                        <div className="td-refres-title" title={title}>
                          <strong>#{id}</strong> — {title}
                        </div>
                        <div className="td-refres-score" title="Similarity score">
                          {Number.isFinite(score) ? `${Math.max(0, Math.min(100, Math.trunc(score)))}%` : '—'}
                        </div>
                      </div>
                      <div className="td-refres-preview">
                        {preview ? `${preview}${preview.length >= 150 ? '…' : ''}` : '—'}
                      </div>
                      <div className="td-refres-actions">
                        <button
                          type="button"
                          className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                          onClick={() => {
                            openReferenceResolutionPreview(id);
                          }}
                          disabled={referenceResolutionPreviewLoadingTicketId === id}
                        >
                          {referenceResolutionPreviewLoadingTicketId === id ? 'Loading…' : 'View Full Resolution'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="td-confirm-actions td-confirm-actions--spaced">
                <button
                  type="button"
                  className="td-confirm-choice"
                  onClick={() => setShowReferenceResolutionsModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

      {showReferenceResolutionPreview && !isCeo && !isCustomer ? (
          <div
            className="td-confirm-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Resolution preview"
            onClick={() => setShowReferenceResolutionPreview(false)}
          >
            <div className="td-confirm-modal td-refres-modal" onClick={(e) => e.stopPropagation()}>
              <div className="td-refres-head">
                <h3 style={{ margin: 0 }}>
                  Resolution — #{referenceResolutionPreviewTicket?.ticketId || ''}
                </h3>
                <button
                  type="button"
                  className="td-cust-escalate-x"
                  onClick={() => setShowReferenceResolutionPreview(false)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              {referenceResolutionPreviewError ? (
                <p className="td-muted" style={{ color: '#b91c1c', marginTop: 10 }}>
                  {referenceResolutionPreviewError}
                </p>
              ) : null}

              <div className="td-resolution-readonly" style={{ marginTop: 12 }}>
                {referenceResolutionPreviewTicket?.resolution_details?.resolution_summary ? (
                  <>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Summary</span>
                      <span className="td-resolution-value">{referenceResolutionPreviewTicket.resolution_details.resolution_summary}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Fix type</span>
                      <span className="td-resolution-value">{referenceResolutionPreviewTicket.resolution_details.fix_type || '—'}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Root cause</span>
                      <span className="td-resolution-value">{referenceResolutionPreviewTicket.resolution_details.root_cause || '—'}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Internal steps</span>
                      <span className="td-resolution-value td-resolution-pre">{referenceResolutionPreviewTicket.resolution_details.internal_steps || '—'}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Reference</span>
                      <span className="td-resolution-value">{referenceResolutionPreviewTicket.resolution_details.reference_data || '—'}</span>
                    </div>
                  </>
                ) : (
                  <p className="td-muted">No resolution details recorded for this ticket.</p>
                )}
              </div>

              <div className="td-confirm-actions td-confirm-actions--spaced">
                <button type="button" className="td-confirm-choice" onClick={() => setShowReferenceResolutionPreview(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showStatusConfirmModal && !isCustomer ? (
          <div
            className="td-confirm-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm status change"
            onClick={() => {
              if (statusUpdating) return;
              setShowStatusConfirmModal(false);
            }}
          >
            <div className="td-confirm-modal" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ marginTop: 0 }}>
                Move this ticket to {getStatusLabel(selectedNextStatus)}?
              </h3>
              <p>
                You&apos;re changing status from <strong>{getStatusLabel(workflowStatus)}</strong> to{' '}
                <strong>{getStatusLabel(selectedNextStatus)}</strong>.
              </p>
              <div className="td-confirm-actions td-confirm-actions--spaced">
                <button
                  type="button"
                  className="td-confirm-choice"
                  onClick={() => setShowStatusConfirmModal(false)}
                  disabled={statusUpdating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="td-confirm-choice td-confirm-choice--active"
                  disabled={
                    statusUpdating ||
                    !String(selectedNextStatus || '').trim()
                  }
                  onClick={() => submitStatusTransition({ nextStatus: selectedNextStatus })}
                >
                  {statusUpdating ? 'Confirming…' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="td-section td-section--feedback">
          <h3 className="td-section-title">Ticket feedback</h3>
          <div className="td-section-divider" aria-hidden="true" />
          {ticket?.feedback ? (
            <div className="td-eta-panel">
              <div className="td-eta-line">
                <span className="td-eta-label">Rating</span>
                <span className="td-eta-value">{ticket.feedback.rating != null ? `${ticket.feedback.rating}/5` : '—'}</span>
              </div>
              <div className="td-eta-line">
                <span className="td-eta-label">Submitted</span>
                <span className="td-eta-value">
                  {ticket.feedback.submitted_at ? formatDateTimeIST(ticket.feedback.submitted_at) : '—'}
                </span>
              </div>
              <div className="td-eta-line">
                <span className="td-eta-label">Feedback</span>
                <span className="td-eta-value">{ticket.feedback.feedback_text || '—'}</span>
              </div>
            </div>
          ) : (
            <p className="td-muted">No feedback submitted for this ticket yet.</p>
          )}
        </section>

        {!isCustomer && hasGroupedTasks && (
          <section className="td-section td-section--eta">
            <h3 className="td-section-title">ETA &amp; deadlines</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-eta-panel">
              <div className="td-eta-line">
                <span className="td-eta-label">Overall ETA (customer-facing)</span>
                <span className="td-eta-value">
                  {ticket?.eta_due_at ? formatDateTimeIST(ticket.eta_due_at) : 'Not set'}
                </span>
              </div>
              <div className="td-eta-line">
                <span className="td-eta-label">Latest open-task commitment</span>
                <span className="td-eta-value">
                  {taskData?.derivedOverallEta
                    ? formatDateTimeIST(taskData.derivedOverallEta)
                    : '—'}
                </span>
              </div>
              <p className="td-eta-hint">
                Each agent sets an ETA for their assignment. The ticket&apos;s overall ETA follows the <strong>latest</strong> open
                task deadline (max). When that overall date changes, the customer is notified.
              </p>

              {isManager && taskList.length > 0 && (
                <div className="td-eta-manager-grid">
                  <span className="td-eta-subheading">Per-task ETAs (manager)</span>
                  {taskList.map((gt) => (
                    <div key={`meta-${gt.id}`} className="td-eta-task-row td-eta-task-row--manager">
                      <div className="td-eta-task-head">
                        <strong>{gt.assigned_agent_name || `Agent #${gt.assigned_agent_id}`}</strong>
                        <span className="td-text-muted td-eta-task-snippet">{gt.task_name || 'Task'}</span>
                      </div>
                      <div className="td-eta-task-controls">
                        <input
                          type="datetime-local"
                          className="td-input td-input--compact"
                          value={taskEtaDrafts[gt.id]?.due ?? ''}
                          onChange={(e) => updateTaskEtaDraft(gt.id, 'due', e.target.value)}
                        />
                        <input
                          type="text"
                          className="td-input td-input--compact"
                          placeholder="Reason (optional)"
                          value={taskEtaDrafts[gt.id]?.reason ?? ''}
                          onChange={(e) => updateTaskEtaDraft(gt.id, 'reason', e.target.value)}
                        />
                        <button
                          type="button"
                          className="td-action-pill td-action-pill--secondary td-action-pill--compact"
                          disabled={taskEtaSavingId === gt.id}
                          onClick={() => handleSaveGroupedTaskEta(gt.id, { manager: true })}
                        >
                          {taskEtaSavingId === gt.id ? 'Saving…' : 'Save'}
                        </button>
                      </div>
                      {gt.sla_due_at && (
                        <div className="td-eta-saved">
                          Saved: {formatDateTimeIST(gt.sla_due_at)}
                          {gt.task_eta_reason ? ` — ${gt.task_eta_reason}` : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isAgent && !isManager && hasGroupedTasks && myGroupedTasksForEta.length > 0 && (
                <div className="td-eta-agent-grid">
                  <span className="td-eta-subheading">Your task ETA</span>
                  {myGroupedTasksForEta.map((gt) => (
                    <div key={`ag-${gt.id}`} className="td-eta-task-row">
                      <div className="td-eta-task-head">
                        <span className="td-eta-task-work">{gt.description || gt.task_name || '—'}</span>
                      </div>
                      <div className="td-eta-task-controls">
                        <input
                          type="datetime-local"
                          className="td-input td-input--compact"
                          value={taskEtaDrafts[gt.id]?.due ?? ''}
                          onChange={(e) => updateTaskEtaDraft(gt.id, 'due', e.target.value)}
                        />
                        <input
                          type="text"
                          className="td-input td-input--flex"
                          placeholder="Reason (required, min 3 characters)"
                          value={taskEtaDrafts[gt.id]?.reason ?? ''}
                          onChange={(e) => updateTaskEtaDraft(gt.id, 'reason', e.target.value)}
                        />
                        <button
                          type="button"
                          className="td-action-pill td-action-pill--primary td-action-pill--compact"
                          disabled={taskEtaSavingId === gt.id}
                          onClick={() => handleSaveGroupedTaskEta(gt.id, { manager: false })}
                        >
                          {taskEtaSavingId === gt.id ? 'Saving…' : 'Save task ETA'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {etaUpdateAllowed && !childWorkflowLocked && !hasGroupedTasks && ticket.status !== 'closed' && ticket.status !== 'resolved' && (
          <section className="td-section td-section--eta td-section--single-ticket-eta">
            <h3 className="td-section-title">Update ETA</h3>
            <div className="td-section-divider" aria-hidden="true" />
            <div className="td-eta-panel">
              <p className="td-eta-hint td-eta-hint--intro">
                Set when you expect to resolve this ticket. The customer may be notified when the commitment changes.
              </p>
              <div className="td-eta-task-controls td-eta-task-controls--single-ticket">
                <input
                  type="datetime-local"
                  value={etaDueAtInput}
                  onChange={(e) => setEtaDueAtInput(e.target.value)}
                  className="td-input td-input--compact"
                  aria-label="Expected resolution date and time"
                />
                <input
                  type="text"
                  value={etaReasonInput}
                  onChange={(e) => setEtaReasonInput(e.target.value)}
                  placeholder="Reason for ETA update"
                  className="td-input td-input--flex"
                  aria-label="Reason for ETA update"
                />
                <button
                  type="button"
                  onClick={handleUpdateEta}
                  className="td-action-pill td-action-pill--primary td-action-pill--compact"
                  disabled={etaSaving || !etaDueAtInput || !etaReasonInput.trim()}
                >
                  {etaSaving ? 'Saving…' : 'Save ETA'}
                </button>
              </div>
            </div>
          </section>
        )}

        <section className="td-section td-section--sla">
          <h3 className="td-section-title">SLA Timer</h3>
          <div className="td-section-divider" aria-hidden="true" />
          <div className="td-sla-container">
            {serverTimerLoading ? (
              <div className="td-sla-line">Loading SLA data...</div>
            ) : (() => {
              const statusLower = String(ticket?.status || '').toLowerCase();
              const isClosedTicket = statusLower === 'closed' || !!ticket?.closed_at;
              if (isClosedTicket) return <div className="td-sla-line">CLOSED</div>;

              const responseMinutes = Number(ticket?.sla_response_time_minutes || serverTimer?.response_time_minutes || 0) || 0;
              const resolutionMinutes = Number(ticket?.sla_resolution_time_minutes || serverTimer?.resolution_time_minutes || 0) || 0;
              const hasSnapshot = responseMinutes > 0 || resolutionMinutes > 0;
              if (!serverTimer && !hasSnapshot) return <div className="td-sla-line">No SLA Snapshot</div>;

              const remainingMinutes = Number(serverTimer?.remaining_minutes ?? 0);
              const isBreached = !!serverTimer?.is_breached;
              const remainingText = serverTimer
                ? (isBreached ? `${formatSLATime(Math.abs(remainingMinutes))} OVERDUE` : formatSLATime(Math.max(0, remainingMinutes)))
                : 'Loading timer…';

              return (
                <div className="td-sla-body">
                  <div className="td-sla-line">
                    <strong>Status:</strong> <span className="td-sla-value">{STATUS_LABELS[statusLower] || (statusLower ? statusLower.charAt(0).toUpperCase() + statusLower.slice(1).replace(/_/g, ' ') : 'N/A')}</span>
                  </div>
                  <div className="td-sla-line">
                    <strong>Description:</strong>{' '}
                    <span className="td-sla-value">
                      {statusLower === 'open' 
                        ? 'This issue has been received and is awaiting assignment to a support agent.' 
                        : statusLower === 'resolved'
                        ? 'A solution has been provided for this ticket. Review and confirmation are pending.'
                        : 'This issue is currently being worked on by the assigned support team.'}
                    </span>
                  </div>
                  <div className="td-sla-line">
                    <strong>Response Time:</strong>{' '}
                    <span className="td-sla-value">
                      {ticket?.first_response_at ? (
                        `Responded in: ${formatSLATime(Math.max(0, Math.floor((new Date(ticket.first_response_at) - new Date(ticket.created_at)) / 60000)))}`
                      ) : (
                        'Waiting for response'
                      )}
                    </span>
                  </div>
                  <div className="td-sla-line">
                    <strong>Resolution Time:</strong>{' '}
                    <span className="td-sla-value">
                      {ticket?.resolved_at ? (
                        `Resolved in: ${formatSLATime(Math.max(0, Math.floor((new Date(ticket.resolved_at) - new Date(ticket.created_at)) / 60000)))}`
                      ) : (
                        isBreached ? `Resolution breached: ${remainingText}` : `Expected resolution within: ${remainingText}`
                      )}
                    </span>
                  </div>
                  <div className="td-sla-line">
                    <strong>Latest ETA:</strong>{' '}
                    <span className="td-sla-value">
                      {ticket?.eta_due_at ? formatDateTimeIST(ticket.eta_due_at) : 'Not set'}
                    </span>
                  </div>
                  {ticket?.eta_reason ? (
                    <div className="td-sla-line td-sla-line--block">
                      <strong>ETA reason:</strong>{' '}
                      <span className="td-sla-value td-sla-value--regular">{ticket.eta_reason}</span>
                    </div>
                  ) : null}
                  {hasGroupedTasks && taskData?.derivedOverallEta ? (
                    <div className="td-sla-line td-sla-line--block">
                      <strong>Grouped — max open task:</strong>{' '}
                      <span className="td-sla-value td-sla-value--regular">
                        {formatDateTimeIST(taskData.derivedOverallEta)}
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })()}
          </div>
        </section>
      </div>
      </>
      )}

      {removeAgentModal && (
        <div
          className="td-confirm-modal-overlay"
          onClick={closeRemoveAgentModal}
          role="dialog"
          aria-modal="true"
          aria-label="Remove agent from group"
        >
          <div
            className="td-confirm-modal td-remove-agent-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Remove Agent from Group Ticket</h3>
            <div className="td-remove-agent-summary">
              <div className="td-remove-agent-row">
                <span className="td-muted">Agent:</span>
                <strong>{removeAgentModal.agentName}</strong>
              </div>
              <div className="td-remove-agent-row">
                <span className="td-muted">Assigned work:</span>
                <span>{removeAgentModal.taskName}</span>
              </div>
              <div className="td-remove-agent-row">
                <span className="td-muted">Current progress:</span>
                <span>{(removeAgentModal.taskStatus || 'pending').replace(/_/g, ' ')}</span>
              </div>
              <div className="td-remove-agent-row">
                <span className="td-muted">Their deadline:</span>
                <span>{removeAgentModal.slaDueAt ? formatDate(removeAgentModal.slaDueAt) : '—'}</span>
              </div>
            </div>
            <p className="td-muted td-remove-agent-warning">
              The agent will be notified by email and in-app, and a permanent audit entry will be added to this ticket's history.
            </p>
            <label htmlFor="td-remove-agent-reason" className="td-label">
              Reason for removal <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <textarea
              id="td-remove-agent-reason"
              className="td-input"
              rows={3}
              minLength={5}
              value={removeAgentReason}
              onChange={(e) => setRemoveAgentReason(e.target.value)}
              placeholder="Explain why this agent is being removed from the ticket…"
              disabled={removingAgent}
            />
            <div className="td-confirm-actions td-confirm-actions--spaced">
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={closeRemoveAgentModal}
                disabled={removingAgent}
              >
                Cancel
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary td-btn--danger"
                onClick={handleConfirmRemoveAgent}
                disabled={removingAgent || removeAgentReason.trim().length < 5}
              >
                {removingAgent ? 'Removing…' : 'Confirm Removal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEscalateModal && (
        <div className="td-confirm-modal-overlay" onClick={() => setShowEscalateModal(false)}>
          <div className="td-confirm-modal td-escalate-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{isManager ? 'Escalate Ticket' : (escalateAssignmentMode === 'to_manager' ? 'Escalate to Manager' : 'Direct Escalation')}</h3>
            <p>{isManager ? `Move ownership from ${currentTicketLevel} to the next support level.` : (escalateAssignmentMode === 'to_manager' ? `Request manager to re-triage and escalate this ticket from ${currentTicketLevel}.` : `Directly escalate this ticket from ${currentTicketLevel} to a specific level/agent.`)}</p>
            <div className="td-escalate-fields">
              {!isManager && (
                <>
                  <label htmlFor="td-escalate-mode">Assignment Mode</label>
                  <select
                    id="td-escalate-mode"
                    value={escalateAssignmentMode}
                    onChange={(e) => {
                      const newMode = e.target.value;
                      setEscalateAssignmentMode(newMode);
                      if (newMode === 'to_manager') {
                        setEscalateTargetLevel('MANAGER');
                      } else if (newMode === 'auto') {
                        // Pick the first non-MANAGER level for auto
                        const nextLevel = allowedEscalationLevels.find(l => l !== 'MANAGER') || allowedEscalationLevels[0] || '';
                        setEscalateTargetLevel(nextLevel);
                      } else {
                        // Reset target level to first allowed if switching
                        if (escalateTargetLevel === 'MANAGER' || !escalateTargetLevel) {
                          setEscalateTargetLevel(allowedEscalationLevels.find(l => l !== 'MANAGER') || allowedEscalationLevels[0] || '');
                        }
                      }
                    }}
                    className="td-select"
                  >
                    <option value="auto">Automatic Assignment</option>
                    <option value="manual">Manual Assignment</option>
                    <option value="to_manager">Escalate to Manager (Request Review)</option>
                  </select>
                </>
              )}

              {(isManager || escalateAssignmentMode === 'manual') && (
                <>
                  <label htmlFor="td-escalate-level">Target Support Level</label>
                  <select
                    id="td-escalate-level"
                    value={escalateTargetLevel}
                    onChange={(e) => setEscalateTargetLevel(e.target.value)}
                    className="td-select"
                  >
                    {allowedEscalationLevels
                      .filter(lvl => isManager || escalateAssignmentMode !== 'to_manager' ? lvl !== 'MANAGER' : true)
                      .map((level) => (
                      <option key={level} value={level}>
                        {String(level || '').toUpperCase() === 'MANAGER' ? 'Manager' : String(level || '').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {escalateAssignmentMode === 'manual' && (
                <>
                  <label htmlFor="td-escalate-agent">Select Agent ({escalateTargetLevel})</label>
                  <select
                    id="td-escalate-agent"
                    value={escalateSelectedAgentId}
                    onChange={(e) => setEscalateSelectedAgentId(e.target.value)}
                    className="td-select"
                    disabled={loadingAgentsAtEscalateLevel}
                  >
                    <option value="">{loadingAgentsAtEscalateLevel ? 'Loading agents...' : agentsAtEscalateLevel.filter(a => a.id !== (user?.agentId || user?.id)).length === 0 ? 'No agents available' : 'Choose an agent...'}</option>
                    {agentsAtEscalateLevel
                      .filter(agent => agent.id !== (user?.agentId || user?.id))
                      .map(agent => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name} ({agent.availability_status})
                        </option>
                      ))}
                  </select>
                  {!loadingAgentsAtEscalateLevel && agentsAtEscalateLevel.filter(a => a.id !== (user?.agentId || user?.id)).length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '-8px', marginBottom: '12px' }}>
                      No other agents found at this level for assignment.
                    </div>
                  )}
                </>
              )}
              <label htmlFor="td-escalate-reason">Reason (required)</label>
              <textarea
                id="td-escalate-reason"
                value={escalateReason}
                onChange={(e) => setEscalateReason(e.target.value)}
                className="td-input"
                rows={isManager ? 4 : 2}
                placeholder="Provide a clear reason for escalation"
              />
              {/* Work done field removed per user request */}
            </div>
            <div className="td-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={() => setShowEscalateModal(false)}
                disabled={escalateSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary"
                onClick={handleSubmitEscalation}
                disabled={escalateSubmitting}
              >
                {escalateSubmitting ? 'Submitting...' : (isManager || escalateAssignmentMode !== 'to_manager' ? 'Escalate Ticket' : 'Request Escalation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showResolutionModal && (
        <div className="td-confirm-modal-overlay" onClick={() => setShowResolutionModal(false)}>
          <div className="td-confirm-modal td-resolution-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-resolution-title">
              {isParentResolutionView
                ? `Parent Ticket #${ticket.parent_ticket_id} Resolution`
                : resolutionMode === 'resolve'
                ? 'Capture Resolution'
                : resolutionMode === 'edit'
                  ? 'Edit Resolution'
                  : 'Ticket Resolution'}
            </h3>
            {resolutionMode === 'resolve' ? (
              <p className="td-resolution-subtext">Complete structured resolution details before marking this ticket as resolved.</p>
            ) : (
              <p className="td-resolution-subtext">
                {isParentResolutionView
                  ? 'Use this parent resolution as guidance while resolving this child ticket.'
                  : 'Resolution details are reusable for linked tickets, customer updates, and knowledge reuse.'}
              </p>
            )}
            {resolutionMode === 'view' ? (
              <div className="td-resolution-readonly">
                {hasDisplayedResolutionDetails ? (
                  <>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Summary</span>
                      <span className="td-resolution-value">{displayedResolutionDetails?.resolution_summary || '—'}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Fix type</span>
                      <span className="td-resolution-value">{displayedResolutionDetails?.fix_type || '—'}</span>
                    </div>
                    <div className="td-resolution-row">
                      <span className="td-resolution-label">Root cause</span>
                      <span className="td-resolution-value">{displayedResolutionDetails?.root_cause || '—'}</span>
                    </div>
                    {!isCustomer && (
                      <>
                        <div className="td-resolution-row">
                          <span className="td-resolution-label">Internal steps</span>
                          <span className="td-resolution-value td-resolution-pre">{displayedResolutionDetails?.internal_steps || '—'}</span>
                        </div>
                        <div className="td-resolution-row">
                          <span className="td-resolution-label">Reference</span>
                          <span className="td-resolution-value">{displayedResolutionDetails?.reference_data || '—'}</span>
                        </div>
                        {displayedResolutionDetails?.attachment_name && (
                          <div className="td-resolution-row">
                            <span className="td-resolution-label">Attachment</span>
                            <span className="td-resolution-value">
                              <button
                                type="button"
                                className="td-action-btn td-action-btn--secondary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                onClick={async () => {
                                  try {
                                    const response = await authenticatedFetch(
                                      buildApiUrl(`/api/tickets/${ticketId}/resolution-attachment`),
                                      { method: 'GET', headers: getAuthHeaders() }
                                    );
                                    if (!response.ok) throw new Error('Failed to open attachment');
                                    const blob = await response.blob();
                                    const url = URL.createObjectURL(blob);
                                    window.open(url, '_blank');
                                    // Revoke after a delay so the new tab has time to load
                                    setTimeout(() => URL.revokeObjectURL(url), 60000);
                                  } catch (err) {
                                    showInlineNotification('Failed to open attachment.', 'error', 3000);
                                  }
                                }}
                              >
                                <span aria-hidden="true">📎</span>
                                <span>{displayedResolutionDetails.attachment_name}</span>
                              </button>
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="td-muted">
                    {isParentResolutionView
                      ? 'Parent ticket resolution has not been captured yet.'
                      : 'Resolution details have not been captured yet.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="td-resolution-form">
                <div className="td-resolution-field" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="td-btn td-btn-secondary"
                    onClick={loadResolutionSampleData}
                  >
                    Load data
                  </button>
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-summary">Resolution summary (customer visible) *</label>
                  <textarea
                    id="td-resolution-summary"
                    className="td-resolution-input"
                    rows={3}
                    value={resolutionForm.resolution_summary}
                    onChange={(e) => handleResolutionFormChange('resolution_summary', e.target.value)}
                    placeholder="Explain what was fixed in clear user-facing language."
                  />
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-steps">Internal resolution steps (agent only) *</label>
                  <textarea
                    id="td-resolution-steps"
                    className="td-resolution-input"
                    rows={4}
                    value={resolutionForm.internal_steps}
                    onChange={(e) => handleResolutionFormChange('internal_steps', e.target.value)}
                    placeholder="Describe detailed internal troubleshooting and actions taken."
                  />
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-fix-type">Fix type *</label>
                  <select
                    id="td-resolution-fix-type"
                    className="td-resolution-input"
                    value={resolutionForm.fix_type}
                    onChange={(e) => handleResolutionFormChange('fix_type', e.target.value)}
                  >
                    {RESOLUTION_FIX_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-root-cause">Root cause (optional)</label>
                  <textarea
                    id="td-resolution-root-cause"
                    className="td-resolution-input"
                    rows={2}
                    value={resolutionForm.root_cause}
                    onChange={(e) => handleResolutionFormChange('root_cause', e.target.value)}
                    placeholder="Optional root cause statement."
                  />
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-reference">Reference (optional)</label>
                  <input
                    id="td-resolution-reference"
                    type="text"
                    className="td-resolution-input"
                    value={resolutionForm.reference_data}
                    onChange={(e) => handleResolutionFormChange('reference_data', e.target.value)}
                    placeholder="Document, patch, link, or version reference."
                  />
                </div>
                <div className="td-resolution-field">
                  <label htmlFor="td-resolution-attachment">Attach file (optional)</label>
                  <input
                    id="td-resolution-attachment"
                    type="file"
                    className="td-resolution-input"
                    accept="image/*,.pdf,.txt,.doc,.docx,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setResolutionAttachment(e.target.files?.[0] || null)}
                  />
                  <div className="td-muted" style={{ marginTop: 6 }}>
                    Agent-only. Upload supporting notes or evidence (images/PDF/TXT/DOC/DOCX).
                  </div>
                </div>
              </div>
            )}
            <div className="td-confirm-actions">
              {resolutionMode === 'view' && isAgent && canEditResolution && (
                <button
                  type="button"
                  className="td-btn td-btn-secondary"
                  onClick={() => setResolutionMode('edit')}
                >
                  Edit
                </button>
              )}
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={() => setShowResolutionModal(false)}
                disabled={resolutionSaving}
              >
                Close
              </button>
              {resolutionMode === 'edit' && (
                <button
                  type="button"
                  className="td-btn td-btn-primary"
                  onClick={saveResolutionDetails}
                  disabled={resolutionSaving}
                >
                  {resolutionSaving ? 'Saving...' : 'Save Resolution'}
                </button>
              )}
              {resolutionMode === 'resolve' && (
                <button
                  type="button"
                  className="td-btn td-btn-primary"
                  onClick={async () => {
                    const saved = await saveResolutionDetails();
                    if (saved) setShowResolutionModal(false);
                  }}
                  disabled={resolutionSaving}
                >
                  {resolutionSaving ? 'Saving...' : 'Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Attachment Modal */}
      {showAttachmentModal && (
        <div className="attachment-modal-overlay" onClick={() => setShowAttachmentModal(false)}>
          <div className="attachment-modal" onClick={(e) => e.stopPropagation()}>
            <div className="attachment-modal-header">
              <h3>📎 {ticket.attachment_name}</h3>
              <button 
                className="close-attachment-modal-btn"
                onClick={() => setShowAttachmentModal(false)}
              >
                ×
              </button>
            </div>
            <div className="attachment-modal-content">
              {attachmentPreviewLoading ? (
                <div className="attachment-modal-download">
                  <p>Loading attachment preview...</p>
                </div>
              ) : attachmentPreviewError ? (
                <div className="attachment-modal-download">
                  <p>{attachmentPreviewError}</p>
                </div>
              ) : ticket.attachment_type && ticket.attachment_type.startsWith('image/') && attachmentPreviewUrl ? (
                <img 
                  src={attachmentPreviewUrl}
                  alt={ticket.attachment_name || 'Attachment'}
                  className="attachment-modal-image"
                />
              ) : ticket.attachment_type && ticket.attachment_type === 'application/pdf' && attachmentPreviewUrl ? (
                <iframe
                  src={attachmentPreviewUrl}
                  title={ticket.attachment_name || 'Attachment'}
                  className="attachment-modal-pdf"
                  width="100%"
                  height="600"
                />
              ) : attachmentPreviewText ? (
                <div className="attachment-modal-text-wrap">
                  <pre className="attachment-modal-text">{attachmentPreviewText}</pre>
                  <a 
                    href={attachmentPreviewUrl || '#'}
                    download={ticket.attachment_name || 'attachment'}
                    className="download-attachment-btn"
                  >
                    📥 Download File
                  </a>
                </div>
              ) : (
                <div className="attachment-modal-download">
                  <p>This file type cannot be previewed directly.</p>
                  <a 
                    href={attachmentPreviewUrl || '#'}
                    download={ticket.attachment_name || 'attachment'}
                    className="download-attachment-btn"
                  >
                    📥 Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showCloseConfirmModal && (
        <div className="td-confirm-modal-overlay" onClick={() => setShowCloseConfirmModal(false)}>
          <div className="td-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Close Ticket</h3>
            <p>Are you sure you want to close this ticket?</p>
            <div className="td-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={() => setShowCloseConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary"
                onClick={handleConfirmClose}
              >
                Yes, Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showCustomerResolutionConfirm && isCustomer && ticket?.status === 'resolved' && (
        <div
          className="td-confirm-modal-overlay"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="td-confirm-modal td-resolution-modal td-customer-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-resolution-title">Confirm Resolution</h3>
            <p className="td-resolution-subtext">
              Please confirm whether this issue is fully resolved.
            </p>

            <div className="td-customer-confirm-options" role="radiogroup" aria-label="Resolution confirmation">
              <label className="td-customer-confirm-option">
                <input
                  type="radio"
                  name="customerResolutionConfirm"
                  value="yes"
                  checked={customerResolutionAnswer === 'yes'}
                  onChange={() => setCustomerResolutionAnswer('yes')}
                  disabled={customerConfirmSubmitting}
                />
                <span>Yes</span>
              </label>
              <label className="td-customer-confirm-option">
                <input
                  type="radio"
                  name="customerResolutionConfirm"
                  value="no"
                  checked={customerResolutionAnswer === 'no'}
                  onChange={() => setCustomerResolutionAnswer('no')}
                  disabled={customerConfirmSubmitting}
                />
                <span>No</span>
              </label>
            </div>

            {customerResolutionAnswer === 'no' && (
              <div className="td-confirm-reason">
                <label className="td-confirm-reason-label">
                  Please describe what is still not working (required)
                </label>
                <textarea
                  value={customerRejectionReason}
                  onChange={(e) => setCustomerRejectionReason(e.target.value)}
                  rows={4}
                  className="td-resolution-input"
                  placeholder="Example: The VPN still disconnects after 5 minutes and the login prompt keeps reappearing."
                  disabled={customerConfirmSubmitting}
                />
                {String(customerRejectionReason || '').trim().length > 0 &&
                  String(customerRejectionReason || '').trim().length < 3 && (
                    <div className="td-confirm-error">Please enter at least 3 characters.</div>
                  )}
              </div>
            )}

            <div className="td-confirm-actions td-confirm-actions--spaced td-customer-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={() => {
                  setShowCustomerResolutionConfirm(false);
                  setCustomerResolutionConfirmDeferred(true);
                  setCustomerResolutionAnswer('');
                  setCustomerRejectionReason('');
                }}
                disabled={customerConfirmSubmitting}
              >
                Review later
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary td-customer-confirm-submit"
                onClick={submitCustomerResolutionConfirmation}
                disabled={
                  customerConfirmSubmitting ||
                  (customerResolutionAnswer !== 'yes' && customerResolutionAnswer !== 'no') ||
                  (customerResolutionAnswer === 'no' && String(customerRejectionReason || '').trim().length < 3)
                }
              >
                {customerConfirmSubmitting ? 'Submitting…' : 'Submit confirmation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNotifyModal && (
        <div className="td-confirm-modal-overlay" onClick={() => setShowNotifyModal(false)}>
          <div className="td-confirm-modal td-resolution-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-resolution-title">Notify Customer</h3>
            <p className="td-resolution-subtext">
              Send an update without closing the ticket. This will be saved in the conversation history and emailed to the customer.
            </p>
            <div className="td-resolution-form">
              <div className="td-resolution-field">
                <label htmlFor="td-notify-message">Message *</label>
                <textarea
                  id="td-notify-message"
                  className="td-resolution-input"
                  rows={4}
                  value={notifyMessage}
                  onChange={(e) => setNotifyMessage(e.target.value)}
                  placeholder="Share progress, next steps, or request user action."
                />
              </div>
              <div className="td-resolution-field">
                <label htmlFor="td-notify-reference">Reference / link (optional)</label>
                <input
                  id="td-notify-reference"
                  type="text"
                  className="td-resolution-input"
                  value={notifyReference}
                  onChange={(e) => setNotifyReference(e.target.value)}
                  placeholder="Optional link, version, or reference."
                />
              </div>
            </div>
            <div className="td-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-secondary"
                onClick={() => setShowNotifyModal(false)}
                disabled={notifySending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="td-btn td-btn-primary"
                onClick={handleNotifyCustomerSubmit}
                disabled={notifySending}
              >
                {notifySending ? 'Sending…' : 'Send update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCustomer && activeNotice && (
        <div className="td-confirm-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="td-confirm-modal td-resolution-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="td-resolution-title">Support update</h3>
            <p className="td-resolution-subtext">
              Please confirm you have viewed this update. This is recorded for auditing.
            </p>
            <div className="td-resolution-readonly">
              <div className="td-resolution-row">
                <span className="td-resolution-label">Message</span>
                <span className="td-resolution-value td-resolution-pre">{String(activeNotice.message || '').trim() || '—'}</span>
              </div>
              <div className="td-resolution-row">
                <span className="td-resolution-label">Sent at</span>
                <span className="td-resolution-value">{activeNotice.created_at ? formatDateTimeIST(activeNotice.created_at) : '—'}</span>
              </div>
            </div>
            <div className="td-confirm-actions">
              <button
                type="button"
                className="td-btn td-btn-primary"
                onClick={acknowledgeActiveNotice}
                disabled={ackSubmitting}
              >
                {ackSubmitting ? 'Saving…' : 'I have viewed this'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetailPage;
