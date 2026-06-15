/**
 * Text Formatting Middleware
 * Automatically formats all incoming request data
 */

const TextFormatter = require('../utils/textFormatter');

/**
 * Middleware to format request body data
 */
const formatRequestBody = (req, res, next) => {
  try {
    if (req.body && typeof req.body === 'object') {
      // Format ticket data if present
      if (req.body.name && typeof req.body.name === 'string') req.body.name = TextFormatter.formatName(req.body.name);
      if (req.body.email && typeof req.body.email === 'string') req.body.email = TextFormatter.formatEmail(req.body.email);
      if (req.body.mobile && typeof req.body.mobile === 'string') req.body.mobile = TextFormatter.formatMobile(req.body.mobile);
      if (req.body.product && typeof req.body.product === 'string') req.body.product = TextFormatter.formatProduct(req.body.product);
      if (req.body.issueType && typeof req.body.issueType === 'string') req.body.issueType = TextFormatter.formatIssueType(req.body.issueType);
      if (req.body.issueTypeOther && typeof req.body.issueTypeOther === 'string') req.body.issueTypeOther = TextFormatter.formatGenericText(req.body.issueTypeOther, 100);
      if (req.body.issueTitle && typeof req.body.issueTitle === 'string') req.body.issueTitle = TextFormatter.formatIssueTitle(req.body.issueTitle);
      if (req.body.description && typeof req.body.description === 'string') req.body.description = TextFormatter.formatDescription(req.body.description);
      
      // Format reply data if present
      if (req.body.agentName && typeof req.body.agentName === 'string') req.body.agentName = TextFormatter.formatAgentName(req.body.agentName);
      if (req.body.message && typeof req.body.message === 'string') req.body.message = TextFormatter.formatReplyMessage(req.body.message);
      
      // Format user data if present
      if (req.body.department && typeof req.body.department === 'string') req.body.department = TextFormatter.formatDepartment(req.body.department);
    }
    
    next();
  } catch (error) {
    console.error('Error in text formatting middleware:', error);
    next();
  }
};

/**
 * Middleware to format query parameters
 */
const formatQueryParams = (req, res, next) => {
  try {
    if (req.query) {
      // Format any text query parameters
      Object.keys(req.query).forEach(key => {
        if (typeof req.query[key] === 'string') {
          req.query[key] = TextFormatter.formatGenericText(req.query[key], 100);
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in query formatting middleware:', error);
    next();
  }
};

/**
 * Middleware to format URL parameters
 */
const formatUrlParams = (req, res, next) => {
  try {
    if (req.params) {
      // Format any text URL parameters
      Object.keys(req.params).forEach(key => {
        if (typeof req.params[key] === 'string') {
          req.params[key] = TextFormatter.formatGenericText(req.params[key], 50);
        }
      });
    }
    
    next();
  } catch (error) {
    console.error('Error in URL params formatting middleware:', error);
    next();
  }
};

/**
 * Comprehensive formatting middleware
 */
const formatAllData = (req, res, next) => {
  formatRequestBody(req, res, () => {
    formatQueryParams(req, res, () => {
      formatUrlParams(req, res, next);
    });
  });
};

module.exports = {
  formatRequestBody,
  formatQueryParams,
  formatUrlParams,
  formatAllData
}; 