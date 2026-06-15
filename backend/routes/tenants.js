const express = require('express');
const { pool } = require('../database');
const { authenticateToken, authorizeRole } = require('../middleware/auth');
const router = express.Router();

// Super admin roles that can manage tenants (platform-level only)
const SUPER_ADMIN_ROLES = ['super_admin', 'business_dashboard'];

/**
 * GET /api/tenants
 * List all tenants (super admin and business dashboard only)
 */
router.get('/', authenticateToken, authorizeRole(SUPER_ADMIN_ROLES), async (req, res) => {
  try {
    const { status, plan } = req.query;
    
    let query = 'SELECT id, name, subdomain, status, plan, max_users, max_tickets_per_month, created_at FROM tenants';
    const params = [];
    
    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }
    
    if (plan) {
      query += params.length > 0 ? ' AND plan = ?' : ' WHERE plan = ?';
      params.push(plan);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [tenants] = await pool.execute(query, params);
    
    res.json({
      success: true,
      data: tenants,
      count: tenants.length
    });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenants'
    });
  }
});

/**
 * GET /api/tenants/platform-stats
 * Get platform-wide statistics (for Business Dashboard)
 */
router.get('/platform-stats', authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;

    // Only super_admin and business_dashboard can access platform stats
    if (role !== 'super_admin' && role !== 'business_dashboard') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Platform stats only available to super admins.'
      });
    }

    // Get total tenants
    const [tenantCount] = await pool.execute(
      'SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as active FROM tenants',
      ['active']
    );

    // Get total users across all tenants
    const [userCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM users WHERE is_active = ?',
      [1]
    );

    // Get total tickets across all tenants
    const [ticketCount] = await pool.execute(
      'SELECT COUNT(*) as total FROM tickets'
    );

    res.json({
      success: true,
      data: {
        total_tenants: tenantCount[0]?.total || 0,
        active_tenants: tenantCount[0]?.active || 0,
        total_users: userCount[0]?.total || 0,
        total_tickets: ticketCount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching platform stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch platform statistics'
    });
  }
});

/**
 * GET /api/tenants/monitoring
 * Get monitoring data (Tenant Health, SLA Alerts) for Business Dashboard
 */
router.get('/monitoring', authenticateToken, async (req, res) => {
  try {
    const role = req.user.role;

    // Only super_admin and business_dashboard can access monitoring data
    if (role !== 'super_admin' && role !== 'business_dashboard') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Monitoring data only available to super admins.'
      });
    }

    // Get all tenants with their stats
    const [tenants] = await pool.execute(
      'SELECT id, name, subdomain, status, plan, max_users, max_tickets_per_month, created_at FROM tenants ORDER BY created_at DESC'
    );

    // For each tenant, get actual usage stats
    const tenantHealth = await Promise.all(tenants.map(async (t) => {
      // Get user count for this tenant
      const [userCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM users WHERE tenant_id = ? AND is_active = ?',
        [t.id, 1]
      );

      // Get ticket count for this tenant
      const [ticketCount] = await pool.execute(
        'SELECT COUNT(*) as total FROM tickets WHERE tenant_id = ?',
        [t.id]
      );

      // Calculate usage percentages
      const userUsage = t.max_users > 0 ? Math.round((userCount[0].total / t.max_users) * 100) : 0;
      const ticketUsage = t.max_tickets_per_month > 0 ? Math.round((ticketCount[0].total / t.max_tickets_per_month) * 100) : 0;

      // SLA compliance (simplified - in real system would calculate from SLA breaches)
      const slaCompliance = 95 + Math.floor(Math.random() * 5); // Placeholder: 95-100%

      return {
        id: t.id,
        name: t.name,
        subdomain: t.subdomain,
        status: t.status,
        plan: t.plan,
        active_users: userCount[0].total || 0,
        max_users: t.max_users,
        active_tickets: ticketCount[0].total || 0,
        max_tickets_per_month: t.max_tickets_per_month,
        user_usage_pct: userUsage,
        ticket_usage_pct: ticketUsage,
        sla_compliance: slaCompliance,
        last_activity: 'Recently' // Placeholder
      };
    }));

    // Generate SLA alerts based on tenant health
    const slaAlerts = tenantHealth
      .filter(t => t.sla_compliance < 95 || t.user_usage_pct > 90 || t.ticket_usage_pct > 90)
      .map(t => ({
        id: t.id,
        severity: t.sla_compliance < 95 ? 'critical' : 'warning',
        message: t.sla_compliance < 95 
          ? `Tenant "${t.name}" SLA compliance below threshold (${t.sla_compliance}%)`
          : `Tenant "${t.name}" exceeding ${t.user_usage_pct > 90 ? 'user' : 'ticket'} limit`,
        time: 'Recently'
      }));

    res.json({
      success: true,
      data: {
        tenant_health: tenantHealth,
        sla_alerts: slaAlerts
      }
    });
  } catch (error) {
    console.error('Error fetching monitoring data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch monitoring data'
    });
  }
});

/**
 * GET /api/tenants/:id
 * Get tenant details
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    
    // Users can only view their own tenant unless super admin
    if (parseInt(id) !== tenantId && !SUPER_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only view your own tenant'
      });
    }
    
    const [tenants] = await pool.execute(
      'SELECT * FROM tenants WHERE id = ?',
      [id]
    );
    
    if (tenants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      data: tenants[0]
    });
  } catch (error) {
    console.error('Error fetching tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant'
    });
  }
});

/**
 * POST /api/tenants
 * Create new tenant with initial org_spoc account (super admin only)
 */
router.post('/', authenticateToken, authorizeRole(SUPER_ADMIN_ROLES), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const {
      name,
      subdomain,
      plan = 'free',
      max_users = 10,
      max_tickets_per_month = 100,
      whatsapp_enabled = false,
      email_enabled = true,
      // org_spoc account details
      org_spoc_name,
      org_spoc_email,
      org_spoc_phone
    } = req.body;

    // Validation
    if (!name || !subdomain) {
      return res.status(400).json({
        success: false,
        message: 'Name and subdomain are required'
      });
    }

    if (!org_spoc_name || !org_spoc_email) {
      return res.status(400).json({
        success: false,
        message: 'org_spoc name and email are required'
      });
    }

    // Validate subdomain format (alphanumeric and hyphens only)
    if (!/^[a-z0-9-]+$/.test(subdomain)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subdomain format. Use only lowercase letters, numbers, and hyphens.'
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org_spoc_email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid org_spoc email format'
      });
    }

    // Check if subdomain exists
    const [existing] = await connection.execute(
      'SELECT id FROM tenants WHERE subdomain = ?',
      [subdomain]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: 'Subdomain already exists'
      });
    }

    // Create tenant
    const [result] = await connection.execute(
      `INSERT INTO tenants (
        name, subdomain, plan, max_users, max_tickets_per_month,
        whatsapp_enabled, email_enabled, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, subdomain, plan, max_users, max_tickets_per_month, whatsapp_enabled, email_enabled, req.user.id]
    );

    const tenantId = result.insertId;
    console.log(`✅ Tenant created: ${name} (ID: ${tenantId}, Subdomain: ${subdomain})`);

    // Generate password setup token for org_spoc
    const crypto = require('crypto');
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create org_spoc account in agents table
    const [agentResult] = await connection.execute(
      `INSERT INTO agents (
        tenant_id, name, email, phone, role, password_hash, is_active,
        password_setup_token, password_setup_token_expires, user_type, availability_status
      ) VALUES (?, ?, ?, ?, 'org_spoc', NULL, FALSE, ?, ?, 'staff', 'available')`,
      [tenantId, org_spoc_name, org_spoc_email.toLowerCase(), org_spoc_phone || null, setupToken, setupTokenExpires]
    );

    const orgSpocAgentId = agentResult.insertId;
    console.log(`✅ org_spoc account created: ${org_spoc_email} (ID: ${orgSpocAgentId}, Tenant: ${tenantId})`);

    // Create default departments for the tenant
    const defaultDepartments = [
      { name: 'IT Support', description: 'General IT support and troubleshooting' },
      { name: 'Development', description: 'Software development and engineering' },
      { name: 'Operations', description: 'Operational support and maintenance' }
    ];

    for (const dept of defaultDepartments) {
      await connection.execute(
        `INSERT INTO departments (tenant_id, name, description, status) VALUES (?, ?, ?, 'active')`,
        [tenantId, dept.name, dept.description]
      );
    }

    console.log(`✅ Default departments created for tenant ${tenantId}`);

    await connection.commit();

    // Send setup email to org_spoc
    try {
      const emailService = require('../services/emailService');
      const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      const setupLink = `${baseUrl}/staff/set-password?token=${setupToken}`;
      await emailService.sendStaffSetupEmail(org_spoc_email, org_spoc_name, setupLink);
      console.log(`✅ Setup email sent to org_spoc: ${org_spoc_email}`);
    } catch (emailError) {
      console.warn('⚠️ Failed to send org_spoc setup email:', emailError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Tenant and org_spoc account created successfully',
      data: {
        tenant: {
          id: tenantId,
          name,
          subdomain,
          plan
        },
        org_spoc: {
          id: orgSpocAgentId,
          name: org_spoc_name,
          email: org_spoc_email,
          role: 'org_spoc',
          setup_link: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/staff/set-password?token=${setupToken}`
        }
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Error creating tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tenant',
      error: error.message
    });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/tenants/:id
 * Update tenant (super admin or tenant owner)
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    
    // Check access
    if (parseInt(id) !== tenantId && !SUPER_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const {
      name,
      status,
      plan,
      max_users,
      max_tickets_per_month,
      whatsapp_enabled,
      email_enabled,
      settings
    } = req.body;
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    
    if (name) {
      updates.push('name = ?');
      params.push(name);
    }
    
    if (status && SUPER_ADMIN_ROLES.includes(req.user.role)) {
      updates.push('status = ?');
      params.push(status);
    }
    
    if (plan && SUPER_ADMIN_ROLES.includes(req.user.role)) {
      updates.push('plan = ?');
      params.push(plan);
    }
    
    if (max_users !== undefined && SUPER_ADMIN_ROLES.includes(req.user.role)) {
      updates.push('max_users = ?');
      params.push(max_users);
    }
    
    if (max_tickets_per_month !== undefined && SUPER_ADMIN_ROLES.includes(req.user.role)) {
      updates.push('max_tickets_per_month = ?');
      params.push(max_tickets_per_month);
    }
    
    if (whatsapp_enabled !== undefined) {
      updates.push('whatsapp_enabled = ?');
      params.push(whatsapp_enabled);
    }
    
    if (email_enabled !== undefined) {
      updates.push('email_enabled = ?');
      params.push(email_enabled);
    }
    
    if (settings) {
      updates.push('settings = ?');
      params.push(JSON.stringify(settings));
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }
    
    params.push(id);
    
    const [result] = await pool.execute(
      `UPDATE tenants SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Tenant updated successfully'
    });
  } catch (error) {
    console.error('Error updating tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tenant'
    });
  }
});

/**
 * DELETE /api/tenants/:id
 * Delete tenant (super admin only) - CASCADE will delete all related data
 */
router.delete('/:id', authenticateToken, authorizeRole(SUPER_ADMIN_ROLES), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if tenant exists
    const [tenants] = await pool.execute('SELECT id, name FROM tenants WHERE id = ?', [id]);
    
    if (tenants.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tenant not found'
      });
    }
    
    // Delete tenant (CASCADE will delete all related data)
    await pool.execute('DELETE FROM tenants WHERE id = ?', [id]);
    
    console.log(`✅ Tenant deleted: ${tenants[0].name} (ID: ${id})`);
    
    res.json({
      success: true,
      message: 'Tenant deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tenant'
    });
  }
});

/**
 * GET /api/tenants/:id/stats
 * Get tenant statistics
 */
router.get('/:id/stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenant_id;
    
    // Check access
    if (parseInt(id) !== tenantId && !SUPER_ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Get statistics
    const [ticketStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_tickets,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_tickets,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_tickets,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_tickets,
        SUM(CASE WHEN status = 'escalated' THEN 1 ELSE 0 END) as escalated_tickets
      FROM tickets WHERE tenant_id = ?`,
      [id]
    );
    
    const [userStats] = await pool.execute(
      `SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) as customers,
        SUM(CASE WHEN role IN ('support_agent', 'support_manager', 'ceo') THEN 1 ELSE 0 END) as staff
      FROM users WHERE tenant_id = ?`,
      [id]
    );
    
    const [agentStats] = await pool.execute(
      `SELECT COUNT(*) as total_agents FROM agents WHERE tenant_id = ?`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        tickets: ticketStats[0],
        users: userStats[0],
        agents: agentStats[0]
      }
    });
  } catch (error) {
    console.error('Error fetching tenant stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant statistics'
    });
  }
});

module.exports = router;

