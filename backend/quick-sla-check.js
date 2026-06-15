const { pool } = require('./database');

async function quickSLACheck() {
  try {
    console.log('🔍 Quick SLA Status Check...\n');
    
    // Check SLA configurations
    const [slaCount] = await pool.execute('SELECT COUNT(*) as count FROM sla_configurations');
    console.log(`📊 SLA Configurations: ${slaCount[0].count}`);
    
    // Check products
    const [products] = await pool.execute('SELECT id, name, status FROM products');
    console.log(`🏷️ Products: ${products.length}`);
    products.forEach(p => console.log(`   - ${p.name} (ID: ${p.id}, Status: ${p.status})`));
    
    // Check modules
    const [modules] = await pool.execute('SELECT id, name, product_id, status FROM modules');
    console.log(`📦 Modules: ${modules.length}`);
    modules.forEach(m => console.log(`   - ${m.name} (ID: ${m.id}, Product: ${m.product_id}, Status: ${m.status})`));
    
    // Check tickets
    const [tickets] = await pool.execute('SELECT id, product_id, module_id, issue_type, product, module FROM tickets LIMIT 5');
    console.log(`🎫 Recent Tickets: ${tickets.length}`);
    tickets.forEach(t => {
      console.log(`   - Ticket #${t.id}:`);
      console.log(`     Product: ${t.product} (ID: ${t.product_id})`);
      console.log(`     Module: ${t.module} (ID: ${t.module_id})`);
      console.log(`     Issue Type: ${t.issue_type}`);
    });
    
    // Check if any SLA configs exist
    if (slaCount[0].count === 0) {
      console.log('\n❌ NO SLA CONFIGURATIONS FOUND!');
      console.log('💡 This is why you see "No SLA" in the frontend');
      console.log('🚀 Run: node check-sla-configs.js');
    } else {
      console.log('\n✅ SLA configurations exist, checking details...');
      const [configs] = await pool.execute('SELECT * FROM sla_configurations LIMIT 5');
      configs.forEach(c => {
        console.log(`   - Product ID: ${c.product_id}, Module ID: ${c.module_id}, Issue: ${c.issue_name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  quickSLACheck();
}

module.exports = { quickSLACheck };
