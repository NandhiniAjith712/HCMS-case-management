const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { verifyTenantAccess } = require('../middleware/tenant');
const { getBooleanSetting, setSetting } = require('../services/systemSettingsService');

const router = express.Router();

// Only manager/business roles can toggle global settings.
const SETTINGS_ADMIN_ROLES = new Set(['support_manager', 'manager', 'ceo', 'admin', 'super_admin']);

function assertSettingsAdmin(req, res, next) {
  const role = String(req.user?.role || '').toLowerCase();
  if (SETTINGS_ADMIN_ROLES.has(role)) return next();
  return res.status(403).json({ success: false, message: 'Managers only.' });
}

// GET /api/settings/ai-allocation -> { enabled: true/false }
router.get('/ai-allocation', authenticateToken, verifyTenantAccess, assertSettingsAdmin, async (req, res) => {
  try {
    const enabled = await getBooleanSetting('ai_ticket_allocation_enabled', true);
    return res.json({ success: true, data: { enabled } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to read setting.' });
  }
});

// POST /api/settings/ai-allocation { enabled: true/false }
router.post('/ai-allocation', authenticateToken, verifyTenantAccess, assertSettingsAdmin, async (req, res) => {
  try {
    const enabled = !!req.body?.enabled;
    await setSetting('ai_ticket_allocation_enabled', enabled ? 'true' : 'false');
    return res.json({ success: true, data: { enabled } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || 'Failed to update setting.' });
  }
});

module.exports = router;

