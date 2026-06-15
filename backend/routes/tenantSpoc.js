const express = require('express');
const { pool } = require('../database');
const { authenticateToken, hashPassword } = require('../middleware/auth');
const { verifyTenantAccess } = require('../middleware/tenant');
const emailService = require('../services/emailService');
const accountLifecycleService = require('../services/accountLifecycleService');
const router = express.Router();

/**
 * GET /api/tenant-spoc/my-tenant
 * Fetch tenant details for the logged-in SPOC
 */
router.get('/my-tenant', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    const [tenants] = await pool.execute('SELECT * FROM tenants WHERE id = ?', [tenantId]);
    
    if (tenants.length === 0) {
      return res.status(404).json({ success: false, message: 'Tenant not found' });
    }

    res.json({
      success: true,
      data: tenants[0]
    });
  } catch (error) {
    console.error('Error fetching SPOC tenant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tenant details'
    });
  }
});

/**
 * GET /api/tenant-spoc/my-tenant/products
 * Fetch all products for the tenant (SPOC's tenant)
 */
router.get('/my-tenant/products', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      console.log('❌ User is not associated with a tenant');
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    const [products] = await pool.execute(
      'SELECT * FROM products WHERE tenant_id = ? AND status = ? ORDER BY name ASC',
      [tenantId, 'active']
    );

    // Add ticket counts for each product
    for (const product of products) {
      const [ticketCounts] = await pool.execute(
        'SELECT COUNT(*) as total, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as sla_breached FROM tickets WHERE tenant_id = ? AND product_id = ?',
        ['closed', tenantId, product.id]
      );
      product.ticket_stats = ticketCounts[0];
    }

    res.json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching tenant products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products'
    });
  }
});

/**
 * GET /api/tenant-spoc/my-tenant/product-spocs
 * Fetch Product SPOCs for the tenant
 */
router.get('/my-tenant/product-spocs', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    const [spocs] = await pool.execute(
      `SELECT a.id, a.name, a.email, a.phone, a.product_scope_id, p.name as product_name
       FROM agents a
       LEFT JOIN products p ON a.product_scope_id = p.id
       WHERE a.tenant_id = ? AND a.role = 'product_spoc' AND a.is_active = TRUE
       ORDER BY a.name ASC`,
      [tenantId]
    );

    res.json({
      success: true,
      data: spocs
    });
  } catch (error) {
    console.error('Error fetching product SPOCs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch product SPOCs'
    });
  }
});

/**
 * POST /api/tenant-spoc/my-tenant/product-spocs
 * Create a new Product SPOC
 */
router.post('/my-tenant/product-spocs', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, email, phone, product_scope_id } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    if (!name || !email || !product_scope_id) {
      return res.status(400).json({ success: false, message: 'Name, email, and product scope are required' });
    }

    // Check if agent already exists
    const [existingAgents] = await pool.execute(
      'SELECT id FROM agents WHERE email = ? AND tenant_id = ?',
      [email, tenantId]
    );

    let spocAgentId;

    if (existingAgents.length > 0) {
      // Update existing agent to product_spoc
      spocAgentId = existingAgents[0].id;
      await pool.execute(
        "UPDATE agents SET role = 'product_spoc', product_scope_id = ?, phone = COALESCE(phone, ?), is_active = TRUE WHERE id = ?",
        [product_scope_id, phone, spocAgentId]
      );
    } else {
      // Create new agent with temporary password (will be reset on first login)
      const tempPassword = await hashPassword('TempPass123!');
      const [result] = await pool.execute(
        `INSERT INTO agents (name, email, role, password_hash, product_scope_id, tenant_id, phone, is_active, user_type, availability_status)
         VALUES (?, ?, 'product_spoc', ?, ?, ?, ?, TRUE, 'staff', 'available')`,
        [name, email, tempPassword, product_scope_id, tenantId, phone]
      );
      spocAgentId = result.insertId;
    }

    // Send welcome email
    await accountLifecycleService.sendWelcomeEmail({
      to: email,
      name,
      role: 'Product SPOC',
      productName: (await pool.execute('SELECT name FROM products WHERE id = ?', [product_scope_id]))[0][0]?.name || 'Product'
    });

    res.json({
      success: true,
      message: 'Product SPOC created successfully',
      data: { id: spocAgentId, name, email }
    });
  } catch (error) {
    console.error('Error creating product SPOC:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create product SPOC'
    });
  }
});

/**
 * PUT /api/tenant-spoc/my-tenant/product-spocs/:id
 * Update a Product SPOC
 */
router.put('/my-tenant/product-spocs/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const spocId = req.params.id;
    const { name, phone, product_scope_id } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    await pool.execute(
      "UPDATE agents SET name = ?, phone = ?, product_scope_id = ? WHERE id = ? AND tenant_id = ?",
      [name, phone, product_scope_id, spocId, tenantId]
    );

    // Update product_spoc_mapping
    await pool.execute(
      'UPDATE product_spoc_mapping SET product_id = ? WHERE spoc_user_id = ?',
      [product_scope_id, spocId]
    );

    res.json({
      success: true,
      message: 'Product SPOC updated successfully'
    });
  } catch (error) {
    console.error('Error updating product SPOC:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update product SPOC'
    });
  }
});

/**
 * DELETE /api/tenant-spoc/my-tenant/product-spocs/:id
 * Delete a Product SPOC
 */
router.delete('/my-tenant/product-spocs/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const spocId = req.params.id;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    await pool.execute(
      "UPDATE agents SET role = 'agent', product_scope_id = NULL WHERE id = ? AND tenant_id = ?",
      [spocId, tenantId]
    );

    await pool.execute(
      'DELETE FROM product_spoc_mapping WHERE spoc_user_id = ?',
      [spocId]
    );

    res.json({
      success: true,
      message: 'Product SPOC removed successfully'
    });
  } catch (error) {
    console.error('Error removing product SPOC:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product SPOC'
    });
  }
});

/**
 * GET /api/tenant-spoc/my-tenant/users
 * Fetch tenant users who raised tickets
 */
router.get('/my-tenant/users', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    const [users] = await pool.execute(
      `SELECT DISTINCT u.id, u.name, u.email, u.role, u.is_active, u.created_at
       FROM users u
       WHERE u.tenant_id = ?
       ORDER BY u.created_at DESC`,
      [tenantId]
    );

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Error fetching tenant users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * GET /api/tenant-spoc/my-tenant/ceos
 * Fetch CEOs for the tenant
 */
router.get('/my-tenant/ceos', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    const [ceos] = await pool.execute(
      `SELECT a.id, a.name, a.email, a.phone, a.is_active, a.created_at, a.last_login
       FROM agents a
       WHERE a.tenant_id = ? AND a.role = 'ceo'
       ORDER BY a.created_at DESC`,
      [tenantId]
    );

    res.json({
      success: true,
      data: ceos
    });
  } catch (error) {
    console.error('Error fetching CEOs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch CEOs'
    });
  }
});

/**
 * POST /api/tenant-spoc/my-tenant/ceos
 * Create a new CEO
 */
router.post('/my-tenant/ceos', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, email, phone } = req.body;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // Check if CEO already exists
    const [existingAgents] = await pool.execute(
      'SELECT id FROM agents WHERE email = ? AND tenant_id = ?',
      [email, tenantId]
    );

    if (existingAgents.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'An agent with this email already exists'
      });
    }

    // Generate password setup token
    const crypto = require('crypto');
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Create CEO agent account
    const [result] = await pool.execute(
      `INSERT INTO agents (
        tenant_id, name, email, phone, role, password_hash, is_active,
        password_setup_token, password_setup_token_expires, user_type, availability_status
      ) VALUES (?, ?, ?, ?, 'ceo', NULL, FALSE, ?, ?, 'staff', 'available')`,
      [tenantId, name, email.toLowerCase(), phone || null, setupToken, setupTokenExpires]
    );

    const ceoId = result.insertId;

    // Send setup email
    try {
      const emailService = require('../services/emailService');
      const baseUrl = process.env.FRONTEND_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
      const setupLink = `${baseUrl}/staff/set-password?token=${setupToken}`;
      await emailService.sendStaffSetupEmail(email, name, setupLink);
    } catch (emailError) {
      console.warn('⚠️ Failed to send CEO setup email:', emailError.message);
    }

    res.json({
      success: true,
      message: 'CEO created successfully',
      data: { id: ceoId, name, email }
    });
  } catch (error) {
    console.error('Error creating CEO:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create CEO'
    });
  }
});

/**
 * DELETE /api/tenant-spoc/my-tenant/ceos/:id
 * Delete a CEO
 */
router.delete('/my-tenant/ceos/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const ceoId = req.params.id;

    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    await pool.execute(
      "DELETE FROM agents WHERE id = ? AND tenant_id = ? AND role = 'ceo'",
      [ceoId, tenantId]
    );

    res.json({
      success: true,
      message: 'CEO removed successfully'
    });
  } catch (error) {
    console.error('Error removing CEO:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove CEO'
    });
  }
});

/**
 * GET /api/tenant-spoc/my-tenant/analytics
 * Fetch tenant-level reporting/analytics
 */
router.get('/my-tenant/analytics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ success: false, message: 'User is not associated with a tenant' });
    }

    // Ticket counts by status
    const [statusCounts] = await pool.execute(
      `SELECT status, COUNT(*) as count FROM tickets 
       WHERE tenant_id = ? 
       GROUP BY status`,
      [tenantId]
    );

    // Product SPOC count
    const [productSpocCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM users 
       WHERE tenant_id = ? AND role = 'product_spoc' AND is_active = TRUE`,
      [tenantId]
    );

    // Active users count
    const [activeUsersCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM users 
       WHERE tenant_id = ? AND is_active = TRUE`,
      [tenantId]
    );

    // Product count
    const [productCount] = await pool.execute(
      `SELECT COUNT(*) as count FROM products 
       WHERE tenant_id = ? AND status = 'active'`,
      [tenantId]
    );

    res.json({
      success: true,
      data: {
        statusCounts: statusCounts.reduce((acc, row) => {
          acc[row.status] = row.count;
          return acc;
        }, {}),
        productSpocCount: productSpocCount[0]?.count || 0,
        activeUsersCount: activeUsersCount[0]?.count || 0,
        productCount: productCount[0]?.count || 0
      }
    });
  } catch (error) {
    console.error('Error fetching tenant analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

module.exports = router;
