const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../backend/config.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'tick_system',
  port: process.env.DB_PORT || 3306
};

async function seed() {
  console.log('Connecting to database:', dbConfig.database);
  const connection = await mysql.createConnection(dbConfig);
  try {
    // 1. Create table departments if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    console.log('✅ departments table exists.');

    // 2. Insert standard departments
    const coreDepartments = ['HR', 'Marketing', 'Tech Support', 'Finance', 'Operations'];
    for (const name of coreDepartments) {
      const [existing] = await connection.execute('SELECT id FROM departments WHERE name = ?', [name]);
      if (existing.length === 0) {
        await connection.execute('INSERT INTO departments (name, status) VALUES (?, "active")', [name]);
        console.log(`🌱 Seeded department: ${name}`);
      } else {
        console.log(`✔ Department already exists: ${name}`);
      }
    }

    // Print all departments
    const [allDepts] = await connection.execute('SELECT * FROM departments');
    console.log('\n=== CURRENT DEPARTMENTS ===');
    console.table(allDepts);

  } catch (err) {
    console.error('Migration/Seeding failed:', err);
  } finally {
    await connection.end();
  }
}

seed();
