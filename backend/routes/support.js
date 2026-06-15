const express = require('express');
const { pool } = require('../database');
const { authenticateToken } = require('../middleware/auth');
const { setTenantContext, verifyTenantAccess } = require('../middleware/tenant');
const router = express.Router();

// Apply tenant context to all routes
router.use(setTenantContext);

// POST /api/support/log-call - Log support calls from external systems (GRC, etc.)
router.post('/log-call', async (req, res) => {
  try {
    console.log('📞 Support call received:', req.body);
    
    const { email, name, product, currentPage, timestamp, phone } = req.body;
    
    // Validate required fields
    if (!email || !product) {
      return res.status(400).json({
        success: false,
        message: 'Email and product are required'
      });
    }

    // Find or create user by email (tenant-filtered)
    const tenantId = req.tenantId || 1;
    let [users] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND tenant_id = ?',
      [email, tenantId]
    );

    let userId;
    if (users.length === 0) {
      // Create new user if doesn't exist (with tenant_id)
      console.log('👤 Creating new user for support call:', email);
      
      const [result] = await pool.execute(
        `INSERT INTO users (tenant_id, name, email, phone, created_at, is_active) 
         VALUES (?, ?, ?, ?, NOW(), 1)`,
        [tenantId, name || email.split('@')[0], email, phone || null]
      );

      userId = result.insertId;
      console.log('✅ New user created for support:', userId);
    } else {
      userId = users[0].id;
      
      // Update user info if provided (tenant-filtered)
      if (name && name !== users[0].name) {
        await pool.execute(
          'UPDATE users SET name = ? WHERE id = ? AND tenant_id = ?',
          [name, userId, tenantId]
        );
      }
      
      if (phone && phone !== users[0].phone) {
        await pool.execute(
          'UPDATE users SET phone = ? WHERE id = ? AND tenant_id = ?',
          [phone, userId, tenantId]
        );
      }
    }

    // Log the support call
    const [supportLog] = await pool.execute(
      `INSERT INTO support_calls (user_id, product, context, current_page, source) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        userId,
        product,
        JSON.stringify({
          email,
          name,
          product,
          currentPage,
          timestamp,
          phone
        }),
        currentPage || 'unknown',
        'external_integration'
      ]
    );

    console.log('✅ Support call logged successfully:', supportLog.insertId);

    res.json({
      success: true,
      message: 'Support call logged successfully',
      data: {
        userId,
        supportCallId: supportLog.insertId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error logging support call:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log support call',
      error: error.message
    });
  }
});

// GET /api/support/calls/:userId - Get support call history for a user
router.get('/calls/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const [supportCalls] = await pool.execute(
      `SELECT sc.*, u.name, u.email 
       FROM support_calls sc 
       JOIN users u ON sc.user_id = u.id 
       WHERE sc.user_id = ? 
       ORDER BY sc.timestamp DESC`,
      [userId]
    );

    res.json({
      success: true,
      data: supportCalls
    });

  } catch (error) {
    console.error('Error fetching support calls:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support calls'
    });
  }
});

// GET /api/support/stats - Get support statistics (admin only)
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you may need to adjust this based on your auth system)
    const [user] = await pool.execute(
      'SELECT role FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user[0] || user[0].role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Get support statistics
    const [totalCalls] = await pool.execute(
      'SELECT COUNT(*) as total FROM support_calls'
    );

    const [productStats] = await pool.execute(
      'SELECT product, COUNT(*) as count FROM support_calls GROUP BY product'
    );

    const [recentCalls] = await pool.execute(
      `SELECT sc.*, u.name, u.email 
       FROM support_calls sc 
       JOIN users u ON sc.user_id = u.id 
       ORDER BY sc.timestamp DESC 
       LIMIT 10`
    );

    res.json({
      success: true,
      data: {
        totalCalls: totalCalls[0].total,
        productStats,
        recentCalls
      }
    });

  } catch (error) {
    console.error('Error fetching support stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch support statistics'
    });
  }
});

module.exports = router;
