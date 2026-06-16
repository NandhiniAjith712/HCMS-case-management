# 📱 WhatsApp Integration Setup Guide

## 🎯 Prerequisites Checklist

Before starting your server, ensure you have:

- [ ] Meta Developer Account
- [ ] WhatsApp Business API App
- [ ] Verified WhatsApp Business Phone Number
- [ ] Access Token with proper permissions
- [ ] Phone Number ID
- [ ] Webhook URL (for production)

---

## 📋 Step-by-Step Setup Process

### Step 1: Create Meta Developer Account

1. **Go to Meta Developer Console**
   ```
   https://developers.facebook.com/
   ```

2. **Sign Up/Login**
   - Use your Facebook account
   - Complete developer verification if required

3. **Create a New App**
   - Click "Create App"
   - Select "Business" as app type
   - Choose "WhatsApp" as product

### Step 2: Configure WhatsApp Business API

1. **Add WhatsApp to Your App**
   - Go to your app dashboard
   - Click "Add Product"
   - Select "WhatsApp"

2. **Set Up WhatsApp Business Account**
   - Go to "WhatsApp" → "Getting Started"
   - Click "Set up WhatsApp Business Account"
   - Follow the verification process

3. **Add Phone Number**
   - Click "Add phone number"
   - Enter your business phone number
   - Complete verification via SMS/call
   - **Note down the Phone Number ID** (you'll need this)

### Step 3: Generate Access Token

1. **Go to Graph API Explorer**
   ```
   https://developers.facebook.com/tools/explorer/
   ```

2. **Select Your App**
   - Choose your WhatsApp app from dropdown
   - Click "Generate Access Token"

3. **Grant Permissions**
   - Select these permissions:
     - `whatsapp_business_messaging`
     - `whatsapp_business_management`
     - `whatsapp_business_account`
   - Click "Generate Access Token"

4. **Copy the Token**
   - The token looks like: `EAAZAFlVKZBf1EBPDE88pexXMVsnOpnlxaNhjRfG2yqMljVkvPHiH6k6or7D2T0r5jf97iVhJn41XfqjrmvOpmnxB76a3bgQwQc1T3Eg1wSXNsYntYM7xXoD0MXdUrS7aYxGSg9ZAJIeht93d1NdZAlbYwYe85KoZAzZAnnkFO8tFGHBx2mbqsc6DvrwaI1lnMCuZBugdqrQAIytygZB6j2QqwAD2ICGyOkTXwU3w5it6zCUZD`

### Step 4: Get Phone Number ID

1. **Go to WhatsApp Dashboard**
   ```
   https://developers.facebook.com/apps/[YOUR_APP_ID]/whatsapp/overview
   ```

2. **Find Phone Number ID**
   - Click on your phone number
   - Look for "Phone number ID" field
   - Copy this ID (e.g., `521803094347148`)

### Step 5: Configure Environment Variables

1. **Edit config.env file**
   ```bash
   cd backend
   nano config.env
   ```

2. **Update WhatsApp settings**
   ```env
   # WhatsApp Configuration
   WHATSAPP_VERIFY_TOKEN=my_verify_token_123
   WHATSAPP_API_URL=https://graph.facebook.com/v18.0
   WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
   WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
   ```

3. **Replace placeholders**
   - `YOUR_PHONE_NUMBER_ID` → Your actual Phone Number ID
   - `YOUR_ACCESS_TOKEN` → Your actual Access Token
   - `my_verify_token_123` → Any random string (for webhook verification)

### Step 6: Test WhatsApp Integration

1. **Start the server**
   ```bash
   cd backend
   npm run dev
   ```

2. **Test with a simple message**
   ```bash
   curl -X POST http://localhost:5000/api/whatsapp/send \
   -H "Content-Type: application/json" \
   -d '{
     "phoneNumber": "+918825734812",
     "message": "Test message from ITSM system"
   }'
   ```

3. **Check server logs**
   - Look for success messages
   - Verify no authentication errors

### Step 7: Verify Webhook (Optional for Development)

1. **Set up ngrok for local testing**
   ```bash
   # Install ngrok
   npm install -g ngrok
   
   # Start ngrok tunnel
   ngrok http 5000
   ```

2. **Configure webhook URL**
   - Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
   - Go to WhatsApp Dashboard → Configuration
   - Set webhook URL: `https://abc123.ngrok.io/api/whatsapp/webhook`
   - Set verify token: `my_verify_token_123`

---

## 🔧 Troubleshooting Common Issues

### Issue 1: "Invalid access token"
**Solution:**
- Regenerate access token
- Ensure app is in "Live" mode
- Check token permissions

### Issue 2: "Phone number not found"
**Solution:**
- Verify phone number is registered
- Check Phone Number ID is correct
- Ensure number is in international format

### Issue 3: "Permission denied"
**Solution:**
- Add required permissions to token
- Ensure app has WhatsApp Business API access
- Check app review status

### Issue 4: "Webhook verification failed"
**Solution:**
- Verify webhook URL is accessible
- Check verify token matches
- Ensure HTTPS for production

---

## 📊 Verification Checklist

Before starting your server, verify:

- [ ] **Access Token**: Valid and not expired
- [ ] **Phone Number ID**: Correct and matches your number
- [ ] **API URL**: Using correct Facebook Graph API version
- [ ] **Permissions**: Token has required WhatsApp permissions
- [ ] **App Status**: App is in "Live" mode
- [ ] **Phone Number**: Verified and active
- [ ] **Environment Variables**: All set correctly in config.env

---

## 🚀 Start Server

Once all steps are completed:

```bash
# Start the backend server
cd backend
npm run dev

# Start the frontend (in new terminal)
cd frontend
npm start
```

## ✅ Success Indicators

You'll know WhatsApp is working when:

- ✅ Server starts without WhatsApp errors
- ✅ Test messages are sent successfully
- ✅ Console shows "WhatsApp notification sent successfully"
- ✅ Customers receive WhatsApp messages
- ✅ No authentication errors in logs

---

## 🔄 Maintenance

### Monthly Tasks:
- [ ] Check token expiration
- [ ] Regenerate access token if needed
- [ ] Verify app permissions
- [ ] Test WhatsApp functionality

### Security Notes:
- Never commit tokens to Git
- Use environment variables
- Rotate tokens regularly
- Monitor API usage

---

**Need Help?** Check the `WHATSAPP_TOKEN_FIX.md` file for detailed troubleshooting steps. 