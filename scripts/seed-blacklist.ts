import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = parseInt(process.env.REDIS_DB ?? '0', 10);
const REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX ?? 'fdg:';

// ──────────────────────────────────────────────────────────────
// Sample threat intelligence data
// ──────────────────────────────────────────────────────────────

/**
 * Known malicious IPs — these get maximum risk score from the IP reputation rule.
 * In production, these would come from threat intelligence feeds (AbuseIPDB, etc.).
 */
const BLACKLISTED_IPS: string[] = [
  // Sample Tor exit nodes (from publicly available lists)
  '185.220.101.1',
  '185.220.101.2',
  '185.220.101.3',
  '185.220.101.4',
  '185.220.101.5',
  '185.220.102.240',
  '185.220.102.241',
  '185.220.102.242',
  '185.220.102.243',
  '185.220.102.244',

  // Known scanner / brute-force IPs (examples)
  '45.33.32.156',    // scanme.nmap.org — common scan target/source
  '198.51.100.10',   // TEST-NET-2 sample
  '198.51.100.20',
  '198.51.100.30',
  '203.0.113.10',    // TEST-NET-3 sample
  '203.0.113.20',
  '203.0.113.30',

  // Datacenter / VPN exit nodes (examples)
  '104.248.0.1',
  '104.248.0.2',
  '167.99.0.1',
  '167.99.0.2',
  '159.89.0.1',
  '159.89.0.2',
];

/**
 * Suspicious IPs — lower confidence, contribute a smaller risk score.
 * These may include IPs with a history of automated traffic but not
 * definitively malicious.
 */
const SUSPICIOUS_IPS: string[] = [
  '51.15.0.1',
  '51.15.0.2',
  '51.15.0.3',
  '62.210.0.1',
  '62.210.0.2',
  '62.210.0.3',
  '163.172.0.1',
  '163.172.0.2',
  '163.172.0.3',
  '195.154.0.1',
  '195.154.0.2',
  '195.154.0.3',
  '178.62.0.1',
  '178.62.0.2',
  '188.166.0.1',
  '188.166.0.2',
];

// ──────────────────────────────────────────────────────────────
// CLI helpers
// ──────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(color: string, prefix: string, message: string): void {
  console.log(`${color}${BOLD}[${prefix}]${RESET} ${message}`);
}

function parseCliIps(): { blacklist: string[]; suspicious: string[] } {
  const args = process.argv.slice(2);
  const blacklist: string[] = [];
  const suspicious: string[] = [];

  let target: string[] = blacklist;

  for (const arg of args) {
    if (arg === '--blacklist' || arg === '-b') {
      target = blacklist;
    } else if (arg === '--suspicious' || arg === '-s') {
      target = suspicious;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
${BOLD}Fraud Detection Gateway — Blacklist Seeder${RESET}

Usage: npm run seed:blacklist [options] [IPs...]

Options:
  -b, --blacklist    Following IPs are added to the blacklist (default)
  -s, --suspicious   Following IPs are added to the suspicious list
  -h, --help         Show this help message

Examples:
  npm run seed:blacklist
  npm run seed:blacklist -- -b 10.0.0.1 10.0.0.2
  npm run seed:blacklist -- -b 10.0.0.1 -s 10.0.0.3 10.0.0.4
`);
      process.exit(0);
    } else if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(arg)) {
      target.push(arg);
    } else {
      log(YELLOW, 'WARN', `Skipping invalid IP: ${arg}`);
    }
  }

  return { blacklist, suspicious };
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║   Fraud Detection Gateway — Blacklist Seeder      ║${RESET}`);
  console.log(`${CYAN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}\n`);

  const cliIps = parseCliIps();

  const allBlacklist = [...BLACKLISTED_IPS, ...cliIps.blacklist];
  const allSuspicious = [...SUSPICIOUS_IPS, ...cliIps.suspicious];

  log(CYAN, 'INFO', `Connecting to Redis at ${REDIS_HOST}:${REDIS_PORT} (db: ${REDIS_DB})…`);

  const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    db: REDIS_DB,
    keyPrefix: REDIS_KEY_PREFIX,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    log(GREEN, 'OK', `Redis connected (PING → ${pong})`);

    // ── Seed blacklist ───────────────────────────────────────
    log(CYAN, 'INFO', `Seeding ${allBlacklist.length} IPs into blacklist:ips…`);

    if (allBlacklist.length > 0) {
      const added = await redis.sadd('blacklist:ips', ...allBlacklist);
      log(GREEN, 'OK', `Blacklist: ${added} new IPs added (${allBlacklist.length} total submitted)`);
    }

    if (cliIps.blacklist.length > 0) {
      log(YELLOW, 'CLI', `Custom blacklist IPs: ${cliIps.blacklist.join(', ')}`);
    }

    // ── Seed suspicious list ─────────────────────────────────
    log(CYAN, 'INFO', `Seeding ${allSuspicious.length} IPs into suspicious:ips…`);

    if (allSuspicious.length > 0) {
      const added = await redis.sadd('suspicious:ips', ...allSuspicious);
      log(GREEN, 'OK', `Suspicious: ${added} new IPs added (${allSuspicious.length} total submitted)`);
    }

    if (cliIps.suspicious.length > 0) {
      log(YELLOW, 'CLI', `Custom suspicious IPs: ${cliIps.suspicious.join(', ')}`);
    }

    // ── Summary ──────────────────────────────────────────────
    const blacklistSize = await redis.scard('blacklist:ips');
    const suspiciousSize = await redis.scard('suspicious:ips');

    console.log(`\n${GREEN}${BOLD}╔═══════════════════════════════════════════════════╗${RESET}`);
    console.log(`${GREEN}${BOLD}║   Seeding Complete                                ║${RESET}`);
    console.log(`${GREEN}${BOLD}╠═══════════════════════════════════════════════════╣${RESET}`);
    console.log(`${GREEN}${BOLD}║${RESET}   Blacklisted IPs:  ${String(blacklistSize).padStart(6)}                      ${GREEN}${BOLD}║${RESET}`);
    console.log(`${GREEN}${BOLD}║${RESET}   Suspicious IPs:   ${String(suspiciousSize).padStart(6)}                      ${GREEN}${BOLD}║${RESET}`);
    console.log(`${GREEN}${BOLD}╚═══════════════════════════════════════════════════╝${RESET}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(RED, 'ERROR', `Failed to seed Redis: ${message}`);
    process.exit(1);
  } finally {
    redis.disconnect();
    log(CYAN, 'INFO', 'Redis connection closed');
  }
}

main();
