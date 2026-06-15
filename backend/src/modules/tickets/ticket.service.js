const { pool } = require('../../shared/config/database');
const { logError, logInfo } = require('../../shared/utils/logger');
const { TICKET_STATUS, HTTP_STATUS } = require('../../shared/utils/constants');
const { AppError } = require('../../shared/middleware/errorHandler');

class TicketService {
  async createTicket(ticketData, userId = null) {
    try {
      const {
        name,
        email,
        mobile,
        description,
        issueType,
        issueTypeOther,
        issueTitle,
        attachmentName,
        attachmentType,
        attachment
      } = ticketData;

      const [result] = await pool.execute(
        `INSERT INTO tickets (user_id, name, email, mobile, description, issue_type, 
         issue_type_other, issue_title, attachment_name, attachment_type, attachment) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, email, mobile, description, issueType, issueTypeOther, 
         issueTitle, attachmentName, attachmentType, attachment]
      );

      logInfo('Ticket created', { ticketId: result.insertId, email });

      return {
        success: true,
        ticketId: result.insertId,
        message: 'Ticket created successfully'
      };
    } catch (error) {
      logError('Ticket creation failed', error);
      throw new AppError('Failed to create ticket', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async getTickets(filters = {}) {
    try {
      let query = `
        SELECT id, name, email, mobile, description, issue_type, issue_type_other, 
               issue_title, attachment_name, attachment_type, status, priority,
               assigned_to, assigned_by, created_at, updated_at
        FROM tickets
      `;
      const params = [];

      // Apply filters
      if (filters.status && Object.values(TICKET_STATUS).includes(filters.status)) {
        query += ' WHERE status = ?';
        params.push(filters.status);
      }

      if (filters.assignedTo) {
        query += params.length > 0 ? ' AND assigned_to = ?' : ' WHERE assigned_to = ?';
        params.push(filters.assignedTo);
      }

      query += ' ORDER BY created_at DESC';

      const [tickets] = await pool.execute(query, params);

      return {
        success: true,
        data: tickets,
        count: tickets.length
      };
    } catch (error) {
      logError('Failed to fetch tickets', error);
      throw new AppError('Failed to fetch tickets', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async getTicketById(ticketId) {
    try {
      const [tickets] = await pool.execute(
        'SELECT * FROM tickets WHERE id = ?',
        [ticketId]
      );

      if (tickets.length === 0) {
        throw new AppError('Ticket not found', HTTP_STATUS.NOT_FOUND);
      }

      return {
        success: true,
        data: tickets[0]
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Failed to fetch ticket', error);
      throw new AppError('Failed to fetch ticket', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async updateTicketStatus(ticketId, status, userId) {
    try {
      if (!Object.values(TICKET_STATUS).includes(status)) {
        throw new AppError('Invalid status', HTTP_STATUS.BAD_REQUEST);
      }

      // Get current ticket status to check if we need to record timestamps
      const [currentTicket] = await pool.execute(
        'SELECT status, first_response_at, resolved_at FROM tickets WHERE id = ?',
        [ticketId]
      );

      if (currentTicket.length === 0) {
        throw new AppError('Ticket not found', HTTP_STATUS.NOT_FOUND);
      }

      const currentStatus = currentTicket[0].status;
      const now = new Date();

      // Prepare update query with timestamp tracking
      let updateQuery = 'UPDATE tickets SET status = ?, assigned_by = ?';
      let queryParams = [status, userId];

      // Record first response time when status changes to 'in_progress'
      if (status === 'in_progress' && currentStatus !== 'in_progress' && !currentTicket[0].first_response_at) {
        updateQuery += ', first_response_at = ?';
        queryParams.push(now);
        console.log(`📝 Recording first response time for ticket ${ticketId}: ${now.toISOString()}`);
      }

      // Record resolution time when status changes to 'closed'
      if (status === 'closed' && currentStatus !== 'closed' && !currentTicket[0].resolved_at) {
        updateQuery += ', resolved_at = ?';
        queryParams.push(now);
        console.log(`📝 Recording resolution time for ticket ${ticketId}: ${now.toISOString()}`);
      }

      queryParams.push(ticketId);
      updateQuery += ' WHERE id = ?';

      const [result] = await pool.execute(updateQuery, queryParams);

      if (result.affectedRows === 0) {
        throw new AppError('Ticket not found', HTTP_STATUS.NOT_FOUND);
      }

      logInfo('Ticket status updated', { ticketId, status, userId });

      return {
        success: true,
        message: 'Ticket status updated successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Failed to update ticket status', error);
      throw new AppError('Failed to update ticket status', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async assignTicket(ticketId, assignedTo, assignedBy) {
    try {
      const [result] = await pool.execute(
        'UPDATE tickets SET assigned_to = ?, assigned_by = ? WHERE id = ?',
        [assignedTo, assignedBy, ticketId]
      );

      if (result.affectedRows === 0) {
        throw new AppError('Ticket not found', HTTP_STATUS.NOT_FOUND);
      }

      logInfo('Ticket assigned', { ticketId, assignedTo, assignedBy });

      return {
        success: true,
        message: 'Ticket assigned successfully'
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logError('Failed to assign ticket', error);
      throw new AppError('Failed to assign ticket', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  async getTicketStats() {
    try {
      const [stats] = await pool.execute(`
        SELECT 
          status,
          COUNT(*) as count
        FROM tickets 
        GROUP BY status
      `);

      const totalTickets = stats.reduce((sum, stat) => sum + stat.count, 0);

      return {
        success: true,
        data: {
          stats,
          total: totalTickets
        }
      };
    } catch (error) {
      logError('Failed to fetch ticket stats', error);
      throw new AppError('Failed to fetch ticket stats', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = new TicketService(); 