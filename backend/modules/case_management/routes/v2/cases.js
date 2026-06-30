/**
 * HCMS Case Management API (v2)
 * Maps HCMS case fields to the existing tickets table.
 * Base: /api/v2/cases
 */
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../../../shared/database/database');
const { notifyTicketCreated, notifyCommentAdded, notifyStatusChanged, insertAndFanOut } = require('../../services/appNotificationService');
const caseNotificationService = require('../../services/caseNotificationService');
const { escalateCase } = require('../../services/escalationService');
const {
  getConsentConfig,
  canBypassConsent,
  getPendingConsentRequest,
  getApprovedConsentRequestForLevel,
  createConsentRequest,
  notifyEmployeeOfConsentRequest,
  respondToConsentRequest,
  getPendingConsentRequestsForEmployee,
  getConsentHistoryForCase,
  getUnacknowledgedConsentResponse,
  acknowledgeConsentRequest
} = require('../../services/escalationConsentService');
const { validateLevelAssignment, getNextEscalationLevel } = require('../../services/assignmentService');
const ticketActivityService = require('../../services/ticketActivityService');
const { isEmployee, isDepartmentHead, canAccessCaseDetail, canAccessInternalContent, isHrOrAdmin } = require('../../services/caseAccess');
const {
  isSpecialCaseType,
  canViewCase,
  canEditCase,
  canComment,
  canPerformActions,
  canResolveCase,
  canCloseCase,
  getCasePermissions,
  maskCaseData,
  maskAnonymousName,
  isAnonymousCase,
  getVisibilityFilter,
  isSystemAdmin,
  isCaseCreator
} = require('../../services/specialCaseAccessService');

// Migration: Fix ticket_messages foreign key to reference cases instead of tickets
async function fixTicketMessagesForeignKey() {
  try {
    // Drop existing foreign key constraint
    await pool.execute('ALTER TABLE ticket_messages DROP FOREIGN KEY ticket_messages_ibfk_1');
    console.log('[v2/cases] Dropped old foreign key constraint');
  } catch (e) {
    if (e.code !== 'ER_CANT_DROP_FIELD_OR_KEY') {
      console.log('[v2/cases] Error dropping foreign key:', e.message);
    }
  }
  
  try {
    // Add new foreign key constraint referencing cases table
    await pool.execute('ALTER TABLE ticket_messages ADD CONSTRAINT fk_case_messages_case FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE');
    console.log('[v2/cases] Added new foreign key constraint to cases table');
  } catch (e) {
    if (e.code !== 'ER_DUP_ENTRY' && e.code !== 'ER_FOREIGN_KEY_TO_EXISTING_KEY') {
      console.log('[v2/cases] Error adding new foreign key:', e.message);
    }
  }
}

// Migration: Add message_id column to case_attachments to link attachments to messages
// Supports both ticket_messages.id (int) and ticket_info_requests.message_id (uuid)
async function addMessageIdToAttachments() {
  try {
    // Find and drop all foreign key constraints on message_id column
    const [fkRows] = await pool.execute(
      `SELECT CONSTRAINT_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'case_attachments'
         AND COLUMN_NAME = 'message_id'
         AND CONSTRAINT_NAME <> 'PRIMARY'`
    );
    for (const fk of fkRows) {
      try {
        await pool.execute(`ALTER TABLE case_attachments DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`);
        console.log(`[v2/cases] Dropped foreign key ${fk.CONSTRAINT_NAME} on case_attachments.message_id`);
      } catch (dropErr) {
        console.log(`[v2/cases] Error dropping FK ${fk.CONSTRAINT_NAME}:`, dropErr.message);
      }
    }
  } catch (e) {
    console.log('[v2/cases] Error querying foreign keys:', e.message);
  }

  try {
    await pool.execute('ALTER TABLE case_attachments ADD COLUMN message_id VARCHAR(255) NULL');
    console.log('[v2/cases] Added message_id column to case_attachments');
  } catch (e) {
    if (e.code !== 'ER_DUP_FIELDNAME' && e.code !== 'ER_LOCK_DEADLOCK') {
      console.log('[v2/cases] Error adding message_id column:', e.message);
    }
  }

  // Ensure column is VARCHAR(255) even if it was previously added as INT
  try {
    const [colRows] = await pool.execute(
      `SELECT DATA_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'case_attachments'
         AND COLUMN_NAME = 'message_id'`
    );
    const currentType = colRows[0]?.DATA_TYPE;
    console.log('[v2/cases] Current case_attachments.message_id type:', currentType);

    if (currentType && currentType.toLowerCase() !== 'varchar') {
      try {
        await pool.execute('ALTER TABLE case_attachments MODIFY COLUMN message_id VARCHAR(255) NULL');
        console.log('[v2/cases] Modified message_id to VARCHAR(255) via MODIFY');
      } catch (modifyErr) {
        console.log('[v2/cases] MODIFY failed, trying CHANGE COLUMN:', modifyErr.message);
        await pool.execute('ALTER TABLE case_attachments CHANGE COLUMN message_id message_id VARCHAR(255) NULL');
        console.log('[v2/cases] Modified message_id to VARCHAR(255) via CHANGE COLUMN');
      }
    }
  } catch (e) {
    console.log('[v2/cases] Error modifying message_id column:', e.message);
  }
}

fixTicketMessagesForeignKey().catch(err => console.error('[v2/cases] Migration failed:', err));
addMessageIdToAttachments().catch(err => console.error('[v2/cases] Message ID migration failed:', err));
const { authenticate, authorizeRoles } = require('../../../auth/middleware/auth.middleware');
const { ROLES } = require('../../../auth/constants/roles');
const { optionalTenantContext } = require('../../../shared/middleware/tenant');

const router = express.Router();

// Add CORS headers to all responses
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize SLA timers for a newly created ticket
async function initializeSLATimers(ticketId, category, priority) {
  try {
    if (!category) {
      console.log(`[SLA] No category (department) provided for ticket ${ticketId}, skipping SLA timer initialization`);
      return;
    }

    // Find department ID by name (category is the department name)
    const [departments] = await pool.execute(
      `SELECT id FROM departments WHERE name = ? LIMIT 1`,
      [category]
    );

    if (departments.length === 0) {
      console.log(`[SLA] No department ID found for category '${category}', skipping SLA timer initialization`);
      return;
    }

    const departmentId = departments[0].id;

    // SLA is department-based only; default priority level is P2
    const slaPriority = 'P2';

    // Get SLA configuration for this department
    const [slaConfigs] = await pool.execute(
      `SELECT id, response_time_minutes, resolution_time_minutes, escalation_warning_threshold_minutes, escalation_breach_threshold_minutes
       FROM sla_configurations
       WHERE department_id = ? AND is_active = TRUE
       LIMIT 1`,
      [departmentId]
    );

    if (slaConfigs.length === 0) {
      console.log(`[SLA] No SLA configuration found for department ${departmentId}`);
      return;
    }

    const slaConfig = slaConfigs[0];
    const now = new Date();

    console.log(`[SLA] Config for ticket ${ticketId}: response_time=${slaConfig.response_time_minutes}min, resolution_time=${slaConfig.resolution_time_minutes}min, warning_threshold=${slaConfig.escalation_warning_threshold_minutes}min`);

    // Calculate warning threshold (default: response_time - 60 if not set)
    const warningThreshold = slaConfig.escalation_warning_threshold_minutes || (slaConfig.response_time_minutes - 60);
    const breachThreshold = slaConfig.escalation_breach_threshold_minutes || slaConfig.resolution_time_minutes;

    // Create response timer (uses response_time_minutes)
    const responseDeadline = new Date(now.getTime() + slaConfig.response_time_minutes * 60000);
    console.log(`[SLA] Response deadline: ${responseDeadline} (${slaConfig.response_time_minutes}min from ${now})`);
    await pool.execute(
      `INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
       VALUES (?, ?, 'response', ?, ?, 'active')`,
      [ticketId, slaConfig.id, now, responseDeadline]
    );

    // Create resolution timer (uses resolution_time_minutes)
    const resolutionDeadline = new Date(now.getTime() + slaConfig.resolution_time_minutes * 60000);
    console.log(`[SLA] Resolution deadline: ${resolutionDeadline} (${slaConfig.resolution_time_minutes}min from ${now})`);
    await pool.execute(
      `INSERT INTO sla_timers (ticket_id, sla_configuration_id, timer_type, start_time, sla_deadline, status)
       VALUES (?, ?, 'resolution', ?, ?, 'active')`,
      [ticketId, slaConfig.id, now, resolutionDeadline]
    );

    console.log(`[SLA] Initialized timers for ticket ${ticketId}: response at ${slaConfig.response_time_minutes}min, resolution at ${slaConfig.resolution_time_minutes}min`);
  } catch (error) {
    console.error('[SLA] Error initializing SLA timers:', error);
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../../../../uploads/case_attachments');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('image/') || file.mimetype.startsWith('application/');

    if (extname || mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'));
    }
  }
});

// Field mapping: HCMS → tickets table
const STATUS_MAP = {
  open: 'new',
  new: 'new',
  in_progress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
  escalated: 'escalated',
  waiting: 'waiting',
  rejected: 'rejected'
};

const PRIORITY_MAP = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'urgent'
};

const STATUS_REVERSE = {
  new: 'open',
  in_progress: 'in_progress',
  resolved: 'resolved',
  closed: 'closed',
  escalated: 'escalated',
  waiting: 'waiting',
  rejected: 'rejected'
};

const PRIORITY_REVERSE = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'critical'
};

function toCase(ticket) {
  if (!ticket) return null;
  return {
    id: ticket.id,
    ticket_id: ticket.ticket_code || `TKT-${ticket.id}`,
    title: ticket.title || 'Untitled',
    description: ticket.description,
    category: ticket.category || 'General',
    subcategory: ticket.subcategory || '',
    priority: PRIORITY_REVERSE[ticket.priority] || ticket.priority || 'medium',
    status: STATUS_REVERSE[ticket.status] || ticket.status || 'open',
    reporting_mode: ticket.reporting_mode || 'normal',
    reporter_id: ticket.created_by,
    reporter_name: ticket.reporter_name || ticket.name,
    assignee_id: ticket.assigned_to,
    assignee_name: ticket.assignee_name,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
    closed_at: ticket.closed_at,
    employee_closed: ticket.employee_closed || 0,
    satisfaction_rating: ticket.satisfaction_rating,
    reopened_at: ticket.reopened_at,
    reopened_reason: ticket.reopened_reason,
    dept_review_status: ticket.dept_review_status || null,
    escalation_level: ticket.escalation_level || 'L1',
    escalation_count: ticket.escalation_count || 0,
    is_escalated: ticket.is_escalated || 0,
    last_escalated_at: ticket.last_escalated_at || null,
    escalation_reason: ticket.escalation_reason || null,
    response_sla_deadline: ticket.response_sla_deadline,
    resolution_sla_deadline: ticket.resolution_sla_deadline
  };
}

function maskAnonymousComments(comments, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(comments) || !createdBy) return comments;
  return comments.map(c => {
    if (Number(c.sender_id) === Number(createdBy)) {
      return { ...c, sender_name: 'Anonymous Employee', sender_id: null };
    }
    return c;
  });
}

function maskAnonymousHistory(history, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(history) || !createdBy) return history;
  return history.map(h => {
    if (Number(h.performed_by) === Number(createdBy)) {
      return { ...h, performed_by_name: 'Anonymous Employee', performed_by: null };
    }
    return h;
  });
}

function maskAnonymousNotes(notes, isAnonymous, reporterName) {
  if (!isAnonymous || !Array.isArray(notes) || !reporterName) return notes;
  return notes.map(n => {
    if (String(n.author || '').toLowerCase() === String(reporterName).toLowerCase()) {
      return { ...n, author: 'Anonymous Employee' };
    }
    return n;
  });
}

function maskAnonymousInfoRequests(requests, isAnonymous, createdBy) {
  if (!isAnonymous || !Array.isArray(requests) || !createdBy) return requests;
  return requests.map(r => {
    if (Number(r.requester_id) === Number(createdBy)) {
      return { ...r, requester_name: 'Anonymous Employee', requester_id: null };
    }
    return r;
  });
}

// ─── Ensure reporting_mode column exists (additive migration) ───
async function ensureSchema() {
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN category VARCHAR(100)`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN subcategory VARCHAR(100)`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN reporting_mode VARCHAR(50) DEFAULT 'normal'`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN reporter_id INT`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN created_by INT`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN assigned_to INT`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN closed_at DATETIME`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN employee_closed TINYINT(1) DEFAULT 0`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN satisfaction_rating INT`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN reopened_at DATETIME`);
  } catch (e) { /* ignore duplicate */ }
  try {
    await pool.execute(`ALTER TABLE cases ADD COLUMN reopened_reason TEXT`);
  } catch (e) { /* ignore duplicate */ }
}
ensureSchema().catch(() => {});

// ─── Middleware ───
router.use(optionalTenantContext);
router.use(authenticate);

// ─── GET /api/v2/cases/dashboard ───
router.get('/dashboard', async (req, res) => {
  try {
    const user = req.user;

    let whereClause = 'WHERE 1=1';
    const params = [];

    // Role-based filtering
    if (isEmployee(user)) {
      whereClause += ' AND t.created_by = ?';
      params.push(user.id);
    }

    // Special case visibility filter
    if (!isSystemAdmin(user)) {
      const { sql: visibilitySql, params: visibilityParams } = getVisibilityFilter('t', user.id);
      whereClause += visibilitySql;
      params.push(...visibilityParams);
    }

    // Get total tickets
    const [total] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause}`,
      params
    );

    // Get open tickets
    const [open] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause} AND t.status = 'new'`,
      params
    );

    // Get in progress tickets
    const [inProgress] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause} AND t.status = 'in_progress'`,
      params
    );

    // Get resolved tickets (ready for employee to close)
    const [resolved] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause} AND t.status = 'closed' AND t.closed_at IS NOT NULL`,
      params
    );

    // Get closed tickets (employee closed)
    const [closed] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause} AND t.status = 'closed' AND t.employee_closed = 1`,
      params
    );

    // Get rejected tickets
    const [rejected] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases t ${whereClause} AND t.status = 'rejected'`,
      params
    );

    // Calculate average resolution time (in hours)
    const [resolutionTimes] = await pool.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.closed_at)) as avg_hours
       FROM cases t
       ${whereClause} AND t.status = 'closed' AND t.closed_at IS NOT NULL`,
      params
    );

    const avgResolutionTime = resolutionTimes[0].avg_hours
      ? Math.round(resolutionTimes[0].avg_hours * 10) / 10
      : 0;

    // Get recent tickets (last 5)
    const [recent] = await pool.execute(
      `SELECT t.*, u.name as reporter_name
       FROM cases t
       LEFT JOIN users u ON t.created_by = u.id
       ${whereClause}
       ORDER BY t.created_at DESC LIMIT 5`,
      params
    );

    const maskedRecent = await Promise.all(
      recent.map(async (row) => await maskCaseData(toCase(row), user))
    );

    res.json({
      success: true,
      metrics: {
        total: total[0].count,
        open: open[0].count,
        inProgress: inProgress[0].count,
        resolved: resolved[0].count,
        closed: closed[0].count,
        rejected: rejected[0].count,
        avgResolutionTime: avgResolutionTime
      },
      recentTickets: maskedRecent
    });
  } catch (error) {
    console.error('[v2/cases] GET /dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
});

// ─── GET /api/v2/cases ───
router.get('/', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const { status, priority, ownOnly, escalatedOnly, assignedOnly, escalated } = req.query;

    let sql = `SELECT t.*, u.name as reporter_name, u.email as reporter_email,
               au.name as assignee_name,
               st_response.sla_deadline as response_sla_deadline,
               st_resolution.sla_deadline as resolution_sla_deadline
               FROM cases t
               LEFT JOIN users u ON t.created_by = u.id
               LEFT JOIN users au ON t.assigned_to = au.id
               LEFT JOIN sla_timers st_response ON t.id = st_response.ticket_id AND st_response.timer_type = 'response' AND st_response.status = 'active'
               LEFT JOIN sla_timers st_resolution ON t.id = st_resolution.ticket_id AND st_resolution.timer_type = 'resolution' AND st_resolution.status = 'active'
               WHERE 1=1`;
    const params = [];

    // Role-based filtering
    if (isEmployee(user) || ownOnly === 'true') {
      sql += ` AND t.created_by = ?`;
      params.push(user.id);
    } else if (assignedOnly === 'true') {
      // Generic filter for any role that should only see cases assigned to them
      // (e.g. HR Manager, CEO). Does not hardcode any role or escalation level.
      sql += ` AND t.assigned_to = ?`;
      params.push(user.id);
      // When combined with assignedOnly, the escalated flag splits directly assigned
      // tickets from escalated tickets so each section shows distinct work.
      if (escalated === 'true') {
        sql += ` AND t.is_escalated = TRUE`;
      } else if (escalated === 'false') {
        sql += ` AND t.is_escalated = FALSE`;
      }
    } else if (isDepartmentHead(user)) {
      // Department heads see all tickets assigned to them
      sql += ` AND t.assigned_to = ?`;
      params.push(user.id);
    } else if (escalatedOnly === 'true') {
      // Non-DH users using escalatedOnly see all escalated tickets
      sql += ` AND t.status = 'escalated'`;
    }
    // HR and admin see all

    // Special case visibility: confidential, sensitive, anonymous tickets require
    // explicit view permission for the current escalation level and ticket type.
    // Admins and the ticket creator always retain visibility.
    if (!isSystemAdmin(user)) {
      const { sql: visibilitySql, params: visibilityParams } = getVisibilityFilter('t', user.id);
      sql += visibilitySql;
      params.push(...visibilityParams);
    }

    // Status filter (map HCMS status → ticket status)
    if (status) {
      const mapped = STATUS_MAP[status];
      if (mapped) {
        sql += ` AND t.status = ?`;
        params.push(mapped);
      }
    }

    // Priority filter
    if (priority) {
      const mapped = PRIORITY_MAP[priority];
      if (mapped) {
        sql += ` AND t.priority = ?`;
        params.push(mapped);
      }
    }

    sql += ` ORDER BY t.created_at DESC`;

    const [rows] = await pool.execute(sql, params);

    const maskedCases = await Promise.all(
      rows.map(async (row) => await maskCaseData(toCase(row), user))
    );

    res.json({
      success: true,
      cases: maskedCases,
      count: maskedCases.length
    });
  } catch (error) {
    console.error('[v2/cases] GET / error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch cases' });
  }
});

// ─── POST /api/v2/cases ───
router.post('/', async (req, res) => {
  try {
    const user = req.user;
    const { title, description, category, subcategory, priority, reporting_mode, department } = req.body;

    // Validation
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title is required and must be a non-empty string'
      });
    }

    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Description is required and must be a non-empty string'
      });
    }

    if (title.trim().length > 500) {
      return res.status(400).json({
        success: false,
        message: 'Title must be less than 500 characters'
      });
    }

    if (description.trim().length > 10000) {
      return res.status(400).json({
        success: false,
        message: 'Description must be less than 10000 characters'
      });
    }

    if (priority && !['low', 'medium', 'high', 'critical'].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid priority. Must be one of: low, medium, high, critical'
      });
    }

    const ticketPriority = PRIORITY_MAP[priority] || 'medium';
    const ticketStatus = 'new';
    const mode = reporting_mode || 'normal';
    const tenantId = user.tenantId || 1;

    // Dynamic assignment: resolve L1 assignee from escalation configuration
    console.log('[v2/cases] Creating case for tenant', tenantId, 'creator', user.id, 'role', user.role);

    // Diagnostic: dump all active L1 assignments for this tenant
    const [l1Assignments] = await pool.execute(
      `SELECT ela.id, ela.user_id, u.name as user_name, u.role as user_role, ela.assigned_at, ela.is_active, el.id as level_id, el.level
       FROM escalation_level_assignments ela
       JOIN escalation_levels el ON ela.escalation_level_id = el.id
       JOIN users u ON ela.user_id = u.id
       WHERE el.tenant_id = ? AND el.level = 'L1' AND el.is_active = TRUE
         AND ela.tenant_id = ? AND ela.is_active = TRUE AND u.is_active = TRUE
       ORDER BY ela.assigned_at ASC, ela.id ASC`,
      [tenantId, tenantId]
    );
    console.log('[v2/cases] All active L1 assignments for tenant', tenantId, ':', l1Assignments);

    const assignmentContext = {
      category: category || null,
      subcategory: subcategory || null,
      title: title || null,
      description: description || null,
      reportingMode: mode || null,
      selectedDepartment: department || null,
      createdById: user.id
    };

    const l1Validation = await validateLevelAssignment(tenantId, 'L1', assignmentContext);
    console.log('[v2/cases] L1 validation result:', {
      context: assignmentContext,
      valid: l1Validation.valid,
      reason: l1Validation.reason,
      assignee: l1Validation.assignee
        ? { user_id: l1Validation.assignee.user_id, user_name: l1Validation.assignee.user_name, user_role: l1Validation.assignee.user_role }
        : null,
      levelId: l1Validation.levelId
    });
    if (!l1Validation.valid) {
      return res.status(400).json({
        success: false,
        message: l1Validation.reason
      });
    }
    const assignedTo = l1Validation.assignee.user_id;

    const [result] = await pool.execute(
      `INSERT INTO cases
       (title, description, category, subcategory, priority, status, created_by, assigned_to, reporting_mode, ticket_code, escalation_level, escalation_count, last_escalated_at, is_escalated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'L1', 0, NULL, 0)`,
      [
        title.trim(),
        description.trim(),
        category || null,
        subcategory || null,
        ticketPriority,
        ticketStatus,
        user.id,
        assignedTo,
        mode,
        `TKT-${Date.now().toString().slice(-4)}`
      ]
    );

    const [rows] = await pool.execute(
      `SELECT t.*, u.name as reporter_name, a.name as assignee_name FROM cases t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       WHERE t.id = ?`,
      [result.insertId]
    );

    const isAnonymousCaseCreation = String(mode).toLowerCase() === 'anonymous';
    const creationActorName = isAnonymousCaseCreation ? 'Anonymous Employee' : user.name;

    // Add history entry for case creation
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          result.insertId,
          'created',
          user.id,
          creationActorName,
          JSON.stringify({ title: title.trim(), priority: ticketPriority, category: category || null, subcategory: subcategory || null })
        ]
      );
    } catch (histErr) {
      console.error('[v2/cases] Failed to log creation activity (non-fatal):', histErr.message);
    }

    // Log initial assignment activity
    try {
      await ticketActivityService.logActivity({
        ticketId: result.insertId,
        tenantId,
        action: 'assigned',
        performedBy: user.id,
        performedByName: creationActorName,
        details: {
          previous_assignee: null,
          new_assignee: assignedTo,
          new_assignee_name: l1Validation.assignee.user_name,
          previous_level: null,
          new_level: 'L1',
          assignment_type: 'initial',
          reason: 'Initial L1 assignment via escalation configuration'
        }
      });
    } catch (assignActivityErr) {
      console.error('[v2/cases] Failed to log initial assignment activity (non-fatal):', assignActivityErr.message);
    }

    // Send notification for case creation
    console.log(`[v2/cases] Preparing notification for new case ${result.insertId}, assignedTo=${assignedTo}, userId=${user.id}`);
    try {
      await notifyTicketCreated(pool, {
        tenantId: user.tenantId || 1,
        ticketId: result.insertId,
        userId: user.id,
        assignedTo: assignedTo || null,
        issueTitle: title.trim()
      });
      console.log(`[v2/cases] Notification sent for new case ${result.insertId}`);
    } catch (notifErr) {
      console.error('[v2/cases] Failed to send notification:', notifErr);
    }

    // Send email notifications for normal tickets
    try {
      await caseNotificationService.notifyTicketCreated(result.insertId);
      await caseNotificationService.notifyTicketAssigned(result.insertId);
    } catch (emailErr) {
      console.error('[v2/cases] Failed to send creation/assignment emails (non-fatal):', emailErr.message);
    }

    // Initialize SLA timers for the new case
    await initializeSLATimers(result.insertId, category, ticketPriority);

    const maskedCase = await maskCaseData(toCase(rows[0]), user);
    res.status(201).json({
      success: true,
      case: maskedCase,
      message: 'Case created successfully'
    });
  } catch (error) {
    console.error('[v2/cases] POST / error:', error);
    res.status(500).json({ success: false, message: 'Failed to create case' });
  }
});

// ─── GET /api/v2/users (Get all users with role for HCMS) ───
router.get('/users', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || 1;

    const [users] = await pool.execute(
      `SELECT id, name, email, role, department, is_active
       FROM users
       WHERE (tenant_id = ? OR tenant_id IS NULL)
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('[v2/cases] GET /users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// ─── GET /api/v2/users/hr (Get assignable users for manual reassignment) ───
router.get('/users/hr', authenticate, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || 1;

    // Only HR and system admins can fetch assignable users
    if (!isHrOrAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Prefer users assigned to any configured escalation level
    const [users] = await pool.execute(
      `SELECT DISTINCT u.id, u.name, u.email, u.role
       FROM users u
       JOIN escalation_level_assignments ela ON u.id = ela.user_id
       JOIN escalation_levels el ON ela.escalation_level_id = el.id
       WHERE el.tenant_id = ? AND el.is_active = TRUE
         AND ela.tenant_id = ? AND ela.is_active = TRUE
         AND u.is_active = TRUE
       ORDER BY u.name ASC`,
      [tenantId, tenantId]
    );

    res.json({
      success: true,
      users: users
    });
  } catch (error) {
    console.error('[v2/cases] GET /users/hr error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignable users' });
  }
});

// ─── GET /api/v2/cases/:id ───
router.get('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    // Check if id is a ticket code (e.g., "TKT-1042") or numeric ID
    const isTicketCode = id.startsWith('TKT-') || isNaN(parseInt(id));
    const whereClause = isTicketCode ? 't.ticket_code = ?' : 't.id = ?';

    const [rows] = await pool.execute(
      `SELECT t.*, u.name as reporter_name, u.email as reporter_email,
              a.name as assignee_name
       FROM cases t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       WHERE ${whereClause}`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }

    const ticket = rows[0];

    // Role-based access check
    if (!canAccessCaseDetail(user, ticket)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Special-case access check for confidential, sensitive, anonymous tickets
    if (isSpecialCaseType(ticket.reporting_mode) && !(await canViewCase(user, ticket))) {
      return res.status(403).json({ success: false, message: 'Access denied: you do not have permission to view this case' });
    }

    const isAnonymous = isAnonymousCase(ticket);

    let caseData = toCase(ticket);
    caseData = await maskCaseData(caseData, user);
    caseData.assignee_name = ticket.assignee_name;
    caseData.is_owner = Number(ticket.created_by) === Number(user?.id);

    // Fetch history
    const [history] = await pool.execute(
      `SELECT * FROM ticket_activity WHERE ticket_id = ? ORDER BY created_at DESC`,
      [id]
    );

    // Fetch comments
    const [comments] = await pool.execute(
      `SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at DESC`,
      [id]
    );

    // Fetch pending info requests with attachments
    const [infoRequests] = await pool.execute(
      `SELECT id, requester_id, requester_name, message, status, message_id, created_at
       FROM ticket_info_requests
       WHERE ticket_id = ? AND status = 'pending'
       ORDER BY created_at DESC`,
      [id]
    );

    // Fetch attachments for each info request
    const infoRequestsWithAttachments = await Promise.all(
      infoRequests.map(async (req) => {
        if (!req.message_id) return { ...req, attachments: [] };
        const [attachments] = await pool.execute(
          `SELECT id, file_name, file_type, file_size, file_path, uploaded_at
           FROM case_attachments
           WHERE case_id = ? AND message_id = ?
           ORDER BY uploaded_at ASC`,
          [id, req.message_id]
        );
        return { ...req, attachments: attachments || [] };
      })
    );

    // Fetch case-level attachments uploaded during ticket creation (message_id IS NULL)
    const [caseAttachments] = await pool.execute(
      `SELECT id, file_name, file_type, file_size, file_path, uploaded_at, uploaded_by
       FROM case_attachments
       WHERE case_id = ? AND message_id IS NULL
       ORDER BY uploaded_at ASC`,
      [id]
    );
    const maskedCaseAttachments = caseAttachments.map(a => {
      if (isAnonymous && Number(a.uploaded_by) === Number(ticket.created_by)) {
        return { ...a, uploaded_by: null };
      }
      return a;
    });

    // Fetch internal notes (visible only to internal staff)
    const isInternalStaff = !isEmployee(user);
    let internalNotes = [];
    if (isInternalStaff) {
      const [rows] = await pool.execute(
        `SELECT id, note as text, created_at, author FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC`,
        [id]
      );
      internalNotes = rows.map(n => ({ ...n, note: n.text })) || [];
    }

    const permissions = await getCasePermissions(user, ticket);

    const [pendingEscalationConsent] = await pool.execute(
      `SELECT * FROM case_escalation_consent
       WHERE case_id = ? AND tenant_id = ? AND status = 'pending'
       ORDER BY requested_at DESC
       LIMIT 1`,
      [caseData.id, Number(ticket.tenant_id || user.tenantId || 1) || 1]
    );

    const unacknowledgedEscalationConsent = await getUnacknowledgedConsentResponse(pool, caseData.id, Number(ticket.tenant_id || user.tenantId || 1) || 1);

    const maskedHistory = maskAnonymousHistory(history, isAnonymous, ticket.created_by);
    const maskedComments = maskAnonymousComments(comments, isAnonymous, ticket.created_by);
    const maskedNotes = maskAnonymousNotes(internalNotes, isAnonymous, ticket.reporter_name);
    const maskedInfoRequests = maskAnonymousInfoRequests(infoRequestsWithAttachments, isAnonymous, ticket.created_by);

    res.json({
      success: true,
      case: caseData,
      history: maskedHistory || [],
      comments: maskedComments || [],
      pendingInfoRequests: maskedInfoRequests || [],
      attachments: maskedCaseAttachments || [],
      internal_notes: maskedNotes,
      pendingEscalationConsent: pendingEscalationConsent[0] || null,
      unacknowledgedEscalationConsent: unacknowledgedEscalationConsent || null,
      permissions
    });
  } catch (error) {
    console.error('[v2/cases] GET /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch case' });
  }
});

// ─── PATCH /api/v2/cases/:id ───
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, priority } = req.body;
    const user = req.user;

    // Check if ticket exists
    const [ticket] = await pool.execute(
      `SELECT * FROM cases WHERE id = ?`,
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticketData = ticket[0];

    // Special-case edit permission
    if (isSpecialCaseType(ticketData.reporting_mode)) {
      if (!(await canEditCase(user, ticketData))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to edit this case' });
      }
    } else if (isEmployee(user)) {
      // Permission check: Employees can only edit their own open tickets
      if (ticketData.created_by !== user.id) {
        return res.status(403).json({ success: false, message: 'You can only edit your own tickets' });
      }
      if (ticketData.status !== 'new') {
        return res.status(403).json({ success: false, message: 'You can only edit tickets that are in Open status' });
      }
    }

    const editActorName = isAnonymousCase(ticketData) && user.id === ticketData.created_by ? 'Anonymous Employee' : user.name;

    const updates = [];
    const params = [];

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Title must be a non-empty string'
        });
      }
      if (title.trim().length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Title must be less than 500 characters'
        });
      }
      updates.push('title = ?');
      params.push(title.trim());
    }

    if (description !== undefined) {
      if (typeof description !== 'string' || description.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Description must be a non-empty string'
        });
      }
      if (description.trim().length > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Description must be less than 10000 characters'
        });
      }
      updates.push('description = ?');
      params.push(description.trim());
    }

    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }

    if (priority !== undefined) {
      if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority. Must be one of: low, medium, high, critical'
        });
      }
      updates.push('priority = ?');
      params.push(PRIORITY_MAP[priority] || priority);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);

    await pool.execute(
      `UPDATE cases SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Add history entry for edit
    await pool.execute(
      `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        'edited',
        user.id,
        editActorName,
        JSON.stringify({ fields: updates.map(u => u.split(' = ')[0]) })
      ]
    );

    const [rows] = await pool.execute(
      `SELECT t.*, u.name as reporter_name FROM cases t
       LEFT JOIN users u ON t.created_by = u.id WHERE t.id = ?`,
      [id]
    );

    const maskedCase = await maskCaseData(toCase(rows[0]), user);
    res.json({ success: true, case: maskedCase });
  } catch (error) {
    console.error('[v2/cases] PATCH /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to update case' });
  }
});

// ─── PATCH /api/v2/cases/:id/status ───
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const mappedStatus = STATUS_MAP[status];
    if (!mappedStatus) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const user = req.user;
    const [oldRows] = await pool.execute(`SELECT * FROM cases WHERE id = ?`, [id]);
    if (oldRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const caseData = oldRows[0];
    const oldStatus = caseData.status || null;
    const oldDisplay = STATUS_REVERSE[oldStatus] || oldStatus || 'new';
    const statusActorName = isAnonymousCase(caseData) && user.id === caseData.created_by ? 'Anonymous Employee' : user.name;

    // Special-case action permissions
    if (isSpecialCaseType(caseData.reporting_mode)) {
      if (mappedStatus === 'resolved' && !(await canResolveCase(user, caseData))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to resolve this case' });
      }
      if (mappedStatus === 'closed' && !(await canCloseCase(user, caseData))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to close this case' });
      }
      if (!['resolved', 'closed'].includes(mappedStatus) && !(await canPerformActions(user, caseData))) {
        return res.status(403).json({ success: false, message: 'You do not have permission to change the status of this case' });
      }
    }

    await pool.execute(
      `UPDATE cases SET status = ? WHERE id = ?`,
      [mappedStatus, id]
    );

    // Add history entry
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          'status_changed',
          user.id,
          statusActorName,
          JSON.stringify({ status: { old: oldDisplay, new: status } })
        ]
      );
    } catch (histErr) {
      console.error('[v2/cases] Failed to log status activity (non-fatal):', histErr.message);
    }

    // Send notification for status change
    try {
      const [caseRow] = await pool.execute('SELECT title, created_by, assigned_to FROM cases WHERE id = ?', [id]);
      const caseInfo = caseRow[0] || {};
      const audienceMap = {
        'in_progress': 'customer_only',
        'resolved': 'customer_resolved',
        'closed': 'customer_closed',
        'escalated': 'escalation',
        'waiting': 'customer_only',
        'rejected': 'customer_rejected'
      };
      const audience = audienceMap[status];
      if (audience) {
        await notifyStatusChanged(pool, {
          tenantId: user.tenantId || 1,
          ticketId: Number(id),
          prevStatus: oldDisplay || null,
          nextStatus: status,
          assignedTo: caseInfo.assigned_to || null,
          userId: caseInfo.created_by,
          issueTitle: caseInfo.title,
          audience
        });
      }
    } catch (notifErr) {
      console.error('[v2/cases] Failed to send status change notification:', notifErr);
    }

    // Send email notification for status change
    if (oldStatus !== mappedStatus) {
      try {
        if (status === 'resolved') {
          await caseNotificationService.notifyResolved(Number(id));
        } else if (status === 'closed') {
          await caseNotificationService.notifyClosed(Number(id));
        } else {
          await caseNotificationService.notifyStatusChanged(Number(id), status);
        }
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send status change email (non-fatal):', emailErr.message);
      }
    }

    res.json({ success: true, message: 'Status updated' });
  } catch (error) {
    console.error('[v2/cases] PATCH /:id/status error:', error);
    console.error('[v2/cases] Error details:', error.message);
    console.error('[v2/cases] Error stack:', error.stack);
    res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
  }
});

// ─── POST /api/v2/cases/:id/request-info ───
router.post('/:id/request-info', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const user = req.user;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Request message is required' });
    }

    const tenantId = Number(user.tenant_id || user.tenantId || 1) || 1;
    const trimmed = message.trim();
    const messageId = require('crypto').randomUUID();

    const [caseRows] = await pool.execute(
      `SELECT id, title, created_by, assigned_to, reporting_mode, escalation_level FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, tenantId]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    const caseInfo = caseRows[0];

    // Special-case action permission
    if (isSpecialCaseType(caseInfo.reporting_mode) && !(await canPerformActions(user, caseInfo))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to request information for this case' });
    }

    // Mark case as waiting for employee response
    await pool.execute(
      `UPDATE cases SET status = 'waiting', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );

    // Record the info request with message_id for linking attachments
    await pool.execute(
      `INSERT INTO ticket_info_requests (tenant_id, ticket_id, requester_id, requester_name, message, status, message_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)`,
      [tenantId, id, user.id, user.name, trimmed, messageId]
    );

    // Log activity
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, 'info_requested', user.id, user.name, JSON.stringify({ message: trimmed.substring(0, 200) })]
      );
    } catch (histErr) {
      console.error('[v2/cases] Failed to log info request activity (non-fatal):', histErr.message);
    }

    // Notify the employee via in-app notification
    try {
      const notifId = require('crypto').randomUUID();
      await pool.execute(
        `INSERT INTO app_notifications (id, tenant_id, recipient_role, recipient_user_id, title, description, type, ticket_id, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)`,
        [
          notifId,
          tenantId,
          'USER',
          caseInfo.created_by,
          'More information needed',
          `HR/Resolver requested more information for ticket "${caseInfo.title || `#${id}`}". Please respond with the requested details.`,
          'INFO_REQUEST',
          Number(id)
        ]
      );
    } catch (notifErr) {
      console.error('[v2/cases] Failed to notify employee of info request (non-fatal):', notifErr.message);
    }

    res.json({ success: true, message: 'Information request sent to employee', message_id: messageId });
  } catch (error) {
    console.error('[v2/cases] POST /:id/request-info error:', error);
    res.status(500).json({ success: false, message: 'Failed to request information', error: error.message });
  }
});

// ─── POST /api/v2/cases/:id/comments ───
router.post('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const user = req.user;

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Comment is required and must be a non-empty string' });
    }

    if (comment.trim().length > 5000) {
      return res.status(400).json({ success: false, message: 'Comment must be less than 5000 characters' });
    }

    const [caseRows] = await pool.execute(`SELECT * FROM cases WHERE id = ?`, [id]);
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const caseData = caseRows[0];

    if (isSpecialCaseType(caseData.reporting_mode) && !(await canComment(user, caseData))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to comment on this case' });
    }

    const isAnonymousComment = isAnonymousCase(caseData) && isEmployee(user);
    const displayName = isAnonymousComment ? 'Anonymous Employee' : user.name;
    const displayUserId = isAnonymousComment ? null : user.id;

    const [result] = await pool.execute(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_id, sender_name, message, channel, created_at)
       VALUES (?, 'user', ?, ?, ?, 'platform_chat', CURRENT_TIMESTAMP)`,
      [id, user.id, displayName, comment.trim()]
    );

    // Add history entry for comment
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          'commented',
          user.id,
          displayName,
          JSON.stringify({ message: comment.trim().substring(0, 200) })
        ]
      );
    } catch (histErr) {
      console.error('[v2/cases] Failed to log comment activity (non-fatal):', histErr.message);
    }

    // If employee replied, mark pending info requests as fulfilled
    if (isEmployee(user)) {
      try {
        await pool.execute(
          `UPDATE ticket_info_requests
           SET status = 'fulfilled', fulfilled_at = CURRENT_TIMESTAMP
           WHERE ticket_id = ? AND status = 'pending'`,
          [id]
        );
        // Move ticket back to in_progress so HR can continue
        await pool.execute(
          `UPDATE cases SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'waiting'`,
          [id]
        );
      } catch (fulfillErr) {
        console.error('[v2/cases] Failed to fulfill info requests (non-fatal):', fulfillErr.message);
      }
    }

    // Send notification for comment added
    try {
      const [caseRow] = await pool.execute('SELECT title, created_by, assigned_to, reporting_mode FROM cases WHERE id = ?', [id]);
      const caseInfo = caseRow[0] || {};
      await notifyCommentAdded(pool, {
        tenantId: user.tenantId || 1,
        ticketId: Number(id),
        isCustomerReply: isEmployee(user),
        senderName: displayName,
        excerpt: comment.trim(),
        assignedTo: caseInfo.assigned_to || null,
        userId: caseInfo.created_by,
        issueTitle: caseInfo.title
      });
    } catch (notifErr) {
      console.error('[v2/cases] Failed to send notification:', notifErr);
    }

    // Send email notification for public reply (internal notes are handled separately)
    try {
      await caseNotificationService.notifyPublicReply(Number(id), isEmployee(user));
    } catch (emailErr) {
      console.error('[v2/cases] Failed to send comment email (non-fatal):', emailErr.message);
    }

    res.status(201).json({
      success: true,
      comment: {
        id: result.insertId,
        ticket_id: id,
        user_id: displayUserId,
        user_name: displayName,
        comment: comment.trim(),
        created_at: new Date().toISOString()
      },
      message_id: result.insertId
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/comments error:', error);
    res.status(500).json({ success: false, message: 'Failed to add comment' });
  }
});

// ─── GET /api/v2/cases/:id/comments ───
router.get('/:id/comments', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id, created_by FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [rows] = await pool.execute(
      `SELECT id, ticket_id, sender_id as user_id, sender_name as user_name, sender_type as user_role, message, is_internal, created_at,
       CASE WHEN sender_type = 'user' THEN 1 ELSE 0 END as isEmployee
       FROM ticket_messages WHERE ticket_id = ? AND (is_internal IS NULL OR is_internal = FALSE) ORDER BY created_at ASC`,
      [id]
    );

    // Fetch attachments for each message
    const commentsWithAttachments = await Promise.all(rows.map(async (comment) => {
      const [attachments] = await pool.execute(
        `SELECT id, file_name, file_type, file_size FROM case_attachments WHERE message_id = ?`,
        [comment.id]
      );
      return {
        ...comment,
        attachments: attachments
      };
    }));

    const maskedComments = maskAnonymousComments(commentsWithAttachments, isAnonymousCase(tickets[0]), tickets[0].created_by);
    res.json({ success: true, comments: maskedComments });
  } catch (error) {
    console.error('[v2/cases] GET /:id/comments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch comments' });
  }
});

// ─── GET /api/v2/cases/:id/internal-messages ───
router.get('/:id/internal-messages', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    if (!canAccessInternalContent(user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id, created_by FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [rows] = await pool.execute(
      `SELECT id, ticket_id, sender_id as user_id, sender_name as user_name, sender_type as user_role, message, is_internal, created_at
       FROM ticket_messages WHERE ticket_id = ? AND is_internal = TRUE ORDER BY created_at ASC`,
      [id]
    );

    const messagesWithAttachments = await Promise.all(rows.map(async (msg) => {
      const [attachments] = await pool.execute(
        `SELECT id, file_name, file_type, file_size FROM case_attachments WHERE message_id = ?`,
        [msg.id]
      );
      return { ...msg, attachments };
    }));

    const maskedMessages = maskAnonymousComments(messagesWithAttachments, isAnonymousCase(tickets[0]), tickets[0].created_by);
    res.json({ success: true, messages: maskedMessages });
  } catch (error) {
    console.error('[v2/cases] GET /:id/internal-messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch internal messages' });
  }
});

// ─── POST /api/v2/cases/:id/notes ───
router.post('/:id/notes', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const user = req.user;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required' });
    }

    // Only internal staff can add/view notes
    if (!canAccessInternalContent(user)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Verify ticket exists in tenant
    const tenantId = Number(user.tenant_id || user.tenantId || 1) || 1;
    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, tenantId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    // Special-case comment permission
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canComment(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to add notes to this case' });
    }

    await pool.execute(
      `INSERT INTO ticket_notes (ticket_id, note, author, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, text.trim(), user.name]
    );

    const [notes] = await pool.execute(
      `SELECT id, note as text, created_at, author FROM ticket_notes WHERE ticket_id = ? ORDER BY created_at DESC`,
      [id]
    );

    res.json({ success: true, data: notes.map(n => ({ ...n, note: n.text })) });
  } catch (error) {
    console.error('[v2/cases] POST /:id/notes error:', error);
    res.status(500).json({ success: false, message: 'Failed to add note' });
  }
});

// ─── GET /api/v2/cases/:id/history ───
router.get('/:id/history', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id, created_by FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [rows] = await pool.execute(
      `SELECT 
        ta.*,
        COALESCE(ta.performed_by_name, u.name) as performed_by_name,
        u.name as user_name
       FROM ticket_activity ta
       LEFT JOIN users u ON ta.performed_by = u.id AND (u.tenant_id = ta.tenant_id OR u.tenant_id IS NULL OR ta.tenant_id IS NULL)
       WHERE ta.ticket_id = ?
       ORDER BY ta.created_at DESC`,
      [id]
    );
    const maskedHistory = maskAnonymousHistory(rows, isAnonymousCase(tickets[0]), tickets[0].created_by);
    res.json({ success: true, history: maskedHistory });
  } catch (error) {
    console.error('[v2/cases] GET /:id/history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history' });
  }
});

// ─── PUT /api/v2/cases/:id (same as PATCH, for frontend compatibility) ───
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, priority, assigned_to, status } = req.body;
    const user = req.user;
    const tenantId = user.tenantId || 1;

    const VALID_STATUSES = ['new', 'in_progress', 'resolved', 'closed', 'escalated', 'waiting', 'rejected'];

    // Fetch current case to capture previous values for activity history
    let previousAssignee = null;
    let previousStatus = null;
    let currentCase = null;
    {
      const [currentRows] = await pool.execute('SELECT * FROM cases WHERE id = ?', [id]);
      if (currentRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Case not found' });
      }
      currentCase = currentRows[0];
      previousAssignee = currentCase.assigned_to || null;
      previousStatus = currentCase.status || null;
    }

    // Special-case edit permission
    if (isSpecialCaseType(currentCase.reporting_mode) && !(await canEditCase(user, currentCase))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to edit this case' });
    }

    const updates = [];
    const params = [];

    if (title) { updates.push('title = ?'); params.push(title); }
    if (description) { updates.push('description = ?'); params.push(description); }
    if (category) { updates.push('category_id = ?'); params.push(category); }
    if (priority) { updates.push('priority = ?'); params.push(PRIORITY_MAP[priority] || priority); }
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      updates.push('status = ?');
      params.push(status);
    }
    if (assigned_to !== undefined) {
      const assigneeId = Number(assigned_to);
      if (!Number.isFinite(assigneeId) || assigneeId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid assigned_to value' });
      }
      updates.push('assigned_to = ?');
      params.push(assigneeId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);

    await pool.execute(
      `UPDATE cases SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT t.*, u.name as reporter_name, a.name as assignee_name FROM cases t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN users a ON t.assigned_to = a.id
       WHERE t.id = ?`,
      [id]
    );

    const updatedCase = rows[0];

    // Log manual reassignment activity when assignee changes
    if (assigned_to !== undefined) {
      try {
        await ticketActivityService.logActivity({
          ticketId: Number(id),
          tenantId,
          action: 'assigned',
          performedBy: user.id,
          performedByName: user.name,
          details: {
            previous_assignee: previousAssignee,
            new_assignee: updatedCase.assigned_to,
            new_assignee_name: updatedCase.assignee_name,
            previous_level: updatedCase.escalation_level,
            new_level: updatedCase.escalation_level,
            assignment_type: 'manual',
            reason: 'Manual reassignment'
          }
        });
      } catch (activityErr) {
        console.error('[v2/cases] Failed to log manual assignment activity (non-fatal):', activityErr.message);
      }

      // Notify newly assigned user
      try {
        await notifyTicketAssigned(pool, {
          tenantId,
          ticketId: Number(id),
          assigneeAgentId: updatedCase.assigned_to
        });
      } catch (notifyErr) {
        console.error('[v2/cases] Failed to notify manual assignee (non-fatal):', notifyErr.message);
      }

      // Send email notification for assignment/reassignment
      try {
        if (previousAssignee && previousAssignee !== updatedCase.assigned_to) {
          await caseNotificationService.notifyReassigned(Number(id), previousAssignee);
        } else {
          await caseNotificationService.notifyTicketAssigned(Number(id));
        }
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send assignment email (non-fatal):', emailErr.message);
      }
    }

    // Log status change activity when status is updated
    if (status !== undefined && status !== previousStatus) {
      try {
        await ticketActivityService.logActivity({
          ticketId: Number(id),
          tenantId,
          action: 'status_changed',
          performedBy: user.id,
          performedByName: user.name,
          details: {
            status: { old: previousStatus, new: status }
          }
        });
      } catch (activityErr) {
        console.error('[v2/cases] Failed to log status change activity (non-fatal):', activityErr.message);
      }
    }

    res.json({ success: true, case: toCase(updatedCase) });
  } catch (error) {
    console.error('[v2/cases] PUT /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to update case' });
  }
});

// ─── DELETE /api/v2/cases/:id ───
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const [caseRows] = await pool.execute(
      `SELECT * FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const caseData = caseRows[0];

    if (isSpecialCaseType(caseData.reporting_mode) && !(await canEditCase(user, caseData))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to delete this case' });
    }

    await pool.execute(`DELETE FROM cases WHERE id = ?`, [id]);
    res.json({ success: true, message: 'Case deleted' });
  } catch (error) {
    console.error('[v2/cases] DELETE /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete case' });
  }
});

// ─── POST /api/v2/cases/:id/close (Employee closure with satisfaction) ───
router.post('/:id/close', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { satisfied, satisfaction_rating } = req.body;
    const user = req.user;

    // Check if ticket exists and belongs to employee
    const [ticket] = await pool.execute(
      `SELECT * FROM cases WHERE id = ?`,
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticketData = ticket[0];

    // Only employee who created the ticket can close it
    if (isEmployee(user) && ticketData.created_by !== user.id) {
      return res.status(403).json({ success: false, message: 'You can only close your own tickets' });
    }

    const closeActorName = isAnonymousCase(ticketData) ? 'Anonymous Employee' : user.name;

    // Only resolved tickets can be closed by employee
    if (ticketData.status !== 'resolved') {
      return res.status(400).json({ success: false, message: 'Only resolved tickets can be closed' });
    }

    // If not satisfied, reopen the ticket
    if (satisfied === false) {
      await pool.execute(
        `UPDATE cases SET status = 'in_progress', reopened_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );

      // Add history entry for reopening (non-fatal)
      try {
        await pool.execute(
          `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            id,
            'reopened_by_employee',
            user.id,
            closeActorName,
            JSON.stringify({ reason: 'Not satisfied with resolution' })
          ]
        );
      } catch (logErr) {
        console.error('[v2/cases] reopen activity log failed (non-fatal):', logErr.message);
      }

      // Send email notification for reopen
      try {
        await caseNotificationService.notifyReopened(Number(id));
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send reopen email (non-fatal):', emailErr.message);
      }

      return res.json({
        success: true,
        message: 'Ticket reopened due to unsatisfactory resolution',
        reopened: true
      });
    }

    // Mark as closed and employee closed. If this ticket was handled by the
    // Department Head, also move its dept_review_status to 'closed' so it appears
    // under the Department Head "Closed" section.
    try {
      await pool.execute(
        `UPDATE cases SET status = 'closed', employee_closed = 1, satisfaction_rating = ?, closed_at = CURRENT_TIMESTAMP,
         dept_review_status = CASE WHEN dept_review_status IS NOT NULL THEN 'closed' ELSE dept_review_status END
         WHERE id = ?`,
        [satisfaction_rating || null, id]
      );
    } catch (colErr) {
      await pool.execute(
        `UPDATE cases SET status = 'closed', employee_closed = 1, satisfaction_rating = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [satisfaction_rating || null, id]
      );
    }

    // Add history entry for closure (non-fatal)
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          'closed_by_employee',
          user.id,
          closeActorName,
          JSON.stringify({ satisfaction_rating: satisfaction_rating || null })
        ]
      );
    } catch (logErr) {
      console.error('[v2/cases] close activity log failed (non-fatal):', logErr.message);
    }

    // Send notification for ticket closure
    try {
      await notifyStatusChanged(pool, {
        tenantId: user.tenantId || 1,
        ticketId: Number(id),
        prevStatus: 'resolved',
        nextStatus: 'closed',
        userId: ticketData.created_by,
        issueTitle: ticketData.title,
        audience: 'customer_closed'
      });
    } catch (notifErr) {
      console.error('[v2/cases] Failed to send close notification:', notifErr);
    }

    // Send email notification for ticket closure
    try {
      await caseNotificationService.notifyClosed(Number(id));
    } catch (emailErr) {
      console.error('[v2/cases] Failed to send close email (non-fatal):', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Ticket closed successfully',
      reopened: false
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/close error:', error);
    res.status(500).json({ success: false, message: 'Failed to close ticket' });
  }
});

// ─── POST /api/v2/cases/:id/reopen (Employee reopen with reason) ───
router.post('/:id/reopen', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const user = req.user;

    // Check if ticket exists and belongs to employee
    const [ticket] = await pool.execute(
      `SELECT * FROM cases WHERE id = ?`,
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticketData = ticket[0];

    // Only employee who created the ticket can reopen it
    if (isEmployee(user) && ticketData.created_by !== user.id) {
      return res.status(403).json({ success: false, message: 'You can only reopen your own tickets' });
    }

    const reopenActorName = isAnonymousCase(ticketData) ? 'Anonymous Employee' : user.name;

    // Only closed tickets can be reopened
    if (ticketData.status === 'new' || ticketData.status === 'in_progress') {
      return res.status(400).json({ success: false, message: 'Only closed tickets can be reopened' });
    }

    // Reopen the ticket
    await pool.execute(
      `UPDATE cases SET status = 'in_progress', reopened_at = CURRENT_TIMESTAMP, reopened_reason = ?, employee_closed = 0 WHERE id = ?`,
      [reason || 'Reopened by employee', id]
    );

    // Add history entry for reopening (non-fatal)
    try {
      await pool.execute(
        `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          id,
          'reopened_by_employee',
          user.id,
          reopenActorName,
          JSON.stringify({ reason: reason || 'Reopened by employee' })
        ]
      );
    } catch (logErr) {
      console.error('[v2/cases] reopen activity log failed (non-fatal):', logErr.message);
    }

    // Send notification for ticket reopen
    try {
      await notifyStatusChanged(pool, {
        tenantId: user.tenantId || 1,
        ticketId: Number(id),
        prevStatus: ticketData.status,
        nextStatus: 'in_progress',
        userId: ticketData.created_by,
        issueTitle: ticketData.title,
        audience: 'customer_reopen'
      });
    } catch (notifErr) {
      console.error('[v2/cases] Failed to send reopen notification:', notifErr);
    }

    // Send email notification for ticket reopen
    try {
      await caseNotificationService.notifyReopened(Number(id));
    } catch (emailErr) {
      console.error('[v2/cases] Failed to send reopen email (non-fatal):', emailErr.message);
    }

    res.json({
      success: true,
      message: 'Ticket reopened successfully'
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/reopen error:', error);
    res.status(500).json({ success: false, message: 'Failed to reopen ticket' });
  }
});

// ─── POST /api/v2/cases/:id/attachments (Upload multiple files) ───
router.post('/:id/attachments', authenticate, upload.array('files', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const { message_id } = req.body;
    const user = req.user;

    // Check if ticket exists
    const [ticket] = await pool.execute(
      `SELECT * FROM cases WHERE id = ?`,
      [id]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticketData = ticket[0];
    const uploadActorName = isAnonymousCase(ticketData) && user.id === ticketData.created_by ? 'Anonymous Employee' : user.name;

    // Permission check: Only ticket creator, HR, or admin can upload
    if (isEmployee(user) && ticketData.created_by !== user.id) {
      return res.status(403).json({ success: false, message: 'You can only upload to your own tickets' });
    }

    // Special-case permission: internal staff need can_comment to upload attachments
    if (!isEmployee(user) && isSpecialCaseType(ticketData.reporting_mode) && !(await canComment(user, ticketData))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to upload attachments to this case' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded' });
    }

    const uploadedFiles = [];

    for (const file of req.files) {
      console.log(`[v2/cases] Inserting attachment: case_id=${id}, message_id=${message_id}, file=${file.originalname}, size=${file.size}`);
      const [result] = await pool.execute(
        `INSERT INTO case_attachments (case_id, file_name, file_type, file_size, file_path, uploaded_by, message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(id),
          file.originalname,
          file.mimetype,
          file.size,
          file.path,
          user.id,
          message_id || null
        ]
      );
      console.log(`[v2/cases] Attachment inserted with id=${result.insertId}`);

      uploadedFiles.push({
        id: result.insertId,
        file_name: file.originalname,
        file_type: file.mimetype,
        file_size: file.size,
        uploaded_at: new Date().toISOString()
      });
    }

    // Add history entry for attachment upload
    await pool.execute(
      `INSERT INTO ticket_activity (ticket_id, action, performed_by, performed_by_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        'attachments_uploaded',
        user.id,
        uploadActorName,
        JSON.stringify({ count: uploadedFiles.length, files: uploadedFiles.map(f => f.file_name) })
      ]
    );

    res.status(201).json({
      success: true,
      message: `${uploadedFiles.length} file(s) uploaded successfully`,
      attachments: uploadedFiles
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/attachments error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload attachments' });
  }
});

// ─── GET /api/v2/cases/:id/sla (Get SLA timers for a ticket) ───
router.get('/:id/sla', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [timers] = await pool.execute(
      `SELECT st.id, st.timer_type, st.start_time, st.sla_deadline, st.status,
              sc.response_time_minutes, sc.resolution_time_minutes,
              sc.escalation_warning_threshold_minutes, sc.escalation_breach_threshold_minutes,
              d.name as department_name
       FROM sla_timers st
       JOIN sla_configurations sc ON st.sla_configuration_id = sc.id
       LEFT JOIN departments d ON sc.department_id = d.id
       WHERE st.ticket_id = ?`,
      [id]
    );

    res.json({ success: true, timers: timers || [] });
  } catch (error) {
    console.error('[v2/cases] GET /:id/sla error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch SLA timers' });
  }
});

// ─── GET /api/v2/cases/:id/attachments/:attachmentId/download (Download/View an attachment) ───
router.get('/:id/attachments/:attachmentId/download', authenticate, async (req, res) => {
  try {
    const { id, attachmentId } = req.params;
    const user = req.user;

    // Check if attachment exists and belongs to the ticket
    const [attachment] = await pool.execute(
      `SELECT a.*, c.created_by as ticket_creator
       FROM case_attachments a
       JOIN cases c ON a.case_id = c.id
       WHERE a.id = ? AND a.case_id = ?`,
      [attachmentId, id]
    );

    if (attachment.length === 0) {
      return res.status(404).json({ success: false, message: 'Attachment not found' });
    }

    const attachmentData = attachment[0];

    // Permission check
    if (isEmployee(user) && attachmentData.ticket_creator !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Special-case view access check for the parent ticket
    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [id, Number(user.tenant_id || user.tenantId || 1) || 1]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Check if file exists
    if (!fs.existsSync(attachmentData.file_path)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    // Set content-type header from stored file_type so images/PDFs open in browser
    res.setHeader('Content-Type', attachmentData.file_type || 'application/octet-stream');
    res.sendFile(path.resolve(attachmentData.file_path));
  } catch (error) {
    console.error('[v2/cases] GET /:id/attachments/:attachmentId/download error:', error);
    res.status(500).json({ success: false, message: 'Failed to download attachment' });
  }
});

// ─── GET /api/v2/cases/:id/escalation-history ───
router.get('/:id/escalation-history', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const user = req.user;
    const tenantId = user?.tenantId || 1;

    if (!caseId || isNaN(caseId)) {
      return res.status(400).json({ success: false, message: 'Invalid case ID' });
    }

    const [tickets] = await pool.execute(
      `SELECT id, reporting_mode, escalation_level, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [caseId, tenantId]
    );
    if (tickets.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    if (isSpecialCaseType(tickets[0].reporting_mode) && !(await canViewCase(user, tickets[0]))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [history] = await pool.execute(
      `SELECT id, case_id, from_level, to_level, reason, escalated_by, escalated_by_name, created_at
       FROM case_escalation_history
       WHERE case_id = ? AND (tenant_id = ? OR tenant_id IS NULL)
       ORDER BY created_at ASC`,
      [caseId, tenantId]
    );

    res.json({ success: true, history });
  } catch (error) {
    console.error('[v2/cases] GET /:id/escalation-history error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch escalation history' });
  }
});

// ─── POST /api/v2/cases/:id/escalate (Sequential escalation L1 -> L5) ───
router.post('/:id/escalate', authenticate, async (req, res) => {
  let connection;
  try {
    const caseId = parseInt(req.params.id, 10);
    const tenantId = Number(req.user?.tenantId || req.user?.tenant_id || 1) || 1;
    const actor = req.user ? { id: req.user.id, name: req.user.name } : null;

    if (!caseId || isNaN(caseId)) {
      return res.status(400).json({ success: false, message: 'Invalid case ID' });
    }

    const [caseRows] = await pool.execute(
      `SELECT id, title, created_by, assigned_to, status, escalation_level, reporting_mode, tenant_id FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [caseId, tenantId]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const caseData = caseRows[0];

    if (isSpecialCaseType(caseData.reporting_mode) && !(await canPerformActions(req.user, caseData))) {
      return res.status(403).json({ success: false, message: 'You do not have permission to escalate this case' });
    }

    const { reason } = req.body || {};

    const ticketType = String(caseData.reporting_mode || 'normal').toLowerCase();
    const isSpecialCase = isSpecialCaseType(caseData.reporting_mode);
    const config = await getConsentConfig(tenantId, caseData.reporting_mode);
    const bypass = canBypassConsent(req.user, config);
    const consentRequired = isSpecialCase || config.require_consent === true;

    // For special cases the creator's approval is mandatory; only the creator can bypass.
    // For normal tickets the UI configuration and override roles are respected.
    const effectiveBypass = isSpecialCase ? isCaseCreator(req.user, caseData) : bypass;

    // If consent is not required or requester can bypass it, escalate immediately
    if (!consentRequired || effectiveBypass) {
      const result = await escalateCase(caseId, tenantId, actor, reason);

      // Send email notification for escalation
      try {
        await caseNotificationService.notifyEscalated(caseId, result.case.assigned_to);
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send escalation email (non-fatal):', emailErr.message);
      }

      return res.json({
        success: true,
        message: result.message,
        data: {
          id: result.case.id,
          assigned_to: result.case.assigned_to,
          escalation_level: result.case.escalation_level,
          escalation_count: result.case.escalation_count,
          last_escalated_at: result.case.last_escalated_at,
          is_escalated: result.case.is_escalated,
          status: result.case.status,
          escalation_reason: result.case.escalation_reason,
          dept_review_status: result.case.dept_review_status,
          previous_level: result.previousLevel,
          current_level: result.currentLevel
        }
      });
    }

    // Consent required: check for existing pending/approved request before escalating
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const { nextLevel } = await getNextEscalationLevel(tenantId, caseData.escalation_level);
    if (!nextLevel) {
      await connection.commit();
      connection.release();
      return res.status(400).json({ success: false, message: 'Case is already at the maximum escalation level' });
    }

    const pending = await getPendingConsentRequest(connection, caseId, tenantId);
    if (pending) {
      await connection.commit();
      connection.release();
      return res.status(409).json({
        success: false,
        awaiting_consent: true,
        message: 'Awaiting employee consent for escalation',
        pending_consent_request: pending
      });
    }

    const approved = await getApprovedConsentRequestForLevel(connection, caseId, tenantId, caseData.escalation_level, nextLevel);
    if (approved) {
      await connection.commit();
      connection.release();
      const result = await escalateCase(caseId, tenantId, actor, reason);

      // Send email notification for escalation
      try {
        await caseNotificationService.notifyEscalated(caseId, result.case.assigned_to);
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send escalation email (non-fatal):', emailErr.message);
      }

      return res.json({
        success: true,
        message: result.message,
        data: {
          id: result.case.id,
          assigned_to: result.case.assigned_to,
          escalation_level: result.case.escalation_level,
          escalation_count: result.case.escalation_count,
          last_escalated_at: result.case.last_escalated_at,
          is_escalated: result.case.is_escalated,
          status: result.case.status,
          escalation_reason: result.case.escalation_reason,
          dept_review_status: result.case.dept_review_status,
          previous_level: result.previousLevel,
          current_level: result.currentLevel
        }
      });
    }

    // No approved request yet: create a consent request and notify the employee
    const requestId = await createConsentRequest(connection, {
      caseId,
      tenantId,
      currentLevel: caseData.escalation_level,
      requestedLevel: nextLevel,
      requestedBy: actor?.id,
      requestedByName: actor?.name,
      reason
    });
    await connection.commit();
    connection.release();
    await notifyEmployeeOfConsentRequest(pool, caseId, tenantId, requestId, reason);

    res.json({
      success: true,
      awaiting_consent: true,
      message: 'Escalation consent request sent to the employee. The case will be escalated once the employee approves.',
      consent_request_id: requestId
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (e) {}
      try { connection.release(); } catch (e) {}
    }
    console.error('[v2/cases] POST /:id/escalate error:', error.message);
    const statusCode = error.message === 'Case not found' ? 404 : error.message.includes('already exists') ? 409 : 400;
    res.status(statusCode).json({ success: false, message: error.message });
  }
});

// ─── GET /api/v2/cases/escalation-consent/pending ───
router.get('/escalation-consent/pending', authenticate, async (req, res) => {
  try {
    const userId = req.user?.id;
    const tenantId = Number(req.user?.tenantId || req.user?.tenant_id || 1) || 1;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const requests = await getPendingConsentRequestsForEmployee(pool, userId, tenantId);
    res.json({ success: true, requests });
  } catch (error) {
    console.error('[v2/cases] GET /escalation-consent/pending error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch pending escalation requests' });
  }
});

// ─── GET /api/v2/cases/:id/escalation-consent ───
router.get('/:id/escalation-consent', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const tenantId = Number(req.user?.tenantId || req.user?.tenant_id || 1) || 1;
    if (!caseId || isNaN(caseId)) {
      return res.status(400).json({ success: false, message: 'Invalid case ID' });
    }
    const [caseRows] = await pool.execute(
      `SELECT id, created_by FROM cases WHERE id = ? AND (tenant_id = ? OR tenant_id IS NULL)`,
      [caseId, tenantId]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case not found' });
    }
    const history = await getConsentHistoryForCase(pool, caseId, tenantId);
    res.json({ success: true, history });
  } catch (error) {
    console.error('[v2/cases] GET /:id/escalation-consent error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch escalation consent history' });
  }
});

// ─── POST /api/v2/cases/:id/escalation-consent/:requestId/respond ───
router.post('/:id/escalation-consent/:requestId/respond', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const requestId = parseInt(req.params.requestId, 10);
    const tenantId = Number(req.user?.tenantId || req.user?.tenant_id || 1) || 1;
    const userId = req.user?.id;
    const { response, comments } = req.body || {};

    if (!caseId || isNaN(caseId) || !requestId || isNaN(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid case or request ID' });
    }
    if (response !== 'approved' && response !== 'rejected') {
      return res.status(400).json({ success: false, message: 'Response must be approved or rejected' });
    }

    const [caseRows] = await pool.execute(
      `SELECT c.id, c.created_by, c.title, c.status, c.escalation_level, c.reporting_mode, c.tenant_id
       FROM cases c
       JOIN case_escalation_consent ec ON ec.case_id = c.id
       WHERE c.id = ? AND ec.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)`,
      [caseId, requestId, tenantId]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case or consent request not found' });
    }
    const caseData = caseRows[0];
    if (caseData.created_by !== userId) {
      return res.status(403).json({ success: false, message: 'Only the employee who raised this case can respond' });
    }

    const { request, approved } = await respondToConsentRequest(pool, {
      requestId,
      userId,
      response,
      comments
    });

    res.json({
      success: true,
      approved,
      message: approved
        ? 'Escalation approved by the employee. The handler will be notified and can confirm escalation.'
        : 'Escalation declined by the employee. The handler will be notified.',
      request
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/escalation-consent/:requestId/respond error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/v2/cases/:id/escalation-consent/:requestId/acknowledge ───
router.post('/:id/escalation-consent/:requestId/acknowledge', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.params.id, 10);
    const requestId = parseInt(req.params.requestId, 10);
    const tenantId = Number(req.user?.tenantId || req.user?.tenant_id || 1) || 1;
    const userId = req.user?.id;

    if (!caseId || isNaN(caseId) || !requestId || isNaN(requestId)) {
      return res.status(400).json({ success: false, message: 'Invalid case or request ID' });
    }

    const [caseRows] = await pool.execute(
      `SELECT c.id, c.assigned_to, c.reporting_mode, c.tenant_id
       FROM cases c
       JOIN case_escalation_consent ec ON ec.case_id = c.id
       WHERE c.id = ? AND ec.id = ? AND (c.tenant_id = ? OR c.tenant_id IS NULL)`,
      [caseId, requestId, tenantId]
    );
    if (caseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Case or consent request not found' });
    }
    const caseData = caseRows[0];

    if (isEmployee(req.user)) {
      return res.status(403).json({ success: false, message: 'Only the case handler can acknowledge the consent response' });
    }

    const actor = req.user ? { id: req.user.id, name: req.user.name } : null;
    const result = await acknowledgeConsentRequest(pool, {
      requestId,
      userId,
      caseId,
      tenantId,
      actor
    });

    // Send email notification if escalation happened
    if (result.escalationResult) {
      try {
        await caseNotificationService.notifyEscalated(caseId, result.escalationResult.case.assigned_to);
      } catch (emailErr) {
        console.error('[v2/cases] Failed to send escalation email (non-fatal):', emailErr.message);
      }
    }

    res.json({
      success: true,
      acknowledged: true,
      escalated: !!result.escalationResult,
      message: result.escalationResult
        ? 'Escalation confirmed. The case has been escalated.'
        : 'Consent response acknowledged. The case remains at its current level.',
      data: result.escalationResult
        ? {
            id: result.escalationResult.case.id,
            assigned_to: result.escalationResult.case.assigned_to,
            escalation_level: result.escalationResult.case.escalation_level,
            escalation_count: result.escalationResult.case.escalation_count,
            status: result.escalationResult.case.status,
            dept_review_status: result.escalationResult.case.dept_review_status,
            previous_level: result.escalationResult.previousLevel,
            current_level: result.escalationResult.currentLevel
          }
        : null
    });
  } catch (error) {
    console.error('[v2/cases] POST /:id/escalation-consent/:requestId/acknowledge error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
