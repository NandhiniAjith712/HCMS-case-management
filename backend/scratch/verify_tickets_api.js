const axios = require('axios');

async function main() {
  try {
    console.log('🔄 Simulating Muni Syam login...');
    const loginRes = await axios.post('http://localhost:5000/api/auth/global-login', {
      email: 'munisyam@gmail.com',
      password: 'manager123'
    });
    
    if (!loginRes.data.success) {
      throw new Error('Login failed: ' + JSON.stringify(loginRes.data));
    }
    
    console.log('✅ Login successful!');
    const token = loginRes.data.data.token;
    console.log('🔑 Token received successfully!');
    
    console.log('🔄 Fetching tickets for Muni Syam...');
    const ticketsRes = await axios.get('http://localhost:5000/api/tickets', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!ticketsRes.data.success) {
      throw new Error('Fetch tickets failed: ' + JSON.stringify(ticketsRes.data));
    }
    
    const tickets = ticketsRes.data.data;
    console.log(`✅ Successfully fetched ${tickets.length} tickets!`);
    
    // Find ticket 260
    const ticket260 = tickets.find(t => t.id === 260);
    if (ticket260) {
      console.log('🎉 SUCCESS: Muni Syam can see ticket 260 (Marketing department)!');
      console.log('Ticket Details:', {
        id: ticket260.id,
        title: ticket260.issue_title,
        status: ticket260.status,
        department_id: ticket260.department_id
      });
    } else {
      console.error('❌ FAILURE: Muni Syam cannot see ticket 260!');
    }
    
    // Check if Muni Syam can see other tickets (like Loukya's ticket 247)
    const ticket247 = tickets.find(t => t.id === 247);
    if (ticket247) {
      console.log('🎉 SUCCESS: Muni Syam can see ticket 247 (Tech Support - primary dept/subagent)!');
    } else {
      console.log('⚠️ Note: Muni Syam cannot see ticket 247');
    }
  } catch (err) {
    console.error('❌ Error during verification:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  } finally {
    process.exit(0);
  }
}

main();
