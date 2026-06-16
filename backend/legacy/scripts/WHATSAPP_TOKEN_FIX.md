# WhatsApp Token Expiration Fix Guide

## 🚨 Current Issue
Your WhatsApp Business API access token has expired on July 14th, 2025. This is causing all WhatsApp notifications to fail.

## ✅ What I've Fixed
1. **Updated configuration files** to use environment variables instead of hardcoded tokens
2. **Created a test script** to verify your new token
3. **Updated all WhatsApp routes** to use proper configuration

## 🔧 Steps to Fix

### Step 1: Get a New Access Token

1. **Go to [Meta for Developers](https://developers.facebook.com/)**
2. **Navigate to your WhatsApp Business App**
3. **Go to WhatsApp > Getting Started**
4. **Click on "Generate Token"**
5. **Copy the new access token**

### Step 2: Update Your Configuration

1. **Open `backend/config.env`**
2. **Replace the line:**
   ```env
   WHATSAPP_ACCESS_TOKEN=YOUR_NEW_ACCESS_TOKEN_HERE
   ```
3. **With your actual new token:**
   ```env
   WHATSAPP_ACCESS_TOKEN=EAAZAFlVKZBf1EBPO...your_new_token_here
   ```

### Step 3: Test Your New Token

Run the test script to verify your token works:

```bash
cd backend
node test-whatsapp.js
```

For a complete test with message sending:
```bash
node test-whatsapp.js +1234567890
```

### Step 4: Restart Your Server

```bash
# Stop your current server (Ctrl+C)
# Then restart it
npm start
```

## 🔍 Verification

After updating the token, you should see:
- ✅ "Access token is valid!" in the test script
- ✅ WhatsApp notifications working in your ticketing system
- ✅ No more "Session has expired" errors

## 🛠️ Troubleshooting

### If the test script shows errors:

1. **Check token format**: Make sure it starts with "EAAZAFlVKZBf1EBPO..."
2. **Verify permissions**: Ensure your app has WhatsApp Business API permissions
3. **Check phone number ID**: Verify your phone number ID is correct

### If you get "Invalid access token":

1. **Regenerate the token** in Meta Developer Console
2. **Make sure you're using the correct app** (WhatsApp Business API)
3. **Check if the token has the right permissions**

## 📋 Files Updated

- ✅ `backend/config.env` - Now uses environment variables
- ✅ `backend/routes/whatsapp.js` - Uses environment variables
- ✅ `backend/routes/tickets.js` - Uses environment variables  
- ✅ `backend/routes/replies.js` - Uses environment variables
- ✅ `backend/test-whatsapp.js` - Enhanced test script

## 🎯 Expected Results

After following these steps:
- ✅ WhatsApp notifications will work again
- ✅ Ticket creation will send WhatsApp messages
- ✅ Status updates will notify customers
- ✅ No more token expiration errors

## 📞 Need Help?

If you're still having issues:
1. Check the test script output for specific error messages
2. Verify your Meta Developer Console settings
3. Ensure your WhatsApp Business API is properly configured 