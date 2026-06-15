/**
 * Universal Text Formatter
 * Standardizes all input data with consistent formatting
 */

class TextFormatter {
  /**
   * Format any text input to universal standard
   * @param {string} text - Raw input text
   * @returns {string} - Formatted text
   */
  static formatText(text) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      // Remove extra whitespace and normalize spaces
      .replace(/\s+/g, ' ')
      .trim()
      // Capitalize first letter of each word
      .replace(/\b\w/g, l => l.toUpperCase())
      // Remove special characters except allowed ones
      .replace(/[^\w\s\-\.\,\!\?\(\)]/g, '')
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Format name (first letter of each word uppercase)
   * @param {string} name - Raw name input
   * @returns {string} - Formatted name
   */
  static formatName(name) {
    if (!name || typeof name !== 'string') return '';
    
    return name
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Format email (lowercase, trim)
   * @param {string} email - Raw email input
   * @returns {string} - Formatted email
   */
  static formatEmail(email) {
    if (!email || typeof email !== 'string') return '';
    
    return email
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '');
  }

  /**
   * Format mobile number (remove spaces, keep only digits and +)
   * @param {string} mobile - Raw mobile input
   * @returns {string} - Formatted mobile
   */
  static formatMobile(mobile) {
    if (!mobile || typeof mobile !== 'string') return '';
    
    return mobile
      .replace(/\s+/g, '')
      .replace(/[^\d\+]/g, '')
      .trim();
  }

  /**
   * Format issue title (title case, max 150 chars)
   * @param {string} title - Raw title input
   * @returns {string} - Formatted title
   */
  static formatIssueTitle(title) {
    if (!title || typeof title !== 'string') return '';
    
    return title
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-\.\,\!\?]/g, '')
      .substring(0, 150)
      .trim();
  }

  /**
   * Format description (proper spacing, max 1000 chars)
   * @param {string} description - Raw description input
   * @returns {string} - Formatted description
   */
  static formatDescription(description) {
    if (!description || typeof description !== 'string') return '';
    
    return description
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s\-\.\,\!\?\n\(\)]/g, '')
      .substring(0, 1000)
      .trim();
  }

  /**
   * Format product name (title case)
   * @param {string} product - Raw product input
   * @returns {string} - Formatted product name
   */
  static formatProduct(product) {
    if (!product || typeof product !== 'string') return '';
    
    return product
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-]/g, '')
      .trim();
  }

  /**
   * Format issue type (title case)
   * @param {string} issueType - Raw issue type input
   * @returns {string} - Formatted issue type
   */
  static formatIssueType(issueType) {
    if (!issueType || typeof issueType !== 'string') return '';
    
    return issueType
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-]/g, '')
      .trim();
  }

  /**
   * Format reply message (proper spacing, max 500 chars)
   * @param {string} message - Raw message input
   * @returns {string} - Formatted message
   */
  static formatReplyMessage(message) {
    if (!message || typeof message !== 'string') return '';
    
    return message
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s\-\.\,\!\?\n\(\)]/g, '')
      .substring(0, 500)
      .trim();
  }

  /**
   * Format agent name (title case)
   * @param {string} agentName - Raw agent name input
   * @returns {string} - Formatted agent name
   */
  static formatAgentName(agentName) {
    if (!agentName || typeof agentName !== 'string') return '';
    
    return agentName
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-]/g, '')
      .trim();
  }

  /**
   * Format file name (remove special chars, max 255 chars)
   * @param {string} fileName - Raw file name input
   * @returns {string} - Formatted file name
   */
  static formatFileName(fileName) {
    if (!fileName || typeof fileName !== 'string') return '';
    
    return fileName
      .replace(/[^\w\-\.]/g, '')
      .substring(0, 255)
      .trim();
  }

  /**
   * Format department name (title case)
   * @param {string} department - Raw department input
   * @returns {string} - Formatted department name
   */
  static formatDepartment(department) {
    if (!department || typeof department !== 'string') return '';
    
    return department
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/[^\w\s\-]/g, '')
      .trim();
  }

  /**
   * Format any generic text with custom max length
   * @param {string} text - Raw text input
   * @param {number} maxLength - Maximum length allowed
   * @returns {string} - Formatted text
   */
  static formatGenericText(text, maxLength = 100) {
    if (!text || typeof text !== 'string') return '';
    
    return text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s\-\.\,\!\?]/g, '')
      .substring(0, maxLength)
      .trim();
  }

  /**
   * Validate and format complete ticket data
   * @param {object} ticketData - Raw ticket data
   * @returns {object} - Formatted ticket data
   */
  static formatTicketData(ticketData) {
    return {
      name: this.formatName(ticketData.name || ''),
      email: this.formatEmail(ticketData.email || ''),
      mobile: this.formatMobile(ticketData.mobile || ''),
      product: this.formatProduct(ticketData.product || ''),
      issueType: this.formatIssueType(ticketData.issueType || ''),
      issueTypeOther: this.formatGenericText(ticketData.issueTypeOther || '', 100),
      issueTitle: this.formatIssueTitle(ticketData.issueTitle || ''),
      description: this.formatDescription(ticketData.description || ''),
      attachmentName: this.formatFileName(ticketData.attachmentName || '')
    };
  }

  /**
   * Validate and format complete reply data
   * @param {object} replyData - Raw reply data
   * @returns {object} - Formatted reply data
   */
  static formatReplyData(replyData) {
    return {
      agentName: this.formatAgentName(replyData.agentName || ''),
      message: this.formatReplyMessage(replyData.message || '')
    };
  }

  /**
   * Validate and format complete user data
   * @param {object} userData - Raw user data
   * @returns {object} - Formatted user data
   */
  static formatUserData(userData) {
    return {
      name: this.formatName(userData.name || ''),
      email: this.formatEmail(userData.email || ''),
      department: this.formatDepartment(userData.department || '')
    };
  }
}

module.exports = TextFormatter; 