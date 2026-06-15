// WhatsApp Message Templates
const TextFormatter = require('../utils/textFormatter');

const templates = {
  // Welcome and onboarding messages
  welcome: (data = { userName: 'there' }) => ({
    text: `🎉 Welcome to our support system, ${data.userName}!\n\n` +
          `I'm here to help you create a support ticket quickly and easily.\n\n` +
          `Let's get started with your details. Please enter your full name:`,
    type: 'text'
  }),

  welcomeBack: (data) => ({
    text: `👋 Welcome back, ${data.userName}!\n\n` +
          `I see you've used our service before. Let's create a new ticket for you.\n\n` +
          `Please enter your full name:`,
    type: 'text'
  }),

  // Validation error messages
  invalidName: {
    text: `❌ Please enter a valid name (at least 2 characters, letters only):`,
    type: 'text'
  },

  invalidEmail: {
    text: `❌ Please enter a valid email address (e.g., user@example.com):`,
    type: 'text'
  },

  invalidMobile: {
    text: `❌ Please enter a valid mobile number (e.g., 1234567890):`,
    type: 'text'
  },

  invalidCountryCode: {
    text: `❌ Please enter a valid number (1-10) to select your country:`,
    type: 'text'
  },

  invalidTitle: {
    text: `❌ Please enter a descriptive title (at least 5 characters):`,
    type: 'text'
  },

  invalidDescription: {
    text: `❌ Please provide a more detailed description (at least 10 characters):`,
    type: 'text'
  },

  invalidIssueType: {
    text: `❌ Please enter a valid number (1-7):`,
    type: 'text'
  },

  invalidProduct: {
    text: `❌ Please select a product from the list above by clicking on it.`,
    type: 'text'
  },

  // Progress messages
  nameReceived: (data) => ({
    text: `✅ Thanks ${data.name}! 📧\n\n` +
          `Now please enter your email address:`,
    type: 'text'
  }),

  emailReceived: {
    text: `✅ Great! 📱\n\n` +
          `Please select your country:`,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: 'Select your country code:'
      },
      action: {
        button: 'Choose Country',
        sections: [
          {
            title: 'Popular Countries',
            rows: [
              {
                id: 'country_1',
                title: '🇲🇾 Malaysia',
                description: '+60'
              },
              {
                id: 'country_2', 
                title: '🇺🇸 United States',
                description: '+1'
              },
              {
                id: 'country_3',
                title: '🇮🇳 India', 
                description: '+91'
              },
              {
                id: 'country_4',
                title: '🇦🇪 UAE/Dubai',
                description: '+971'
              },
              {
                id: 'country_5',
                title: '🇸🇬 Singapore',
                description: '+65'
              }
            ]
          }
        ]
      }
    }
  },

  countryCodeReceived: (data) => ({
    text: `✅ Selected: ${data.countryName} (${data.countryCode})\n\n` +
          `Now please enter your mobile number (without country code):\n` +
          `Example: 1234567890`,
    type: 'text'
  }),



  productReceived: (data) => ({
    text: `✅ Selected: ${data.productName} (SLA: ${data.slaTime} min)\n\n` +
          `Now please enter a title for your issue (e.g., 'Login problem' or 'Payment issue'):`,
    type: 'text'
  }),

  titleReceived: {
    text: `✅ Got it! 🏷️\n\n` +
          `Please select your issue type:`,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: 'Select your issue type:'
      },
      action: {
        button: 'Choose Issue Type',
        sections: [
          {
            title: 'Issue Categories',
            rows: [
              {
                id: 'issue_1',
                title: '🔧 Technical Support',
                description: 'Login, access, or technical problems'
              },
              {
                id: 'issue_2',
                title: '💳 Billing Issue',
                description: 'Payment, subscription, or billing problems'
              },
              {
                id: 'issue_3',
                title: '🔐 Account Access',
                description: 'Password, account, or access issues'
              },
              {
                id: 'issue_4',
                title: '📦 Product Inquiry',
                description: 'Product information or questions'
              },
              {
                id: 'issue_5',
                title: '🐛 Bug Report',
                description: 'Report software bugs or errors'
              },
              {
                id: 'issue_6',
                title: '💡 Feature Request',
                description: 'Request new features or improvements'
              },
              {
                id: 'issue_7',
                title: '❓ Other',
                description: 'Other issues not listed above'
              }
            ]
          }
        ]
      }
    }
  },

  typeReceived: {
    text: `✅ Excellent! 📝\n\n` +
          `Finally, please describe your issue in detail (at least 10 characters):`,
    type: 'text'
  },

  // Success messages
  ticketCreated: (ticketData) => ({
    text: `🎉 Ticket created successfully!\n\n` +
          `📋 Ticket ID: #${ticketData.id}\n` +
          `👤 Name: ${ticketData.name}\n` +
          `📧 Email: ${ticketData.email}\n` +
          `📱 Mobile: ${ticketData.mobile}\n` +
          `🌍 Country: ${ticketData.countryName || 'Not specified'}\n` +
          `📦 Product: ${ticketData.product || 'Not specified'}\n` +
          `🏷️ Issue: ${ticketData.issueTitle}\n` +
          `📝 Type: ${ticketData.issueType}\n` +
          `📄 Description: ${ticketData.description}\n\n` +
          `We'll get back to you soon! You can reply to this conversation for updates.`,
    type: 'text'
  }),

  // Error messages
  ticketCreationError: {
    text: `❌ Sorry, there was an error creating your ticket. Please try again later or contact support directly.`,
    type: 'text'
  },

  generalError: {
    text: `❌ Sorry, there was an error. Please try again later.`,
    type: 'text'
  },

  // Help and support messages
  help: {
    text: `🆘 Need help?\n\n` +
          `Available commands:\n` +
          `• Type "start" to create a new ticket\n` +
          `• Type "help" to see this message\n` +
          `• Type "reset" to start over\n` +
          `• Type "status" to check your tickets\n\n` +
          `To create a ticket, just send any message to begin!`,
    type: 'text'
  },

  reset: {
    text: `🔄 Conversation reset!\n\n` +
          `Let's start fresh. Please enter your full name:`,
    type: 'text'
  },

  // Status and information messages
  status: (tickets) => {
    if (!tickets || tickets.length === 0) {
      return {
        text: `📊 You don't have any tickets yet.\n\n` +
              `To create your first ticket, just send any message!`,
        type: 'text'
      };
    }

    let statusText = `📊 Your Tickets:\n\n`;
    tickets.forEach((ticket, index) => {
      statusText += `${index + 1}. Ticket #${ticket.id}\n` +
                   `   Status: ${ticket.status}\n` +
                   `   Issue: ${ticket.issue_title}\n` +
                   `   Created: ${new Date(ticket.created_at).toLocaleDateString()}\n\n`;
    });

    return {
      text: statusText + `To create a new ticket, send any message!`,
      type: 'text'
    };
  },

  // Quick reply templates
  quickReplies: {
    yes: {
      text: 'Yes, continue',
      type: 'quick_reply'
    },
    no: {
      text: 'No, start over',
      type: 'quick_reply'
    },
    help: {
      text: 'Help',
      type: 'quick_reply'
    },
    status: {
      text: 'Check Status',
      type: 'quick_reply'
    }
  },

  // Notification templates
  ticketUpdate: (ticketId, status, message) => ({
    text: `📢 Ticket Update\n\n` +
          `Ticket #${ticketId}\n` +
          `Status: ${status}\n` +
          `Message: ${message}\n\n` +
          `Reply to this message for more information.`,
    type: 'text'
  }),

  // Template for different message types
  createTemplate: (templateName, data = {}) => {
    const template = templates[templateName];
    if (typeof template === 'function') {
      return template(data);
    }
    return template;
  },

  // Validate template data
  validateTemplateData: (templateName, data) => {
    const requiredFields = {
      ticketCreated: ['id', 'name', 'email', 'mobile', 'issueTitle', 'issueType', 'description'],
      nameReceived: ['name'],
      welcome: ['userName'],
      status: ['tickets']
    };

    const required = requiredFields[templateName];
    if (!required) return true;

    return required.every(field => data[field] !== undefined);
  },

  // Get available templates
  getAvailableTemplates: () => {
    return [
      'welcome',
      'welcomeBack',
      'nameReceived',
      'emailReceived',
      'countrySelection',
      'mobileReceived',
      'productSelection',
      'issueTitleReceived',
      'issueTypeSelection',
      'descriptionReceived',
      'ticketCreated',
      'help',
      'reset',
      'status',
      'invalidName',
      'invalidEmail',
      'invalidMobile',
      'invalidCountryCode',
      'invalidTitle',
      'invalidDescription',
      'invalidIssueType',
      'invalidProduct'
    ];
  }
};

module.exports = templates; 