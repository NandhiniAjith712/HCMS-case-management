/**
 * Migration: Create faqs table for product-specific FAQ entries
 * Structure: Product, Category, Question, Answer
 */
const { pool } = require('../database');

async function up() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS faqs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product VARCHAR(100) NOT NULL,
      category VARCHAR(100) NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      tags TEXT NULL,
      faq_embedding JSON NULL,
      tenant_id INT DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_faqs_product (product),
      INDEX idx_faqs_category (category),
      INDEX idx_faqs_tenant (tenant_id)
    )
  `);
  console.log('✅ Created faqs table');
}

async function down() {
  await pool.execute('DROP TABLE IF EXISTS faqs');
  console.log('✅ Dropped faqs table');
}

if (require.main === module) {
  up().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
