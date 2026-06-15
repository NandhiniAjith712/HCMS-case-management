/**
 * Migration: Add slug column to products table for Universal Support URL
 * Enables URL paths like /grc, /voiceloop to map to products
 */
const { pool } = require('../database');

async function addProductSlug() {
  try {
    await pool.execute(`
      ALTER TABLE products ADD COLUMN slug VARCHAR(50) 
      COMMENT 'URL slug for support integration (e.g., grc, voiceloop)'
    `);
    console.log('✅ Added slug column to products');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELD' || err.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ Slug column already exists');
    } else {
      throw err;
    }
  }

  // Populate slug from name for existing products (lowercase, no spaces)
  const [products] = await pool.execute('SELECT id, name FROM products');
  for (const p of products) {
    const slug = p.name.toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
    await pool.execute('UPDATE products SET slug = ? WHERE id = ?', [slug, p.id]);
    console.log(`   Slug "${slug}" for product "${p.name}"`);
  }
}

if (require.main === module) {
  addProductSlug()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { addProductSlug };
