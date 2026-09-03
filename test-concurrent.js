const { consumeToken } = require('./dist/core/token-bucket');
const { redis } = require('./dist/config/redis');

async function main() {
  const key = 'test_flood_' + Date.now();
  let allowedCount = 0;
  
  const promises = [];
  for (let i = 0; i < 120; i++) {
    promises.push(consumeToken(key));
  }
  
  const results = await Promise.all(promises);
  for (const r of results) {
    if (r.allowed) allowedCount++;
  }
  
  console.log(`Allowed: ${allowedCount} out of 120`);
  redis.disconnect();
}

main().catch(console.error);
