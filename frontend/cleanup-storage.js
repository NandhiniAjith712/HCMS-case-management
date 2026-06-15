
// Frontend Storage Cleanup Script
// Run this in the browser console to clear any temp credentials

console.log('🧹 Cleaning up frontend storage...');

const keysToRemove = [
  "agentData",
  "agentToken",
  "userData",
  "userToken",
  "tickUser",
  "access_token",
  "user_id",
  "user_name",
  "user_email",
  "user_role",
  "is_logged_in",
  "auto_login_context",
  "autoLoginContext"
];

keysToRemove.forEach(key => {
  if (localStorage.getItem(key)) {
    console.log(`🗑️ Removing ${key}`);
    localStorage.removeItem(key);
  }
});

// Also clear any sessionStorage
sessionStorage.clear();
console.log('✅ Frontend storage cleaned up');

// Reload the page to ensure clean state
// window.location.reload();
