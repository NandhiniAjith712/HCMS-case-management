# Quick Test Example - Copy and modify these commands

# Example 1: Basic test with default credentials
.\test-multitenancy-auto.ps1

# Example 2: Test with specific credentials
.\test-multitenancy-auto.ps1 `
    -Tenant1Email "admin@company1.com" `
    -Tenant1Password "password123" `
    -Tenant2Email "admin@company2.com" `
    -Tenant2Password "password123"

# Example 3: Test against different server
.\test-multitenancy-auto.ps1 `
    -BaseUrl "http://localhost:5000" `
    -Tenant1Email "user1@tenant1.com" `
    -Tenant1Password "pass123" `
    -Tenant2Email "user2@tenant2.com" `
    -Tenant2Password "pass123"

# Example 4: Test with login_id instead of email
.\test-multitenancy-auto.ps1 `
    -Tenant1Email "admin1" `
    -Tenant1Password "password123" `
    -Tenant2Email "admin2" `
    -Tenant2Password "password123"

