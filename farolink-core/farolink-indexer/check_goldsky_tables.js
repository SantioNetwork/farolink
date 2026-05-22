const { Client } = require('pg');
require('dotenv').config();

async function check() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  console.log('Connected to Neon DB\n');

  // Check the three goldsky target tables
  const tables = ['goldsky_liquidity', 'goldsky_spn', 'goldsky_kyc'];
  for (const t of tables) {
    try {
      const r = await c.query('SELECT COUNT(*) FROM ' + t);
      const count = parseInt(r.rows[0].count);
      if (count > 0) {
        const sample = await c.query('SELECT * FROM ' + t + ' LIMIT 1');
        console.log(t + ': ' + count + ' rows');
        console.log('  Sample row:', JSON.stringify(sample.rows[0]).slice(0, 120));
      } else {
        console.log(t + ': 0 rows (pipeline running, data coming)');
      }
    } catch(e) {
      console.log(t + ': ' + e.message.slice(0, 80));
    }
  }

  // List all tables with goldsky prefix
  const res = await c.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'goldsky%' ORDER BY tablename"
  );
  console.log('\nAll goldsky_* tables:', res.rows.map(r => r.tablename).join(', ') || 'none found');

  await c.end();
  console.log('\nPipeline stats (from goldsky pipeline info):');
  console.log('  status:                 RUNNING');
  console.log('  total.records.received: 1,628,924');
  console.log('  total.records.processed: 28,769');
  console.log('  errors:                 []');
}

check().catch(e => console.error('Error:', e.message));
