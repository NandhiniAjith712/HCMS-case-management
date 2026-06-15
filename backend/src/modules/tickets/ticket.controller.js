const { body, validationResult } = require('express-validator');
const ticketService = require('./ticket.service');
const { HTTP_STATUS } = require('../../shared/utils/constants');

class TicketController {
  async createTicket(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.user?.userId || null;
      
      // Handle file upload
      const ticketData = {
        ...req.body,
        attachmentName: req.file ? req.file.filename : null,
        attachmentType: req.file ? req.file.mimetype : null,
        attachment: req.file ? req.file.path : null
      };

      const result = await ticketService.createTicket(ticketData, userId);

      res.status(HTTP_STATUS.CREATED).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTickets(req, res, next) {
    try {
      const filters = {
        status: req.query.status,
        assignedTo: req.query.assignedTo
      };

      const result = await ticketService.getTickets(filters);
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTicketById(req, res, next) {
    try {
      const { id } = req.params;
      const result = await ticketService.getTicketById(id);
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateTicketStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const result = await ticketService.updateTicketStatus(id, status, userId);
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  async assignTicket(req, res, next) {
    try {
      const { id } = req.params;
      const { assignedTo } = req.body;
      const assignedBy = req.user?.userId;

      if (!assignedBy) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const result = await ticketService.assignTicket(id, assignedTo, assignedBy);
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getTicketStats(req, res, next) {
    try {
      const result = await ticketService.getTicketStats();
      res.status(HTTP_STATUS.OK).json(result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new TicketController(); 