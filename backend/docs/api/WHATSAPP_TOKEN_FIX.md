# 🔧 WhatsApp Access Token Fix Guide

## ❌ Current Issue
Your WhatsApp access token has expired. The error shows:
```
Error validating access token: Session has expired on Tuesday, 15-Jul-25 01:00:00 PDT
```

## ✅ Solution Steps

### Step 1: Get a New Access Token

1. **Go to Meta Developer Console**
   - Visit: https://developers.facebook.com/
   - Log in with your Facebook account

2. **Navigate to Your WhatsApp App**
   - Go to "My Apps" in the top menu
   - Select your WhatsApp Business API app
   - If you don't have one, create a new app

3. **Generate New Access Token**
   - Go to "Tools" → "Graph API Explorer"
   - Select your app from the dropdown
   - Click "Generate Access Token"
   - Grant necessary permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`

4. **Copy the New Token**
   - The token will look like: `EAAZAFlVKZBf1EBPDE88pexXMVsnOpnlxaNhjRfG2yqMljVkvPHiH6k6or7D2T0r5jf97iVhJn41XfqjrmvOpmnxB76a3bgQwQc1T3Eg1wSXNsYntYM7xXoD0MXdUrS7aYxGSg9ZAJIeht93d1NdZAlbYwYe85KoZAzZAnnkFO8tFGHBx2mbqsc6DvrwaI1lnMCuZBugdqrQAIytygZB6j2QqwAD2ICGyOkTXwU3w5it6zCUZD`

### Step 2: Update Configuration

1. **Edit the config file**
   ```bash
   # Open backend/config.env
   nano backend/config.env
   ```

2. **Replace the token**
   ```env
   WHATSAPP_ACCESS_TOKEN=YOUR_NEW_ACCESS_TOKEN_HERE
   ```
   Replace `YOUR_NEW_ACCESS_TOKEN_HERE` with your actual new token.

### Step 3: Restart the Server

```bash
# Stop the current server (Ctrl+C)
# Then restart it
cd backend
npm run dev
```

### Step 4: Test the Integration

1. **Create a test ticket** through the web form
2. **Check the console logs** for WhatsApp messages
3. **Verify the phone number** is in international format (+91XXXXXXXXXX)

## 🔍 Troubleshooting

### If you still get errors:

1. **Check Token Permissions**
   - Ensure the token has `whatsapp_business_messaging` permission
   - Verify the app is in "Live" mode (not development)

2. **Verify Phone Number ID**
   - Check that `WHATSAPP_PHONE_NUMBER_ID=521803094347148` is correct
   - This should match your WhatsApp Business phone number ID

3. **Test with a Simple Message**
   ```javascript
   // Test in browser console or Postman
   fetch('http://localhost:5000/api/whatsapp/send', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       phoneNumber: '+918825734812',
       message: 'Test message from ITSM system'
     })
   });
   ```

### Common Issues:

1. **Token Expired Again**
   - WhatsApp tokens typically expire every 60 days
   - Set a calendar reminder to renew monthly

2. **Phone Number Format**
   - Must include country code: `+91XXXXXXXXXX`
   - No spaces or special characters

3. **App Not Live**
   - Ensure your WhatsApp Business app is in "Live" mode
   - Development mode has limited functionality

## 📋 Alternative Solutions

### Option 1: Use WhatsApp Business API Provider
If you're having trouble with Meta's direct API, consider using a provider like:
- Twilio WhatsApp API
- MessageBird
- 360dialog

### Option 2: Implement Token Refresh
Add automatic token refresh functionality:

```javascript
// Add to your WhatsApp service
const refreshToken = async () => {
  // Implement token refresh logic
  // Store new token in database
  // Update environment variable
};
```

### Option 3: Fallback to Email
If WhatsApp continues to fail, implement email fallback:

```javascript
// In your notification service
const sendNotification = async (user, message) => {
  try {
    await sendWhatsAppMessage(user.phone, message);
  } catch (error) {
    console.log('WhatsApp failed, falling back to email');
    await sendEmail(user.email, message);
  }
};
```

## 🛡️ Security Best Practices

1. **Never commit tokens to Git**
   - Use environment variables
   - Add `.env` to `.gitignore`

2. **Rotate tokens regularly**
   - Set up monthly token refresh
   - Use long-lived tokens when possible

3. **Monitor token usage**
   - Track API calls and errors
   - Set up alerts for token expiration

## 📞 Support

If you continue having issues:

1. **Check Meta Developer Documentation**
   - https://developers.facebook.com/docs/whatsapp

2. **Verify your WhatsApp Business Account**
   - Ensure it's properly set up and verified

3. **Test with Meta's Graph API Explorer**
   - Use the online tool to test your token

## ✅ Success Indicators

After fixing the token, you should see:
- ✅ No more "Session expired" errors
- ✅ WhatsApp messages being sent successfully
- ✅ Console logs showing successful API calls
- ✅ Customers receiving notifications

---

**Remember**: Keep your access token secure and never share it publicly. The token provides access to your WhatsApp Business account. 