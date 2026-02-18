// verify-kora-key.js
const axios = require('axios');
require('dotenv').config();

async function verifyKoraKey() {
  const apiKey = process.env.KORA_API_KEY;
  
  console.log('🔐 Verifying Kora LIVE API Key');
  console.log('Key:', apiKey);
  console.log('Key length:', apiKey.length);
  console.log('Key type:', apiKey.startsWith('sk_live_') ? 'LIVE' : 
              apiKey.startsWith('sk_test_') ? 'TEST' : 'UNKNOWN');
  
  if (!apiKey.startsWith('sk_live_')) {
    console.error('❌ ERROR: Not a LIVE key! Should start with "sk_live_"');
    console.error('Your key starts with:', apiKey.substring(0, 8));
    return;
  }
  
  // Test 1: Simple account resolution
  console.log('\n📡 Test 1: Account Resolution');
  try {
    const response = await axios.post(
      'https://api.korapay.com/merchant/api/v1/misc/banks/resolve',
      {
        account: "0000000000",  // Dummy account
        bank: "011"             // First Bank
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ Status:', response.status);
    console.log('✅ Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Failed:', error.response?.status || error.code);
    console.error('❌ Error:', error.response?.data?.message || error.message);
    console.error('❌ Details:', JSON.stringify(error.response?.data, null, 2));
  }
  
  // Test 2: Bank list
  console.log('\n📡 Test 2: Bank List');
  try {
    const response = await axios.get(
      'https://api.korapay.com/merchant/api/v1/misc/banks',
      {
        params: { countryCode: 'NG' },
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ Status:', response.status);
    console.log('✅ Data count:', response.data?.data?.length || 0);
    
  } catch (error) {
    console.error('❌ Failed:', error.response?.status || error.code);
    console.error('❌ Error:', error.response?.data?.message || error.message);
    console.error('❌ Details:', JSON.stringify(error.response?.data, null, 2));
  }
}

verifyKoraKey();