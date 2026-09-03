const Redis = require('ioredis');

async function testRedis() {
  const redis = new Redis({
    host: '127.0.0.1',
    port: 6379,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000
  });

  try {
    await redis.ping();
    console.log('Redis is UP!');
    process.exit(0);
  } catch (err) {
    console.error('Redis is DOWN:', err.message);
    process.exit(1);
  }
}

testRedis();
