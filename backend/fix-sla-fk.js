require('dotenv').config({ path: require('path').resolve(__dirname, 'config.env') });
const { pool } = require('./modules/shared/database/database');

async function fixForeignKeys() {
  try {
    console.log('Fixing SLA timers foreign key...\n');
    
    // Drop old foreign key
    try {
      await pool.execute(`ALTER TABLE sla_timers DROP FOREIGN KEY sla_timers_ibfk_1`);
      console.log('✅ Dropped old tickets foreign key from sla_timers');
    } catch (e) {
      console.log('Drop foreign key skipped:', e.message);
    }
    
    // Add new foreign key to cases
    try {
      await pool.execute(`ALTER TABLE sla_timers ADD CONSTRAINT fk_sla_timers_case FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE`);
      console.log('✅ Added cases foreign key to sla_timers');
    } catch (e) {
      console.log('Add cases foreign key skipped:', e.message);
    }
    
    console.log('\nFixing escalations foreign key...\n');
    
    // Drop old foreign key
    try {
      await pool.execute(`ALTER TABLE escalations DROP FOREIGN KEY escalations_ibfk_1`);
      console.log('✅ Dropped old tickets foreign key from escalations');
    } catch (e) {
      console.log('Drop escalations foreign key skipped:', e.message);
    }
    
    // Add new foreign key to cases
    try {
      await pool.execute(`ALTER TABLE escalations ADD CONSTRAINT fk_escalations_case FOREIGN KEY (ticket_id) REFERENCES cases(id) ON DELETE CASCADE`);
      console.log('✅ Added cases foreign key to escalations');
    } catch (e) {
      console.log('Add escalations cases foreign key skipped:', e.message);
    }
    
    console.log('\n✅ Foreign keys fixed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixForeignKeys();
