# Email Notification System Documentation

## Overview

The ITSM email notification system automatically sends Gmail notifications to customers when support agents reply to their tickets. This helps keep customers engaged and informed about their support requests.

## Features

- 📧 **Automatic Notifications**: Customers receive emails when agents reply
- 🎨 **Beautiful HTML Templates**: Professional, responsive email design
- ⚙️ **User Preferences**: Customers can enable/disable email notifications
- 🛡️ **Secure**: Uses Gmail SMTP with App Passwords
- 🔄 **Reliable**: Graceful error handling, won't break chat functionality

## Setup Instructions

### 1. Gmail Configuration

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Select "Mail" and generate a 16-character password
3. **Update Environment Variables** in `config.env`:

```env
# Email Notification Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-16-character-app-password
EMAIL_FROM_NAME=ITSM Support Team
EMAIL_FROM_ADDRESS=your-email@gmail.com
```

### 2. Database Schema

The system uses the existing `users` table with an additional column:

```sql
ALTER TABLE users 
ADD COLUMN email_notifications BOOLEAN DEFAULT TRUE 
COMMENT 'Whether user wants to receive email notifications';
```

### 3. Dependencies

```bash
npm install nodemailer
```

## File Structure

```
backend/
├── services/
│   └── emailService.js          # Core email service
├── routes/
│   ├── chat.js                  # Modified to send notifications
│   └── users.js                 # Notification preference endpoints
├── config.env                   # Email configuration
└── test-email-notifications.js  # Testing script
```

## API Endpoints

### Update Notification Preferences
```http
PUT /api/users/:id/notification-preferences
Content-Type: application/json

{
  "email_notifications": true
}
```

### Get Notification Preferences
```http
GET /api/users/:id/notification-preferences
```

Response:
```json
{
  "success": true,
  "data": {
    "user_id": 123,
    "email": "customer@example.com",
    "name": "Customer Name",
    "email_notifications": true
  }
}
```

## Email Templates

### Agent Reply Notification

**Subject**: `New Reply on Your Support Ticket #12345`

**Features**:
- 🎫 Ticket information (ID, title, agent name)
- 💬 Preview of agent's reply (truncated if long)
- 📱 Call-to-action button linking to app
- ⚡ Instructions to respond via app
- 🎨 Professional HTML design

### Welcome Email

**Subject**: `Welcome to ITSM Support!`

**Features**:
- 🎉 Welcome message
- 🚀 Feature overview
- 📱 Getting started guidance

## How It Works

1. **Agent sends reply** via chat system
2. **System checks** if sender is agent and message type is text
3. **Retrieves customer info** including notification preferences
4. **Sends email** if customer has notifications enabled
5. **Logs results** without disrupting chat functionality

## Testing

Run the test script to verify email functionality:

```bash
node test-email-notifications.js
```

The test will:
- ✅ Verify email configuration
- 📧 Send sample agent reply notification
- 🎉 Send sample welcome email
- 📊 Provide detailed results

## Error Handling

- Email failures **don't break** chat functionality
- All errors are **logged** for debugging
- Graceful fallbacks for **missing data**
- **User preferences** are respected

## Security Features

- Uses **Gmail App Passwords** (more secure than regular passwords)
- **TLS encryption** for SMTP connection
- **Input validation** for all email data
- **No sensitive data** in email content

## Troubleshooting

### Common Issues

1. **"Invalid login"** error:
   - Ensure 2FA is enabled on Gmail
   - Use App Password, not regular password
   - Check EMAIL_USER and EMAIL_PASS in config.env

2. **Emails not sending**:
   - Run test script to check configuration
   - Verify Gmail SMTP settings
   - Check network/firewall restrictions

3. **Emails going to spam**:
   - Use a verified domain email address
   - Add proper SPF/DKIM records
   - Test with different email providers

### Debug Mode

Set `NODE_ENV=development` in config.env for detailed error messages.

### Logs

Check console output for email sending status:
```
✅ Email notification sent to customer@example.com for ticket #123
❌ Failed to send email notification: [error details]
📵 Email notifications disabled for user customer@example.com - skipping notification
```

## Frontend Integration

Add notification preference toggle in customer dashboard:

```javascript
// Get current preferences
const response = await fetch(`/api/users/${userId}/notification-preferences`);
const { data } = await response.json();

// Update preferences
await fetch(`/api/users/${userId}/notification-preferences`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email_notifications: false })
});
```

## Performance Considerations

- Email sending is **asynchronous** (doesn't block chat)
- Uses **connection pooling** for SMTP
- **Minimal database queries** for notification checks
- **Graceful degradation** if email service is unavailable

## Future Enhancements

- 📱 SMS notifications
- 🔔 Push notifications
- 📊 Email analytics
- 🕒 Digest emails (daily/weekly summaries)
- 🎯 Targeted notifications based on ticket priority
- 📝 Custom email templates per department

## Monitoring

Monitor email delivery by checking:
- Server logs for send confirmations
- Gmail account sent items
- Customer feedback on notification delivery
- Bounce/error rate tracking

---

**Status**: ✅ Active and Ready
**Last Updated**: 2024
**Dependencies**: nodemailer, Gmail SMTP
**Maintainer**: Development Team
