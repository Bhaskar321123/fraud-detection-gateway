const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgres://fdg_admin:changeme@127.0.0.1:5432/fraud_gateway'
});
client.connect()
  .then(() => client.query('SELECT action, count(*) FROM audit_logs GROUP BY action'))
  .then(r => console.log(r.rows))
  .catch(e => console.error(e))
  .finally(() => client.end());
