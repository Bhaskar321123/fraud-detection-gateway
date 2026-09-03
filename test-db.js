const { Client } = require('pg');
require('dotenv').config({ path: __dirname + '/.env' });

async function testConnection() {
  console.log('Testing connection to:', process.env.PG_HOST);
  console.log('User:', process.env.PG_USER);
  console.log('Password length:', process.env.PG_PASSWORD?.length);
  
  const client = new Client({
    host: process.env.PG_HOST,
    port: process.env.PG_PORT,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    database: process.env.PG_DATABASE,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connection successful!');
    const res = await client.query('SELECT NOW()');
    console.log('DB Time:', res.rows[0]);
    await client.end();
  } catch (err) {
    console.error('❌ Connection failed:');
    console.error(err.message);
  }
}

testConnection();
