const express = require('express');
const router = express.Router();
const { pool } = require('../../../shared/database/database');
const { authenticateToken } = require('../../../shared/middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../../../shared/middleware/tenant');
const { ensureSlaResolutionSchema, normalizeIssueTypeId, applyResolvedSlaToTicket } = require('../../services/slaResolutionService');

// Use MySQL NOW() so deadline comparisons match created_at (avoids Node/MySQL timezone drift)
async function getDbNow() {
  const [rows] = await pool.execute('SELECT NOW() as now');
  return new Date(rows[0].now);
}

// created_by FK references users(id). Agents (staff) live in the agents table,
// so their IDs violate the FK. Only set created_by for actual users.
const getCreatedBy = (user) => {
  if (!user) return null;
  // agentId is set by authenticateToken for agent/staff logins.
  if (user.agentId) return null;
  return (user.id && Number(user.id) > 0) ? Number(user.id) : null;
};

// Apply tenant context to all routes
router.use(setTenantContext);
router.use(async (req, res, next) => {
  try {
    await ensureSlaResolutionSchema();
    // Product-level priority allocation policy (authoritative for new tickets).
    try {
      const [pcols] = await pool.execute(`SHOW COLUMNS FROM products LIKE 'priority_allocation_type'`);
      if (!pcols || pcols.length === 0) {
        await pool.execute(
          `ALTER TABLE products
           ADD COLUMN priority_allocation_type VARCHAR(30) NOT NULL DEFAULT 'ai_only' AFTER status`
        );
      }
    } catch (e) {
      console.warn('⚠️ Could not ensure products.priority_allocation_type column:', e?.message || e);
    }
    // Legacy: module column kept for backward compatibility / synced on module create.
    try {
      const [cols] = await pool.execute(`SHOW COLUMNS FROM modules LIKE 'priority_allocation_type'`);
      if (!cols || cols.length === 0) {
        await pool.execute(
          `ALTER TABLE modules
           ADD COLUMN priority_allocation_type VARCHAR(30) NOT NULL DEFAULT 'ai_only' AFTER status`
        );
      }
    } catch (e) {
      // Best-effort: do not block SLA routes if schema alteration is not permitted.
      console.warn('⚠️ Could not ensure modules.priority_allocation_type column:', e?.message || e);
    }
    next();
  } catch (e) {
    next(e);
  }
});

// Test API endpoint
router.get('/test-auth', async (req, res) => {
  try {
    console.log('🔍 SLA test-auth endpoint called');
    console.log('   Headers:', req.headers);
    
    // CORS is handled by the main server configuration
    
    res.json({
      success: true,
      message: 'SLA API is working!',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Test auth error:', error);
    res.status(500).json({
      success: false,
      message: 'Test failed'
    });
  }
});

// Get all products with SLA settings
router.get('/products', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    // Get tenant_id from request context, user, or default
    let tenantId = req.tenantId;

    // If no tenant in request context, try to get from user
    if (!tenantId && req.user && req.user.tenant_id) {
      tenantId = req.user.tenant_id;
      console.log(`🏢 Using tenant_id from user: ${tenantId}`);
    }

    // If still no tenant, use default tenant in development
    if (!tenantId && process.env.NODE_ENV === 'development') {
      try {
        const [tenants] = await pool.execute(
          'SELECT id FROM tenants WHERE subdomain = \'default\' AND status = \'active\' LIMIT 1'
        );
        if (tenants.length > 0) {
          tenantId = tenants[0].id;
          console.log(`🏢 Using default tenant_id: ${tenantId}`);
        } else {
          // Fallback to tenant_id = 1
          tenantId = 1;
          console.log(`🏢 Using fallback tenant_id: ${tenantId}`);
        }
      } catch (error) {
        tenantId = 1;
        console.log(`🏢 Error getting default tenant, using tenant_id: ${tenantId}`);
      }
    }

    let query = `
      SELECT p.*, u.name as created_by_name
      FROM products p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.tenant_id = ?
    `;
    const params = [tenantId];

    query += ' GROUP BY p.id ORDER BY p.name';

    const [products] = await pool.execute(query, params);

    console.log(`📦 Found ${products.length} products for tenant_id: ${tenantId}`);

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

// Create new product with SLA settings
router.post('/products', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { name, description, status = 'active', priority_allocation_type } = req.body;
    const createdBy = getCreatedBy(req.user);
    
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required'
      });
    }

    const pat = normalizePriorityAllocationType(priority_allocation_type);

    const [result] = await pool.execute(`
      INSERT INTO products (tenant_id, name, description, status, priority_allocation_type, created_by) 
      VALUES (?, ?, ?, ?, ?, ?)
    `, [tenantId, name, description || null, status, pat, createdBy]);

    const newProductId = result.insertId;

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: { id: newProductId, name }
    });
  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product'
    });
  }
});

// Update product SLA settings
router.put('/products/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { name, description, status, priority_allocation_type } = req.body;

    const pat = normalizePriorityAllocationType(priority_allocation_type);

    const [existing] = await pool.execute('SELECT id FROM products WHERE id = ? AND tenant_id = ?', [id, tenantId]);
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    await pool.execute(`
      UPDATE products 
      SET name = ?, description = ?, status = ?, priority_allocation_type = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `, [name, description || null, status, pat, id, tenantId]);

    res.json({
      success: true,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product'
    });
  }
});

// Delete product
router.delete('/products/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    // Check if product exists (tenant-filtered)
    const [products] = await pool.execute(
      'SELECT * FROM products WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    // Check if product is being used by any tickets (tenant-filtered)
    const [tickets] = await pool.execute(
      'SELECT COUNT(*) as count FROM tickets WHERE product_id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (tickets[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete product. It is being used by ${tickets[0].count} ticket(s).`
      });
    }
    
    // Delete the product (tenant-filtered)
    const [result] = await pool.execute(
      'DELETE FROM products WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete product'
    });
  }
});

// Get SLA timer for a ticket
router.get('/timers/:ticketId/remaining', setTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1; // Use default if not provided
    
    // CORS is handled by the main server configuration
    
    const { ticketId } = req.params;
    
    const loadTicket = async () => {
      const [tickets] = await pool.execute(`
        SELECT t.*, p.name as product_name, m.name as module_name
        FROM tickets t
        LEFT JOIN products p ON t.product_id = p.id AND p.tenant_id = t.tenant_id
        LEFT JOIN modules m ON t.module_id = m.id AND m.tenant_id = t.tenant_id
        WHERE t.id = ? AND t.tenant_id = ?
      `, [ticketId, tenantId]);
      return tickets;
    };

    // Load ticket (tenant-filtered)
    let tickets = await loadTicket();

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = tickets[0];
    const now = await getDbNow();
    
    // Backward safety: if snapshot due times are missing, compute once and persist.
    if (!ticket.sla_response_due_at || !ticket.sla_resolution_due_at) {
      try {
        await applyResolvedSlaToTicket({ ticketId: Number(ticketId), tenantId });
        tickets = await loadTicket();
      } catch (_) {
        // best effort
      }
    }
    const t2 = tickets[0] || ticket;

    const responseDue = t2.sla_response_due_at ? new Date(t2.sla_response_due_at) : null;
    const resolutionDue = t2.sla_resolution_due_at ? new Date(t2.sla_resolution_due_at) : null;
    const responseDeadline = responseDue && Number.isFinite(responseDue.getTime()) ? responseDue : null;
    const resolutionDeadline = resolutionDue && Number.isFinite(resolutionDue.getTime()) ? resolutionDue : null;

    const responseTimeMinutes = Number(t2.sla_response_time_minutes || 0) || 480;
    const resolutionTimeMinutes = Number(t2.sla_resolution_time_minutes || 0) || responseTimeMinutes || 480;

    // If due_at is unavailable even after backfill, fall back to created_at + stored minutes (no rule recompute).
    const ticketCreatedAt = new Date(t2.created_at);
    const createdMs = Number.isFinite(ticketCreatedAt.getTime()) ? ticketCreatedAt.getTime() : now.getTime();
    const responseDeadlineFinal = responseDeadline || new Date(createdMs + responseTimeMinutes * 60 * 1000);
    const resolutionDeadlineFinal = resolutionDeadline || new Date(createdMs + resolutionTimeMinutes * 60 * 1000);

    // Display: show response deadline for UI (or resolution if that's primary)
    const slaTimeMinutes = resolutionTimeMinutes;
    const slaDeadline = resolutionDeadlineFinal;

    const remainingMs = slaDeadline.getTime() - now.getTime();
    const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));

    const isBreached = remainingMs < 0;
    const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;

    // NOTE: This endpoint must be read-only.
    // Auto-escalation is handled by the scheduled escalation job to avoid "read causes writes"
    // (which was flipping tickets back to escalated immediately after customer reopen).
    const isResolutionBreached = now.getTime() > resolutionDeadlineFinal.getTime();

    const timerData = {
      ticket_id: ticket.id,
      product_name: ticket.product_name || ticket.product || 'Unknown Product',
      module_name: ticket.module_name || ticket.module || 'Unknown Module',
      priority_level: ticket.priority_level || 'P2',
      sla_match_level: ticket.sla_match_level || 'SYSTEM_DEFAULT',
      response_time_minutes: responseTimeMinutes,
      resolution_time_minutes: resolutionTimeMinutes,
      sla_time_minutes: slaTimeMinutes,
      deadline: slaDeadline.toISOString(),
      remaining_minutes: remainingMinutes,
      remaining_hours: Math.floor(remainingMinutes / 60),
      remaining_days: Math.floor(remainingMinutes / (60 * 24)),
      is_breached: isBreached,
      is_warning: isWarning,
      status: ticket.status,
      auto_escalated: false
    };

    res.json({
      success: true,
      data: [timerData]
    });
  } catch (error) {
    console.error('Error fetching timer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SLA timer'
    });
  }
});

// Bulk SLA timers for ticket lists (no side effects; returns signed remaining_minutes).
// POST /api/sla/timers/bulk-remaining { ticketIds: [1,2,3] }
router.post('/timers/bulk-remaining', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId || 1;
    const idsRaw = Array.isArray(req.body?.ticketIds) ? req.body.ticketIds : [];
    const ticketIds = idsRaw
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 200);
    if (!ticketIds.length) {
      return res.json({ success: true, data: {} });
    }

    const placeholders = ticketIds.map(() => '?').join(', ');
    const [tickets] = await pool.execute(
      `SELECT id, created_at, status, sla_response_time_minutes, sla_resolution_time_minutes, sla_resolution_due_at
       FROM tickets
       WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...ticketIds]
    );

    const now = await getDbNow();
    const nowMs = now.getTime();
    const out = {};
    for (const t of tickets || []) {
      const createdAt = new Date(t.created_at);
      const createdMs = Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : nowMs;
      const responseTimeMinutes = Number(t.sla_response_time_minutes || 0) || 0;
      const resolutionTimeMinutes = Number(t.sla_resolution_time_minutes || 0) || 0;
      const fallback = 480;
      const responseMin = responseTimeMinutes > 0 ? responseTimeMinutes : fallback;
      const resolutionMin = resolutionTimeMinutes > 0 ? resolutionTimeMinutes : responseMin || fallback;

      const due = t.sla_resolution_due_at ? new Date(t.sla_resolution_due_at) : null;
      const dueMs = due && Number.isFinite(due.getTime()) ? due.getTime() : null;
      const deadlineMs = dueMs ?? (createdMs + resolutionMin * 60 * 1000);
      const remainingMs = deadlineMs - nowMs;
      const remainingMinutes = Math.floor(remainingMs / 60000); // signed; negative when overdue
      const isBreached = remainingMs < 0;
      const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;
      out[Number(t.id)] = {
        ticket_id: Number(t.id),
        remaining_minutes: remainingMinutes,
        is_breached: isBreached,
        is_warning: isWarning,
        deadline: new Date(deadlineMs).toISOString()
      };
    }

    return res.json({ success: true, data: out });
  } catch (error) {
    console.error('Error fetching bulk timers:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch SLA timers' });
  }
});

// Get all active tickets with SLA timers
router.get('/timers/active', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [tickets] = await pool.execute(`
      SELECT t.*, p.name as product_name, m.name as module_name
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id AND p.tenant_id = t.tenant_id
      LEFT JOIN modules m ON t.module_id = m.id AND m.tenant_id = t.tenant_id
      WHERE t.status IN ('new', 'in_progress') AND t.tenant_id = ?
      ORDER BY t.created_at ASC
    `, [tenantId]);

    const now = await getDbNow();
    const timerData = tickets.map(ticket => {
      const ticketCreatedAt = new Date(ticket.created_at);
      const resolutionTimeMinutes = ticket.sla_resolution_time_minutes || ticket.sla_response_time_minutes || 480;
      const slaTimeMinutes = resolutionTimeMinutes;
      const slaDeadline = new Date(ticketCreatedAt.getTime() + (slaTimeMinutes * 60 * 1000));
      
      const remainingMs = slaDeadline.getTime() - now.getTime();
      const remainingMinutes = Math.max(0, Math.floor(remainingMs / (1000 * 60)));
      
      const isBreached = remainingMs < 0;
      const isWarning = remainingMinutes <= 30 && remainingMinutes > 0;
      
      return {
        ticket_id: ticket.id,
        ticket_name: ticket.name,
        ticket_status: ticket.status,
        product_name: ticket.product_name || ticket.product || 'Unknown Product',
        module_name: ticket.module_name || ticket.module || 'Unknown Module',
        priority_level: ticket.priority_level || 'P2',
        sla_time_minutes: slaTimeMinutes,
        deadline: slaDeadline.toISOString(),
        remaining_minutes: remainingMinutes,
        remaining_hours: Math.floor(remainingMinutes / 60),
        remaining_days: Math.floor(remainingMinutes / (60 * 24)),
        is_breached: isBreached,
        is_warning: isWarning,
        status: ticket.status
      };
    });

    res.json({
      success: true,
      data: timerData
    });
  } catch (error) {
    console.error('Error getting active timers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get active timers'
    });
  }
});

// Check escalation eligibility (read-only; no side effects)
router.post('/timers/:ticketId/check-escalation', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { ticketId } = req.params;
    
    // Get ticket with module and SLA configuration info (tenant-filtered)
    const [tickets] = await pool.execute(`
      SELECT t.*, p.name as product_name, m.name as module_name
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id AND p.tenant_id = t.tenant_id
      LEFT JOIN modules m ON t.module_id = m.id AND m.tenant_id = t.tenant_id
      WHERE t.id = ? AND t.tenant_id = ?
    `, [ticketId, tenantId]);

    if (tickets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const ticket = tickets[0];
    const now = await getDbNow();
    const ticketCreatedAt = new Date(ticket.created_at);

    const resolutionTimeMinutes = ticket.sla_resolution_time_minutes || ticket.sla_response_time_minutes || 480;
    const slaDeadline = new Date(ticketCreatedAt.getTime() + (resolutionTimeMinutes * 60 * 1000));

    const isBreached = now.getTime() > slaDeadline.getTime();

    if (isBreached && ticket.status !== 'escalated' && ticket.status !== 'closed') {

      // Get manager to escalate to (tenant-filtered)
      const [managers] = await pool.execute(`
        SELECT id, name, email FROM agents WHERE role = 'support_manager' AND tenant_id = ? LIMIT 1
      `, [tenantId]);

      // Get CEO for notification (tenant-filtered)
      const [ceos] = await pool.execute(`
        SELECT id, name, email FROM agents WHERE role = 'ceo' AND tenant_id = ? LIMIT 1
      `, [tenantId]);

      const manager = managers.length > 0 ? managers[0] : null;
      const ceo = ceos.length > 0 ? ceos[0] : null;

      res.json({
        success: true,
        message: 'Ticket is breached (escalation eligible)',
        data: {
          ticket_id: ticketId,
          product_name: ticket.product_name || ticket.product || 'Unknown Product',
          module_name: ticket.module_name || ticket.module || 'Unknown Module',
          sla_time_minutes: resolutionTimeMinutes,
          breached_at: now.toISOString(),
          escalated_to: manager ? manager.name : 'No manager found',
          ceo_notified: ceo ? ceo.name : 'No CEO found'
        }
      });
    } else {
      res.json({
        success: true,
        message: 'No escalation needed',
        data: {
          is_breached: isBreached,
          sla_deadline: slaDeadline.toISOString()
        }
      });
    }
  } catch (error) {
    console.error('Error checking escalation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check escalation'
    });
  }
});

// Report breached tickets (read-only; no side effects)
router.post('/auto-escalate', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const now = await getDbNow();
    
    // Get all active tickets with their SLA configurations (tenant-filtered)
    const [activeTickets] = await pool.execute(`
      SELECT t.*, p.name as product_name, m.name as module_name
      FROM tickets t
      LEFT JOIN products p ON t.product_id = p.id AND p.tenant_id = t.tenant_id
      LEFT JOIN modules m ON t.module_id = m.id AND m.tenant_id = t.tenant_id
      WHERE t.status IN ('new', 'in_progress') AND t.tenant_id = ?
      ORDER BY t.created_at ASC
    `, [tenantId]);

    // Get manager and CEO for notifications (tenant-filtered)
    const [managers] = await pool.execute(`
      SELECT id, name, email FROM agents WHERE role = 'support_manager' AND tenant_id = ? LIMIT 1
    `, [tenantId]);
    const [ceos] = await pool.execute(`
      SELECT id, name, email FROM agents WHERE role = 'ceo' AND tenant_id = ? LIMIT 1
    `, [tenantId]);

    const manager = managers.length > 0 ? managers[0] : null;
    const ceo = ceos.length > 0 ? ceos[0] : null;

    let breachedCount = 0;

    for (const ticket of activeTickets) {
      const resolutionTimeMinutes = ticket.sla_resolution_time_minutes || ticket.sla_response_time_minutes || 480;
      const ticketCreatedAt = new Date(ticket.created_at);
      const resolutionDeadline = new Date(ticketCreatedAt.getTime() + (resolutionTimeMinutes * 60 * 1000));

      const isBreached = now.getTime() > resolutionDeadline.getTime();
      
      if (isBreached) {
        breachedCount++;
      }
    }

    res.json({
      success: true,
      message: `Found ${breachedCount} breached tickets`,
      data: {
        breached_tickets: breachedCount,
        manager_notified: manager ? manager.name : 'No manager found',
        ceo_notified: ceo ? ceo.name : 'No CEO found'
      }
    });
  } catch (error) {
    console.error('Error auto-escalating tickets:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to auto-escalate tickets'
    });
  }
});

// ===== MODULES MANAGEMENT =====

const PRIORITY_ALLOCATION_TYPES = new Set(['ai_only', 'user_then_ai_verify']);

function normalizePriorityAllocationType(input) {
  const v = String(input || '').trim().toLowerCase();
  return PRIORITY_ALLOCATION_TYPES.has(v) ? v : 'ai_only';
}

// GET /api/sla/products/:productId/modules - Get modules for a specific product
router.get('/products/:productId/modules', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { productId } = req.params;
    
    // Verify product belongs to tenant
    const [products] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND tenant_id = ?',
      [productId, tenantId]
    );
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    let query = `
      SELECT id, product_id, name, description, status, COALESCE(priority_allocation_type, 'ai_only') AS priority_allocation_type
      FROM modules 
      WHERE product_id = ? AND tenant_id = ? AND status = 'active'
    `;
    const params = [productId, tenantId];

    query += ' ORDER BY name ASC';

    const [modules] = await pool.execute(query, params);
    
    res.json({
      success: true,
      data: modules
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch modules'
    });
  }
});

// GET /api/sla/modules/:moduleId/configurations - Get SLA configurations for a specific module
router.get('/modules/:moduleId/configurations', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { moduleId } = req.params;
    
    // Verify module belongs to tenant
    const [modules] = await pool.execute(
      'SELECT id FROM modules WHERE id = ? AND tenant_id = ?',
      [moduleId, tenantId]
    );
    
    if (modules.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }
    
    const [configurations] = await pool.execute(`
      SELECT id, issue_name, issue_description, response_time_minutes, 
             resolution_time_minutes, priority_level, is_active
      FROM sla_configurations 
      WHERE module_id = ? AND tenant_id = ? AND is_active = TRUE
      ORDER BY response_time_minutes ASC, resolution_time_minutes ASC
    `, [moduleId, tenantId]);
    
    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error fetching SLA configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SLA configurations'
    });
  }
});

// Get all modules
router.get('/modules', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [modules] = await pool.execute(`
      SELECT m.*, p.name as product_name 
      FROM modules m 
      LEFT JOIN products p ON m.product_id = p.id AND p.tenant_id = m.tenant_id
      WHERE m.tenant_id = ?
      ORDER BY p.name, m.name
    `, [tenantId]);
    
    res.json({
      success: true,
      data: modules
    });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch modules'
    });
  }
});

// Create new module
router.post('/modules', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { product_id, name, description, status = 'active' } = req.body;
    const createdBy = getCreatedBy(req.user);
    
    if (!product_id || !name) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and module name are required'
      });
    }

    // Verify product belongs to tenant
    const [products] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND tenant_id = ?',
      [product_id, tenantId]
    );
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    const [prodPolicy] = await pool.execute(
      `SELECT COALESCE(priority_allocation_type, 'ai_only') AS priority_allocation_type
       FROM products WHERE id = ? AND tenant_id = ? LIMIT 1`,
      [product_id, tenantId]
    );
    const modulePat = normalizePriorityAllocationType(prodPolicy?.[0]?.priority_allocation_type);

    const [result] = await pool.execute(`
      INSERT INTO modules (tenant_id, product_id, name, description, status, created_by, priority_allocation_type, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [tenantId, product_id, name, description || null, status, createdBy, modulePat]);

    // Fetch the created module with all fields
    const [newModule] = await pool.execute(`
      SELECT m.*, p.name as product_name 
      FROM modules m 
      LEFT JOIN products p ON m.product_id = p.id AND p.tenant_id = m.tenant_id
      WHERE m.id = ? AND m.tenant_id = ?
    `, [result.insertId, tenantId]);

    res.status(201).json({
      success: true,
      message: 'Module created successfully',
      data: newModule[0]
    });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create module'
    });
  }
});

// Update module
router.put('/modules/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { name, description, status } = req.body;

    const [result] = await pool.execute(`
      UPDATE modules 
      SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `, [name, description || null, status, id, tenantId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }

    res.json({
      success: true,
      message: 'Module updated successfully'
    });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update module'
    });
  }
});

// Delete module
router.delete('/modules/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    // Check if module exists (tenant-filtered)
    const [modules] = await pool.execute(
      'SELECT * FROM modules WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (modules.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }
    
    // Check if module is used in SLA configurations (tenant-filtered)
    const [slaConfigs] = await pool.execute(
      'SELECT COUNT(*) as count FROM sla_configurations WHERE module_id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (slaConfigs[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete module - it is used in SLA configurations'
      });
    }
    
    // Delete the module (tenant-filtered)
    const [result] = await pool.execute(
      'DELETE FROM modules WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Module not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Module deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete module'
    });
  }
});

// ===== SLA CONFIGURATIONS MANAGEMENT =====

// Get all SLA configurations
router.get('/configurations', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const productId = req.query.product_id ? Number(req.query.product_id) : null;
    const moduleId = req.query.module_id ? Number(req.query.module_id) : null;
    let where = 'WHERE sc.tenant_id = ?';
    const params = [tenantId];
    if (Number.isFinite(productId)) {
      where += ' AND sc.product_id = ?';
      params.push(productId);
    }
    if (Number.isFinite(moduleId)) {
      where += ' AND sc.module_id = ?';
      params.push(moduleId);
    }
    const [configurations] = await pool.execute(`
      SELECT sc.*, p.name as product_name, m.name as module_name, u.name as created_by_name,
             CASE
               WHEN sc.product_id IS NOT NULL AND sc.module_id IS NOT NULL AND sc.issue_type_id IS NOT NULL THEN 'EXACT'
               WHEN sc.product_id IS NOT NULL AND sc.module_id IS NULL AND sc.issue_type_id IS NOT NULL THEN 'PRODUCT_ISSUE'
               WHEN sc.product_id IS NOT NULL AND sc.module_id IS NOT NULL AND sc.issue_type_id IS NULL THEN 'PRODUCT_MODULE'
               WHEN sc.product_id IS NOT NULL AND sc.module_id IS NULL AND sc.issue_type_id IS NULL THEN 'PRODUCT_DEFAULT'
               ELSE 'TENANT_DEFAULT'
             END AS scope_type
      FROM sla_configurations sc
      LEFT JOIN products p ON sc.product_id = p.id AND p.tenant_id = sc.tenant_id
      LEFT JOIN modules m ON sc.module_id = m.id AND m.tenant_id = sc.tenant_id
      LEFT JOIN users u ON sc.created_by = u.id AND u.tenant_id = sc.tenant_id
      ${where}
      ORDER BY scope_type, p.name, m.name, sc.issue_name
    `, params);
    
    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error fetching SLA configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SLA configurations'
    });
  }
});

// Get SLA performance rates
router.get('/performance-rates', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    console.log('🔍 Fetching SLA performance rates...');
    console.log('🔍 Tenant ID:', tenantId);
    
    // Get all SLA configurations with their time values (tenant-filtered)
    const [configurations] = await pool.execute(`
      SELECT sc.*, p.name as product_name, m.name as module_name
      FROM sla_configurations sc
      LEFT JOIN products p ON sc.product_id = p.id AND p.tenant_id = sc.tenant_id
      LEFT JOIN modules m ON sc.module_id = m.id AND m.tenant_id = sc.tenant_id
      WHERE sc.is_active = TRUE AND sc.tenant_id = ?
      ORDER BY p.name, m.name, sc.issue_name
    `, [tenantId]);
    
    console.log(`📊 Found ${configurations.length} SLA configurations`);
    console.log('📊 Configurations:', configurations.map(c => ({ 
      id: c.id, 
      product_id: c.product_id, 
      module_id: c.module_id, 
      issue_name: c.issue_name,
      issue_type_id: c.issue_type_id,
      response_time_minutes: c.response_time_minutes,
      resolution_time_minutes: c.resolution_time_minutes,
      product_name: c.product_name,
      module_name: c.module_name
    })));
    
    // Calculate performance rates for each configuration
    const performanceRates = await Promise.all(configurations.map(async config => {
      const slaResponseTimeMinutes = config.response_time_minutes;
      const slaResolutionTimeMinutes = config.resolution_time_minutes;
      
      // Get actual response and resolution times from tickets resolved with this SLA config
      // First try to find tickets with sla_config_id set
      let [tickets] = await pool.execute(`
        SELECT 
          first_response_at,
          resolved_at,
          created_at,
          status
        FROM tickets 
        WHERE sla_config_id = ? AND tenant_id = ?
        AND (first_response_at IS NOT NULL OR resolved_at IS NOT NULL)
      `, [config.id, tenantId]);
      
      console.log(`🔍 Query 1 (sla_config_id): Found ${tickets.length} tickets for config ${config.id}`);
      
      // Fallback: if no tickets found with sla_config_id, try matching by product_id, module_id, and issue_type
      if (tickets.length === 0) {
        console.log(`🔍 No tickets with sla_config_id, trying fallback match for product=${config.product_id}, module=${config.module_id}, issue_type=${config.issue_type_id || config.issue_name}`);
        
        // Build dynamic query based on which fields are NULL in the SLA config
        // SLA is module-wise, so we must filter by module_id when it's set
        let fallbackQuery = `
          SELECT 
            first_response_at,
            resolved_at,
            created_at,
            status
          FROM tickets 
          WHERE tenant_id = ?
        `;
        const fallbackParams = [tenantId];
        
        if (config.product_id !== null) {
          fallbackQuery += ` AND product_id = ?`;
          fallbackParams.push(config.product_id);
        }
        
        if (config.module_id !== null) {
          fallbackQuery += ` AND module_id = ?`;
          fallbackParams.push(config.module_id);
        }
        
        if (config.issue_type_id) {
          fallbackQuery += ` AND (issue_type_id = ? OR issue_type = ?)`;
          fallbackParams.push(config.issue_type_id, config.issue_name);
        } else if (config.issue_name) {
          fallbackQuery += ` AND (issue_type = ?)`;
          fallbackParams.push(config.issue_name);
        }
        
        fallbackQuery += ` AND (first_response_at IS NOT NULL OR resolved_at IS NOT NULL)`;
        
        console.log(`🔍 Fallback query: ${fallbackQuery}`);
        console.log(`🔍 Fallback params:`, fallbackParams);
        
        [tickets] = await pool.execute(fallbackQuery, fallbackParams);
        console.log(`🔍 Query 2 (fallback): Found ${tickets.length} tickets`);
      }
      
      console.log(`🔍 Module ${config.module_id} (${config.issue_name}): Found ${tickets.length} tickets with timestamps`);
      if (tickets.length > 0) {
        console.log('🔍 Sample ticket:', tickets[0]);
      }
      
      let responseTimePerformanceRate = 0;
      let resolutionTimePerformanceRate = 0;
      let avgActualResponseTime = 0;
      let avgActualResolutionTime = 0;
      
      if (tickets.length > 0) {
        // Calculate average actual response time (only for tickets with first_response_at)
        const responseTickets = tickets.filter(ticket => ticket.first_response_at);
        console.log(`🔍 Response tickets: ${responseTickets.length} out of ${tickets.length}`);
        if (responseTickets.length > 0) {
          const actualResponseTimes = responseTickets.map(ticket => {
            const created = new Date(ticket.created_at);
            const firstResponse = new Date(ticket.first_response_at);
            return (firstResponse - created) / (1000 * 60); // Convert to minutes (keep decimals)
          });
          
          avgActualResponseTime = actualResponseTimes.reduce((sum, time) => sum + time, 0) / actualResponseTimes.length;
          
          // Calculate Response Time Performance Rate: (Actual Response Time / SLA Response Time) × 100
          responseTimePerformanceRate = (avgActualResponseTime / slaResponseTimeMinutes) * 100;
          console.log(`🔍 Avg response time: ${avgActualResponseTime.toFixed(2)} min, SLA: ${slaResponseTimeMinutes} min, Rate: ${responseTimePerformanceRate.toFixed(2)}%`);
        }
        
        // Calculate average actual resolution time (only for tickets with resolved_at)
        const resolutionTickets = tickets.filter(ticket => ticket.resolved_at);
        console.log(`🔍 Resolution tickets: ${resolutionTickets.length} out of ${tickets.length}`);
        if (resolutionTickets.length > 0) {
          const actualResolutionTimes = resolutionTickets.map(ticket => {
            const created = new Date(ticket.created_at);
            const resolved = new Date(ticket.resolved_at);
            return (resolved - created) / (1000 * 60); // Convert to minutes (keep decimals)
          });
          
          avgActualResolutionTime = actualResolutionTimes.reduce((sum, time) => sum + time, 0) / actualResolutionTimes.length;
          
          // Calculate Resolution Time Performance Rate: (Actual Resolution Time / SLA Resolution Time) × 100
          resolutionTimePerformanceRate = (avgActualResolutionTime / slaResolutionTimeMinutes) * 100;
          console.log(`🔍 Avg resolution time: ${avgActualResolutionTime.toFixed(2)} min, SLA: ${slaResolutionTimeMinutes} min, Rate: ${resolutionTimePerformanceRate.toFixed(2)}%`);
        }
      } else {
        // No actual data available, show 0% or N/A
        responseTimePerformanceRate = 0;
        resolutionTimePerformanceRate = 0;
      }
      
      // Calculate Overall Performance Rate
      const overallPerformanceRate = (responseTimePerformanceRate + resolutionTimePerformanceRate) / 2;
      
      const result = {
        id: config.id,
        product_name: config.product_name,
        module_name: config.module_name,
        issue_name: config.issue_name,
        sla_response_time: slaResponseTimeMinutes,
        sla_resolution_time: slaResolutionTimeMinutes,
        avg_actual_response_time: Math.round(avgActualResponseTime * 100) / 100,
        avg_actual_resolution_time: Math.round(avgActualResolutionTime * 100) / 100,
        response_time_performance_rate: Math.round(responseTimePerformanceRate * 100) / 100,
        resolution_time_performance_rate: Math.round(resolutionTimePerformanceRate * 100) / 100,
        overall_performance_rate: Math.round(overallPerformanceRate * 100) / 100
      };
      
      console.log(`🔍 Result for ${config.issue_name}:`, result);
      return result;
    }));
    
    console.log(`✅ Calculated performance rates for ${performanceRates.length} configurations`);
    
    res.json({
      success: true,
      data: performanceRates
    });
  } catch (error) {
    console.error('Error calculating SLA performance rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate SLA performance rates'
    });
  }
});

// Get SLA configurations for a specific product
router.get('/products/:productId/configurations', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { productId } = req.params;
    
    // Verify product belongs to tenant
    const [products] = await pool.execute(
      'SELECT id FROM products WHERE id = ? AND tenant_id = ?',
      [productId, tenantId]
    );
    
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const [configurations] = await pool.execute(`
      SELECT sc.*, p.name as product_name, m.name as module_name, u.name as created_by_name
      FROM sla_configurations sc
      LEFT JOIN products p ON sc.product_id = p.id AND p.tenant_id = sc.tenant_id
      LEFT JOIN modules m ON sc.module_id = m.id AND m.tenant_id = sc.tenant_id
      LEFT JOIN users u ON sc.created_by = u.id AND u.tenant_id = sc.tenant_id
      WHERE sc.product_id = ? AND sc.tenant_id = ?
      ORDER BY m.name, sc.issue_name
    `, [productId, tenantId]);
    
    res.json({
      success: true,
      data: configurations
    });
  } catch (error) {
    console.error('Error fetching SLA configurations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SLA configurations'
    });
  }
});

// Create new SLA configuration
router.post('/configurations', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { product_id, module_id, issue_type_id, issue_name, issue_description, response_time_minutes, resolution_time_minutes, is_active = true } = req.body;
    const createdBy = getCreatedBy(req.user);

    const productId = product_id === '' || product_id === undefined ? null : Number(product_id);
    const moduleId = module_id === '' || module_id === undefined ? null : Number(module_id);
    const issueTypeId = normalizeIssueTypeId(issue_type_id || issue_name);

    if (!response_time_minutes || !resolution_time_minutes) {
      return res.status(400).json({
        success: false,
        message: 'Response Time and Resolution Time are required'
      });
    }
    if (productId !== null) {
      const [products] = await pool.execute('SELECT id FROM products WHERE id = ? AND tenant_id = ?', [productId, tenantId]);
      if (!products.length) return res.status(404).json({ success: false, message: 'Product not found' });
    }
    if (moduleId !== null) {
      const [modules] = await pool.execute('SELECT id FROM modules WHERE id = ? AND tenant_id = ?', [moduleId, tenantId]);
      if (!modules.length) return res.status(404).json({ success: false, message: 'Module not found' });
    }

    const [dups] = await pool.execute(
      `SELECT id FROM sla_configurations
       WHERE tenant_id = ?
         AND ((product_id = ?) OR (product_id IS NULL AND ? IS NULL))
         AND ((module_id = ?) OR (module_id IS NULL AND ? IS NULL))
         AND ((issue_type_id = ?) OR (issue_type_id IS NULL AND ? IS NULL))
       LIMIT 1`,
      [tenantId, productId, productId, moduleId, moduleId, issueTypeId, issueTypeId]
    );
    if (dups.length > 0) {
      return res.status(400).json({ success: false, message: 'Duplicate SLA rule for the same scope already exists' });
    }

    const [result] = await pool.execute(
      `INSERT INTO sla_configurations
       (tenant_id, product_id, module_id, issue_type_id, issue_name, issue_description, response_time_minutes, resolution_time_minutes, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tenantId, productId, moduleId, issueTypeId, issue_name || issue_type_id || 'Generic', issue_description || null, response_time_minutes, resolution_time_minutes, is_active, createdBy]
    );
    res.status(201).json({
      success: true,
      message: 'SLA configuration created successfully',
      data: { id: result.insertId }
    });
  } catch (error) {
    console.error('Error creating SLA configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create SLA configuration'
    });
  }
});

// Update SLA configuration
router.put('/configurations/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    const { product_id, module_id, issue_type_id, issue_name, issue_description, response_time_minutes, resolution_time_minutes, is_active } = req.body;
    const productId = product_id === '' || product_id === undefined ? null : Number(product_id);
    const moduleId = module_id === '' || module_id === undefined ? null : Number(module_id);
    const issueTypeId = normalizeIssueTypeId(issue_type_id || issue_name);
    const [dups] = await pool.execute(
      `SELECT id FROM sla_configurations
       WHERE tenant_id = ? AND id != ?
         AND ((product_id = ?) OR (product_id IS NULL AND ? IS NULL))
         AND ((module_id = ?) OR (module_id IS NULL AND ? IS NULL))
         AND ((issue_type_id = ?) OR (issue_type_id IS NULL AND ? IS NULL))
       LIMIT 1`,
      [tenantId, id, productId, productId, moduleId, moduleId, issueTypeId, issueTypeId]
    );
    if (dups.length > 0) {
      return res.status(400).json({ success: false, message: 'Duplicate SLA rule for the same scope already exists' });
    }

    const [result] = await pool.execute(`
      UPDATE sla_configurations 
      SET product_id = ?, module_id = ?, issue_type_id = ?, issue_name = ?, issue_description = ?, response_time_minutes = ?, resolution_time_minutes = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND tenant_id = ?
    `, [productId, moduleId, issueTypeId, issue_name || issue_type_id || 'Generic', issue_description || null, response_time_minutes, resolution_time_minutes, is_active, id, tenantId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA configuration not found'
      });
    }

    res.json({
      success: true,
      message: 'SLA configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating SLA configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SLA configuration'
    });
  }
});

// Delete SLA configuration
router.delete('/configurations/:id', authenticateToken, verifyTenantAccess, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;
    
    // Check if configuration exists (tenant-filtered)
    const [configurations] = await pool.execute(
      'SELECT * FROM sla_configurations WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (configurations.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA configuration not found'
      });
    }
    
    // Delete the configuration (tenant-filtered)
    const [result] = await pool.execute(
      'DELETE FROM sla_configurations WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'SLA configuration not found'
      });
    }
    
    res.json({
      success: true,
      message: 'SLA configuration deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting SLA configuration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete SLA configuration'
    });
  }
});

module.exports = router; 
