import { consumeToken } from './src/core/token-bucket';
import { redis } from './src/config/redis';

async function main() {
  const key = 'test_flood_' + Date.now();
  let allowedCount = 0;
  
  const promises = [];
  for (let i = 0; i < 120; i++) {
    promises.push(consumeToken(key));
    if (i % 20 === 19) {
      const batch = await Promise.all(promises.splice(0));
      for (const r of batch) {
        if (r.allowed) allowedCount++;
      }
      // wait 480ms
      await new Promise(res => setTimeout(res, 480));
    }
  }
  
  console.log(`Allowed: ${allowedCount} out of 120`);
  redis.disconnect();
}

main().catch(console.error);
