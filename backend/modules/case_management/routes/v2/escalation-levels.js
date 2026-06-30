/**
 * HCMS Escalation Level Configuration API (v2)
 * Manages configurable L1-L5 escalation hierarchy with user assignments.
 * Base: /api/v2/escalation-levels
 */
const express = require('express');
const { pool } = require('../../../shared/database/database');
const { authenticate, authorizeRoles } = require('../../../auth/middleware/auth.middleware');
const { ROLES } = require('../../../auth/constants/roles');

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

// ─── GET /api/v2/escalation-levels ───
// Get all escalation levels for a tenant
router.get('/', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const tenantId = req.user.tenantId || 1;

    const [levels] = await pool.execute(
      `SELECT id, level, name, description, tenant_id, is_active, created_at, updated_at
       FROM escalation_levels
       WHERE tenant_id = ? AND is_active = TRUE
       ORDER BY FIELD(level, 'L1', 'L2', 'L3', 'L4', 'L5')`,
      [tenantId]
    );

    // Get user assignments for each level
    const [assignments] = await pool.execute(
      `SELECT ela.id, ela.user_id, ela.escalation_level_id, ela.tenant_id, 
              ela.assigned_at, ela.assigned_by, ela.is_active,
              u.name as user_name, u.email as user_email, u.role as user_role,
              ab.name as assigned_by_name
       FROM escalation_level_assignments ela
       LEFT JOIN users u ON ela.user_id = u.id
       LEFT JOIN users ab ON ela.assigned_by = ab.id
       WHERE ela.tenant_id = ? AND ela.is_active = TRUE
       ORDER BY ela.escalation_level_id, u.name`,
      [tenantId]
    );

    // Group assignments by escalation level
    const assignmentsByLevel = {};
    assignments.forEach(assignment => {
      if (!assignmentsByLevel[assignment.escalation_level_id]) {
        assignmentsByLevel[assignment.escalation_level_id] = [];
      }
      assignmentsByLevel[assignment.escalation_level_id].push(assignment);
    });

    // Attach assignments to each level
    const levelsWithAssignments = levels.map(level => ({
      ...level,
      assignments: assignmentsByLevel[level.id] || []
    }));

    res.json({ success: true, levels: levelsWithAssignments });
  } catch (error) {
    console.error('[v2/escalation-levels] GET / error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch escalation levels' });
  }
});

// ─── GET /api/v2/escalation-levels/:id ───
// Get a specific escalation level with its assignments
router.get('/:id', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId || 1;

    const [levels] = await pool.execute(
      `SELECT id, level, name, description, tenant_id, is_active, created_at, updated_at
       FROM escalation_levels
       WHERE id = ? AND tenant_id = ? AND is_active = TRUE`,
      [id, tenantId]
    );

    if (levels.length === 0) {
      return res.status(404).json({ success: false, message: 'Escalation level not found' });
    }

    const [assignments] = await pool.execute(
      `SELECT ela.id, ela.user_id, ela.escalation_level_id, ela.tenant_id, 
              ela.assigned_at, ela.assigned_by, ela.is_active,
              u.name as user_name, u.email as user_email, u.role as user_role,
              ab.name as assigned_by_name
       FROM escalation_level_assignments ela
       LEFT JOIN users u ON ela.user_id = u.id
       LEFT JOIN users ab ON ela.assigned_by = ab.id
       WHERE ela.escalation_level_id = ? AND ela.tenant_id = ? AND ela.is_active = TRUE
       ORDER BY u.name`,
      [id, tenantId]
    );

    res.json({ success: true, level: { ...levels[0], assignments } });
  } catch (error) {
    console.error('[v2/escalation-levels] GET /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch escalation level' });
  }
});

// ─── POST /api/v2/escalation-levels ───
// Create a new escalation level
router.post('/', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { level, name, description } = req.body;
    const tenantId = req.user.tenantId || 1;

    // Validate level
    if (!['L1', 'L2', 'L3', 'L4', 'L5'].includes(level)) {
      return res.status(400).json({ success: false, message: 'Invalid escalation level. Must be L1-L5' });
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    // Check if an active level already exists for this tenant
    const [existing] = await pool.execute(
      `SELECT id FROM escalation_levels WHERE level = ? AND tenant_id = ? AND is_active = TRUE`,
      [level, tenantId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: `Level ${level} already exists for this tenant` });
    }

    const [result] = await pool.execute(
      `INSERT INTO escalation_levels (level, name, description, tenant_id)
       VALUES (?, ?, ?, ?)`,
      [level, name.trim(), description || null, tenantId]
    );

    const [newLevel] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ?`,
      [result.insertId]
    );

    res.json({ success: true, level: newLevel[0] });
  } catch (error) {
    console.error('[v2/escalation-levels] POST / error:', error);
    res.status(500).json({ success: false, message: 'Failed to create escalation level' });
  }
});

// ─── PUT /api/v2/escalation-levels/:id ───
// Update an escalation level
router.put('/:id', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;
    const tenantId = req.user.tenantId || 1;

    // Check if level exists, is active, and belongs to tenant
    const [existing] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ? AND tenant_id = ? AND is_active = TRUE`,
      [id, tenantId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Escalation level not found' });
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, message: 'Name must be a non-empty string' });
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    params.push(id);

    await pool.execute(
      `UPDATE escalation_levels SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const [updatedLevel] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ?`,
      [id]
    );

    res.json({ success: true, level: updatedLevel[0] });
  } catch (error) {
    console.error('[v2/escalation-levels] PUT /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to update escalation level' });
  }
});

// ─── DELETE /api/v2/escalation-levels/:id ───
// Delete an escalation level (soft delete by setting is_active = false)
router.delete('/:id', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.user.tenantId || 1;

    // Check if level exists, is active, and belongs to tenant
    const [existing] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ? AND tenant_id = ? AND is_active = TRUE`,
      [id, tenantId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Escalation level not found' });
    }

    // Check if there are active cases at this level
    const [activeCases] = await pool.execute(
      `SELECT COUNT(*) as count FROM cases WHERE escalation_level = ? AND status != 'closed' AND status != 'resolved'`,
      [existing[0].level]
    );

    if (activeCases[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete escalation level with active cases. Please reassign or close cases first.'
      });
    }

    // Check if there are active user assignments for this level
    const [activeAssignments] = await pool.execute(
      `SELECT COUNT(*) as count FROM escalation_level_assignments WHERE escalation_level_id = ? AND is_active = TRUE`,
      [id]
    );

    if (activeAssignments[0].count > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete escalation level with active user assignments. Please remove assignments first.'
      });
    }

    // Soft delete
    await pool.execute(
      `UPDATE escalation_levels SET is_active = FALSE WHERE id = ?`,
      [id]
    );

    // Deactivate all assignments for this level
    await pool.execute(
      `UPDATE escalation_level_assignments SET is_active = FALSE WHERE escalation_level_id = ?`,
      [id]
    );

    res.json({ success: true, message: 'Escalation level deleted successfully' });
  } catch (error) {
    console.error('[v2/escalation-levels] DELETE /:id error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete escalation level' });
  }
});

// ─── POST /api/v2/escalation-levels/:id/assign ───
// Assign a user to an escalation level
router.post('/:id/assign', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    const tenantId = req.user.tenantId || 1;
    const userId = req.user.id;

    // Validate user_id
    if (!user_id) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    // Check if escalation level exists, is active, and belongs to tenant
    const [level] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ? AND tenant_id = ? AND is_active = TRUE`,
      [id, tenantId]
    );

    if (level.length === 0) {
      return res.status(404).json({ success: false, message: 'Escalation level not found' });
    }

    // Check if user exists and is active
    const [user] = await pool.execute(
      `SELECT id, name, is_active FROM users WHERE id = ?`,
      [user_id]
    );

    if (user.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user[0].is_active === 0 || user[0].is_active === false) {
      return res.status(400).json({ success: false, message: 'Cannot assign inactive users to escalation levels' });
    }

    // Check if user is already assigned to this level
    const [existing] = await pool.execute(
      `SELECT id FROM escalation_level_assignments 
       WHERE user_id = ? AND escalation_level_id = ? AND tenant_id = ? AND is_active = TRUE`,
      [user_id, id, tenantId]
    );

    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'User is already assigned to this escalation level' });
    }

    // Create assignment
    const [result] = await pool.execute(
      `INSERT INTO escalation_level_assignments (user_id, escalation_level_id, tenant_id, assigned_by)
       VALUES (?, ?, ?, ?)`,
      [user_id, id, tenantId, userId]
    );

    res.json({ success: true, message: 'User assigned to escalation level successfully' });
  } catch (error) {
    console.error('[v2/escalation-levels] POST /:id/assign error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign user to escalation level' });
  }
});

// ─── DELETE /api/v2/escalation-levels/:id/assign/:userId ───
// Remove a user from an escalation level
router.delete('/:id/assign/:userId', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { id, userId: targetUserId } = req.params;
    const tenantId = req.user.tenantId || 1;

    // Check if escalation level exists, is active, and belongs to tenant
    const [level] = await pool.execute(
      `SELECT * FROM escalation_levels WHERE id = ? AND tenant_id = ? AND is_active = TRUE`,
      [id, tenantId]
    );

    if (level.length === 0) {
      return res.status(404).json({ success: false, message: 'Escalation level not found' });
    }

    // Soft delete assignment
    await pool.execute(
      `UPDATE escalation_level_assignments 
       SET is_active = FALSE 
       WHERE user_id = ? AND escalation_level_id = ? AND tenant_id = ?`,
      [targetUserId, id, tenantId]
    );

    res.json({ success: true, message: 'User removed from escalation level successfully' });
  } catch (error) {
    console.error('[v2/escalation-levels] DELETE /:id/assign/:userId error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove user from escalation level' });
  }
});

// ─── GET /api/v2/escalation-levels/users/:userId ───
// Get all escalation levels assigned to a specific user
router.get('/users/:userId', authenticate, authorizeRoles(ROLES.ADMIN), async (req, res) => {
  try {
    const { userId } = req.params;
    const tenantId = req.user.tenantId || 1;

    const [assignments] = await pool.execute(
      `SELECT ela.id, ela.user_id, ela.escalation_level_id, ela.assigned_at, ela.is_active,
              el.level, el.name as level_name, el.description as level_description,
              u.name as user_name, u.email as user_email
       FROM escalation_level_assignments ela
       JOIN escalation_levels el ON ela.escalation_level_id = el.id
       JOIN users u ON ela.user_id = u.id
       WHERE ela.user_id = ? AND ela.tenant_id = ? AND ela.is_active = TRUE
       ORDER BY FIELD(el.level, 'L1', 'L2', 'L3', 'L4', 'L5')`,
      [userId, tenantId]
    );

    res.json({ success: true, assignments });
  } catch (error) {
    console.error('[v2/escalation-levels] GET /users/:userId error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user escalation levels' });
  }
});

module.exports = router;
