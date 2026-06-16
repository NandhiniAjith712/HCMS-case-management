# WhatsApp Business API Setup Guide

## Current Status
- ❌ WhatsApp notifications are temporarily disabled due to expired token
- ✅ Core ticket functionality works without WhatsApp

## How to Enable WhatsApp Notifications

### 1. Get WhatsApp Business API Access
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a Meta Developer Account
3. Create a WhatsApp Business App
4. Get your Phone Number ID and Access Token

### 2. Update Configuration
Replace the following in `backend/routes/tickets.js`:

```javascript
const WHATSAPP_PHONE_NUMBER_ID = "YOUR_PHONE_NUMBER_ID";
const WHATSAPP_ACCESS_TOKEN = "YOUR_ACCESS_TOKEN";
```

### 3. Re-enable WhatsApp Function
Uncomment the WhatsApp code in the `sendWhatsAppMessage` function.

### 4. Test Notifications
- Create a test ticket
- Update ticket status
- Check console for WhatsApp success messages

## Environment Variables (Optional)
You can also use environment variables:

```bash
# In config.env
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
```

Then update the code to:
```javascript
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
```

## Token Expiration
- WhatsApp tokens expire periodically
- Monitor console for expiration errors
- Generate new tokens when needed

## Current Workaround
Until you get new WhatsApp tokens, the system will:
- ✅ Work normally for all ticket operations
- ✅ Show escalation functionality
- ❌ Skip WhatsApp notifications (with console messages) 