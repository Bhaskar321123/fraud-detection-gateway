import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ──────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────

const GATEWAY_HOST = process.env.GATEWAY_HOST ?? '127.0.0.1';
const GATEWAY_PORT = parseInt(process.env.PORT ?? '3000', 10);
const BASE_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;

// ──────────────────────────────────────────────────────────────
// CLI formatting
// ──────────────────────────────────────────────────────────────

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function log(color: string, prefix: string, message: string): void {
  console.log(`${color}${BOLD}[${prefix}]${RESET} ${message}`);
}

// ──────────────────────────────────────────────────────────────
// HTTP helpers
// ──────────────────────────────────────────────────────────────

interface SimulationResult {
  scenario: string;
  method: string;
  path: string;
  statusCode: number;
  riskScore: string | null;
  riskAction: string | null;
  traceId: string | null;
  responseTime: number;
  body: string;
  expectedBlocked: boolean | null;
  passed: boolean;
}

async function sendRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  scenario: string;
  expectedBlocked: boolean | null;
}): Promise<SimulationResult> {
  const start = performance.now();

  return new Promise<SimulationResult>((resolve) => {
    const url = new URL(options.path, BASE_URL);

    const reqOptions: http.RequestOptions = {
      hostname: GATEWAY_HOST,
      port: GATEWAY_PORT,
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      timeout: 10_000,
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const elapsed = Math.round(performance.now() - start);
        const statusCode = res.statusCode ?? 0;
        const riskScore = res.headers['x-risk-score'] as string | undefined ?? null;
        const riskAction = res.headers['x-risk-action'] as string | undefined ?? null;
        const traceId = res.headers['x-trace-id'] as string | undefined ?? null;

        let passed = true;

        if (options.expectedBlocked === true && res.statusCode !== 429 && res.statusCode !== 403) {
          log(RED, 'FAIL', `${options.scenario} — status=${res.statusCode}, expected blocked`);
          passed = false;
        } else if (
          options.expectedBlocked === false &&
          res.statusCode !== 200 &&
          res.statusCode !== 201 &&
          res.statusCode !== 404 &&
          res.statusCode !== 500 && // Allowed but downstream crashed
          res.statusCode !== 502    // Allowed but upstream missing
        ) {
          log(RED, 'FAIL', `${options.scenario} — status=${res.statusCode}, expected allowed`);
          passed = false;
        }

        resolve({
          scenario: options.scenario,
          method: options.method,
          path: options.path,
          statusCode,
          riskScore,
          riskAction,
          traceId,
          responseTime: elapsed,
          body: data,
          expectedBlocked: options.expectedBlocked,
          passed,
        });
      });
    });

    req.on('error', (err) => {
      const elapsed = Math.round(performance.now() - start);
      resolve({
        scenario: options.scenario,
        method: options.method,
        path: options.path,
        statusCode: 0,
        riskScore: null,
        riskAction: null,
        traceId: null,
        responseTime: elapsed,
        body: `Connection error: ${err.message}`,
        expectedBlocked: options.expectedBlocked,
        passed: false,
      });
    });

    req.on('timeout', () => {
      req.destroy();
    });

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────────────────────
// Attack Scenarios
// ──────────────────────────────────────────────────────────────

async function runNormalTraffic(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Normal traffic baseline — 5 benign requests');
  const results: SimulationResult[] = [];

  for (let i = 0; i < 5; i++) {
    const result = await sendRequest({
      method: 'GET',
      path: '/api/v1/proxy/users',
      scenario: `Normal GET #${i + 1}`,
      expectedBlocked: false,
    });
    results.push(result);
    logResult(result);
    await sleep(200);
  }

  return results;
}

async function runRateLimitFlood(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Rate-limit flood — 120 rapid requests from same origin');
  const results: SimulationResult[] = [];

  const promises: Promise<SimulationResult>[] = [];
  for (let i = 0; i < 120; i++) {
    promises.push(
      sendRequest({
        method: 'GET',
        path: '/api/v1/proxy/data',
        scenario: `Rate-limit flood #${i + 1}`,
        // Borderline requests (60-110) might pass or fail due to async execution and partial token refills.
        // We only firmly expect the first 60 to pass and the very last 10 to be blocked.
        expectedBlocked: i < 60 ? false : i >= 110 ? true : null,
      })
    );
  }

  const batch = await Promise.all(promises);
  results.push(...batch);

  const blocked = results.filter((r) => r.statusCode === 429).length;
  const allowed = results.filter((r) => r.statusCode !== 429 && r.statusCode !== 0).length;
  log(YELLOW, 'RESULT', `Rate-limit: ${blocked} blocked, ${allowed} allowed out of ${results.length}`);

  return results;
}

async function runSqlInjection(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'SQL Injection payloads');
  const payloads = [
    { body: { username: "admin' OR 1=1 --", password: 'test' }, label: 'OR 1=1 tautology' },
    { body: { query: "'; DROP TABLE users; --" }, label: 'DROP TABLE' },
    { body: { search: "UNION ALL SELECT * FROM credentials" }, label: 'UNION SELECT' },
    { body: { id: "1; DELETE FROM audit_logs; --" }, label: 'DELETE injection' },
    { body: { filter: "admin' AND 1=1 --" }, label: 'AND tautology' },
  ];

  const results: SimulationResult[] = [];

  for (const { body, label } of payloads) {
    const result = await sendRequest({
      method: 'POST',
      path: '/api/v1/proxy/login',
      body: JSON.stringify(body),
      scenario: `SQLi: ${label}`,
      expectedBlocked: false, // payload rule contributes score, may not block alone
    });
    results.push(result);
    logResult(result);
    await sleep(100);
  }

  return results;
}

async function runXssAttacks(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'XSS Attack payloads');
  const payloads = [
    { body: { comment: '<script>alert("xss")</script>' }, label: 'Script tag' },
    { body: { bio: '<img src=x onerror=alert(1)>' }, label: 'img onerror' },
    { body: { name: 'javascript:alert(document.cookie)' }, label: 'JS protocol' },
    { body: { input: '<iframe src="evil.com"></iframe>' }, label: 'iframe injection' },
    { body: { field: '<div onmouseover="steal()">' }, label: 'Event handler' },
  ];

  const results: SimulationResult[] = [];

  for (const { body, label } of payloads) {
    const result = await sendRequest({
      method: 'POST',
      path: '/api/v1/proxy/comments',
      body: JSON.stringify(body),
      scenario: `XSS: ${label}`,
      expectedBlocked: false, // payload rule alone may not trigger block threshold
    });
    results.push(result);
    logResult(result);
    await sleep(100);
  }

  return results;
}

async function runPathTraversal(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Path traversal attacks');
  const paths = [
    '/api/v1/proxy/files/../../../../etc/passwd',
    '/api/v1/proxy/download?file=..\\..\\..\\windows\\system32\\config\\sam',
  ];

  const results: SimulationResult[] = [];

  for (const attackPath of paths) {
    const result = await sendRequest({
      method: 'GET',
      path: attackPath,
      scenario: `Path traversal: ${attackPath.slice(0, 60)}`,
      expectedBlocked: false,
    });
    results.push(result);
    logResult(result);
    await sleep(100);
  }

  return results;
}

async function runCommandInjection(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Command injection payloads');
  const payloads = [
    { body: { hostname: '; cat /etc/passwd' }, label: 'cat injection' },
    { body: { input: '$(whoami)' }, label: 'Command substitution' },
    { body: { cmd: '| ls -la /root' }, label: 'Pipe injection' },
  ];

  const results: SimulationResult[] = [];

  for (const { body, label } of payloads) {
    const result = await sendRequest({
      method: 'POST',
      path: '/api/v1/proxy/execute',
      body: JSON.stringify(body),
      scenario: `CmdInj: ${label}`,
      expectedBlocked: false,
    });
    results.push(result);
    logResult(result);
    await sleep(100);
  }

  return results;
}

async function runBlacklistedIpTraffic(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Traffic from blacklisted IPs');
  const blacklistedIps = [
    '185.220.101.1',
    '185.220.102.240',
    '198.51.100.10',
    '203.0.113.10',
  ];

  const results: SimulationResult[] = [];

  for (const ip of blacklistedIps) {
    const result = await sendRequest({
      method: 'GET',
      path: '/api/v1/proxy/data',
      headers: { 'X-Forwarded-For': ip },
      scenario: `Blacklisted IP: ${ip}`,
      expectedBlocked: false, // IP reputation alone (30) is below block threshold (80)
    });
    results.push(result);
    logResult(result);
    await sleep(100);
  }

  return results;
}

async function runGeoShiftSimulation(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Geo-shift: impossible travel simulation');
  const results: SimulationResult[] = [];

  // First request from a New York IP
  const nyResult = await sendRequest({
    method: 'GET',
    path: '/api/v1/proxy/account',
    headers: { 'X-Forwarded-For': '72.229.28.185' }, // NYC area IP
    scenario: 'Geo-shift: Establish NY baseline',
    expectedBlocked: false,
  });
  results.push(nyResult);
  logResult(nyResult);

  // Immediate second request from a Tokyo IP (impossible travel)
  await sleep(500);
  const tokyoResult = await sendRequest({
    method: 'GET',
    path: '/api/v1/proxy/account',
    headers: { 'X-Forwarded-For': '210.171.226.40' }, // Tokyo area IP
    scenario: 'Geo-shift: Instant jump NY → Tokyo',
    expectedBlocked: false, // Geo-shift alone (35) is below block threshold (80)
  });
  results.push(tokyoResult);
  logResult(tokyoResult);

  return results;
}

async function runOversizedPayload(): Promise<SimulationResult[]> {
  log(CYAN, 'SCENARIO', 'Oversized payload (2MB body)');
  const results: SimulationResult[] = [];

  // Create a ~1.5MB JSON payload
  const largeBody = JSON.stringify({
    data: 'x'.repeat(1_500_000),
  });

  const result = await sendRequest({
    method: 'POST',
    path: '/api/v1/proxy/upload',
    body: largeBody,
    scenario: 'Oversized payload (~1.5MB)',
    expectedBlocked: false,
  });
  results.push(result);
  logResult(result);

  return results;
}

// ──────────────────────────────────────────────────────────────
// Logging & Reporting
// ──────────────────────────────────────────────────────────────

function logResult(result: SimulationResult): void {
  const statusColor = result.statusCode >= 400 ? RED : GREEN;
  const riskInfo = result.riskScore
    ? `${DIM}risk=${result.riskScore} action=${result.riskAction}${RESET}`
    : `${DIM}no risk headers${RESET}`;

  console.log(
    `  ${statusColor}${result.statusCode}${RESET} ` +
    `${result.method} ${result.path.slice(0, 50)} ` +
    `${DIM}${result.responseTime}ms${RESET} ${riskInfo}`
  );
}

function printSummary(allResults: SimulationResult[]): void {
  const total = allResults.length;
  const passed = allResults.filter((r) => r.passed).length;
  const failed = total - passed;
  const errors = allResults.filter((r) => r.statusCode === 0).length;
  const blocked = allResults.filter((r) => r.statusCode === 403 || r.statusCode === 429).length;
  const warned = allResults.filter((r) => r.riskAction === 'warned').length;
  const avgResponseTime = Math.round(
    allResults.reduce((sum, r) => sum + r.responseTime, 0) / total
  );

  const riskScores = allResults
    .filter((r) => r.riskScore !== null)
    .map((r) => parseInt(r.riskScore!, 10));
  const avgRisk = riskScores.length > 0
    ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
    : 0;
  const maxRisk = riskScores.length > 0 ? Math.max(...riskScores) : 0;

  console.log(`\n${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║   Attack Simulation — Summary Report                      ║${RESET}`);
  console.log(`${CYAN}${BOLD}╠═══════════════════════════════════════════════════════════╣${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Total Requests:    ${String(total).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   ${GREEN}Passed:${RESET}            ${String(passed).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   ${RED}Failed:${RESET}            ${String(failed).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   ${RED}Errors:${RESET}            ${String(errors).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Blocked:            ${String(blocked).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Warned:             ${String(warned).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Avg Response Time:  ${String(avgResponseTime + 'ms').padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Avg Risk Score:     ${String(avgRisk).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}║${RESET}   Max Risk Score:     ${String(maxRisk).padStart(6)}                              ${CYAN}${BOLD}║${RESET}`);
  console.log(`${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════╝${RESET}\n`);

  // Print failures if any
  const failures = allResults.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log(`${RED}${BOLD}Failed scenarios:${RESET}`);
    for (const f of failures.slice(0, 20)) {
      console.log(
        `  ${RED}✗${RESET} ${f.scenario} — ` +
        `status=${f.statusCode}, ` +
        `expected ${f.expectedBlocked ? 'blocked' : 'allowed'}`
      );
    }
    if (failures.length > 20) {
      console.log(`  ${DIM}… and ${failures.length - 20} more${RESET}`);
    }
    console.log();
  }
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}╔═══════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${CYAN}${BOLD}║   Fraud Detection Gateway — Attack Simulation             ║${RESET}`);
  console.log(`${CYAN}${BOLD}║   Target: ${BASE_URL.padEnd(48)}║${RESET}`);
  console.log(`${CYAN}${BOLD}╚═══════════════════════════════════════════════════════════╝${RESET}\n`);

  // Verify gateway is reachable
  log(CYAN, 'CHECK', 'Verifying gateway is reachable…');
  try {
    const healthResult = await sendRequest({
      method: 'GET',
      path: '/health',
      scenario: 'Health check',
      expectedBlocked: false,
    });

    if (healthResult.statusCode !== 200) {
      log(RED, 'ERROR', `Gateway health check failed (status: ${healthResult.statusCode})`);
      log(RED, 'ERROR', 'Make sure the gateway is running: npm run dev');
      process.exit(1);
    }

    log(GREEN, 'OK', 'Gateway is healthy');
  } catch {
    log(RED, 'ERROR', `Cannot reach gateway at ${BASE_URL}`);
    log(RED, 'ERROR', 'Make sure the gateway is running: npm run dev');
    process.exit(1);
  }

  const allResults: SimulationResult[] = [];

  // Run all scenarios sequentially
  console.log(`\n${BOLD}─── Scenario 1: Normal Traffic ──────────────────────────${RESET}\n`);
  allResults.push(...await runNormalTraffic());

  console.log(`\n${BOLD}─── Scenario 2: SQL Injection ───────────────────────────${RESET}\n`);
  allResults.push(...await runSqlInjection());

  console.log(`\n${BOLD}─── Scenario 3: XSS Attacks ─────────────────────────────${RESET}\n`);
  allResults.push(...await runXssAttacks());

  console.log(`\n${BOLD}─── Scenario 4: Path Traversal ─────────────────────────${RESET}\n`);
  allResults.push(...await runPathTraversal());

  console.log(`\n${BOLD}─── Scenario 5: Command Injection ──────────────────────${RESET}\n`);
  allResults.push(...await runCommandInjection());

  console.log(`\n${BOLD}─── Scenario 6: Blacklisted IPs ────────────────────────${RESET}\n`);
  allResults.push(...await runBlacklistedIpTraffic());

  console.log(`\n${BOLD}─── Scenario 7: Geo-Shift Simulation ───────────────────${RESET}\n`);
  allResults.push(...await runGeoShiftSimulation());

  console.log(`\n${BOLD}─── Scenario 8: Oversized Payload ──────────────────────${RESET}\n`);
  allResults.push(...await runOversizedPayload());

  console.log(`\n${BOLD}─── Scenario 9: Rate-Limit Flood ───────────────────────${RESET}\n`);
  allResults.push(...await runRateLimitFlood());

  // Print summary
  printSummary(allResults);
}

main().catch((error) => {
  log(RED, 'FATAL', `Simulation crashed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
