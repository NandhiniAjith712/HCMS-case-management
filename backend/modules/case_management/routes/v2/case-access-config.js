/**
 * HCMS Special Case Access Configuration API (v2)
 * Manages level-wise permissions for Confidential, Sensitive, and Anonymous cases.
 * Base: /api/v2/case-access-config
 */
const express = require('express');
const { authenticate, authorizeRoles } = require('../../../auth/middleware/auth.middleware');
const { ROLES } = require('../../../auth/constants/roles');
const {
  getSpecialCaseTypes,
  getLevelUsers,
  getPermissionsByTicketType,
  savePermissions
} = require('../../services/specialCaseAccessService');
const { getAllConsentConfigs, saveConsentConfig, TICKET_TYPES: CONSENT_TICKET_TYPES } = require('../../services/escalationConsentService');

const router = express.Router();

const TICKET_TYPES = getSpecialCaseTypes();
const LEVELS = ['L1', 'L2', 'L3', 'L4', 'L5'];

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

function validateTicketType(ticketType) {
  if (!TICKET_TYPES.includes(ticketType)) {
    throw new Error(`Invalid ticket type. Must be one of: ${TICKET_TYPES.join(', ')}`);
  }
}

function validateLevel(level) {
  if (!LEVELS.includes(level)) {
    throw new Error(`Invalid escalation level. Must be one of: ${LEVELS.join(', ')}`);
  }
}

function normalizePermissionPayload(payload) {
  return {
    user_id: Number(payload.user_id),
    can_view: payload.can_view === true || payload.can_view === 1 || payload.can_view === '1',
    can_view_employee_details: payload.can_view_employee_details === true || payload.can_view_employee_details === 1 || payload.can_view_employee_details === '1',
    can_edit: payload.can_edit === true || payload.can_edit === 1 || payload.can_edit === '1',
    can_comment: payload.can_comment === true || payload.can_comment === 1 || payload.can_comment === '1',
    can_perform_actions: payload.can_perform_actions === true || payload.can_perform_actions === 1 || payload.can_perform_actions === '1',
    can_resolve: payload.can_resolve === true || payload.can_resolve === 1 || payload.can_resolve === '1',
    can_close: payload.can_close === true || payload.can_close === 1 || payload.can_close === '1'
  };
}

// GET /api/v2/case-access-config/types
router.get('/types', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    res.json({ success: true, types: TICKET_TYPES });
  } catch (error) {
    console.error('[v2/case-access-config] GET /types error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/v2/case-access-config/escalation-consent
router.get('/escalation-consent', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = Number(req.user.tenantId || req.user.tenant_id || 1) || 1;
    const configs = await getAllConsentConfigs(tenantId);
    res.json({ success: true, configs });
  } catch (error) {
    console.error('[v2/case-access-config] GET /escalation-consent error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/v2/case-access-config/escalation-consent
router.post('/escalation-consent', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = Number(req.user.tenantId || req.user.tenant_id || 1) || 1;
    const configs = req.body.configs || {};

    for (const ticketType of CONSENT_TICKET_TYPES) {
      const cfg = configs[ticketType];
      if (!cfg) continue;
      const overrideRoles = Array.isArray(cfg.override_roles) ? cfg.override_roles : [];
      await saveConsentConfig(tenantId, ticketType, {
        require_consent: cfg.require_consent === true,
        override_roles: overrideRoles
      });
    }

    res.json({ success: true, message: 'Escalation consent configuration saved' });
  } catch (error) {
    console.error('[v2/case-access-config] POST /escalation-consent error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/v2/case-access-config/:ticketType
// Returns all configured levels with their users and current permissions for this ticket type.
router.get('/:ticketType', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = Number(req.user.tenantId || req.user.tenant_id || 1) || 1;
    const ticketType = String(req.params.ticketType).toLowerCase();
    validateTicketType(ticketType);

    const storedPermissions = await getPermissionsByTicketType(tenantId, ticketType);
    const result = {};

    for (const level of LEVELS) {
      const levelUsers = await getLevelUsers(tenantId, level);
      const levelPermissions = storedPermissions[level] || {};
      result[level] = {
        level,
        users: levelUsers.map(u => {
          const perm = levelPermissions[u.user_id] || null;
          return {
            user_id: u.user_id,
            user_name: u.user_name,
            user_email: u.user_email,
            user_role: u.user_role,
            permissions: perm
              ? {
                  can_view: perm.can_view === 1,
                  can_view_employee_details: perm.can_view_employee_details === 1,
                  can_edit: perm.can_edit === 1,
                  can_comment: perm.can_comment === 1,
                  can_perform_actions: perm.can_perform_actions === 1,
                  can_resolve: perm.can_resolve === 1,
                  can_close: perm.can_close === 1
                }
              : {
                  can_view: false,
                  can_view_employee_details: false,
                  can_edit: false,
                  can_comment: false,
                  can_perform_actions: false,
                  can_resolve: false,
                  can_close: false
                }
          };
        })
      };
    }

    res.json({ success: true, ticketType, levels: result });
  } catch (error) {
    console.error('[v2/case-access-config] GET /:ticketType error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/v2/case-access-config/:ticketType/:level
// Save permissions for a specific level and ticket type.
router.post('/:ticketType/:level', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = Number(req.user.tenantId || req.user.tenant_id || 1) || 1;
    const ticketType = String(req.params.ticketType).toLowerCase();
    const level = String(req.params.level).toUpperCase();
    validateTicketType(ticketType);
    validateLevel(level);

    const permissions = Array.isArray(req.body.permissions)
      ? req.body.permissions.map(normalizePermissionPayload).filter(p => p.user_id)
      : [];

    await savePermissions(tenantId, ticketType, level, permissions);
    res.json({ success: true, message: `Access configuration saved for ${ticketType} at ${level}` });
  } catch (error) {
    console.error('[v2/case-access-config] POST /:ticketType/:level error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
