require('dotenv').config({ path: '../../config.env' });

const whatsappConfig = {
  apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || "521803094347148",
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
  timeout: 15000,
  headers: {
    'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Tick-System/1.0'
  }
};

const isConfigured = () => {
  return whatsappConfig.accessToken && 
         whatsappConfig.accessToken !== 'YOUR_ACTUAL_NEW_TOKEN_FROM_META_DEVELOPER_CONSOLE' &&
         whatsappConfig.phoneNumberId;
};

module.exports = {
  whatsappConfig,
  isConfigured
}; 