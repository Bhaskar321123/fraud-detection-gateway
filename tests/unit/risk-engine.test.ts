import { RiskEngine } from '../../src/core/risk-engine';
import { DetectionRule } from '../../src/types/rule.interface';
import { GatewayRequest } from '../../src/types/request-context';
import { RuleResult } from '../../src/types/risk-score';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Create a mock GatewayRequest with sensible defaults. */
function mockRequest(overrides?: Partial<GatewayRequest>): GatewayRequest {
  return {
    clientIp: '1.2.3.4',
    gatewayTimestamp: new Date().toISOString(),
    traceId: 'test-trace-id',
    geoLocation: null,
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    path: '/test',
    headers: {},
    body: {},
    ...overrides,
  } as GatewayRequest;
}

/** Create a mock DetectionRule. */
function mockRule(overrides?: Partial<DetectionRule> & { evaluateFn?: (req: GatewayRequest) => Promise<RuleResult> }): DetectionRule {
  const { evaluateFn, ...rest } = overrides ?? {};
  return {
    name: 'mock-rule',
    description: 'A mock detection rule',
    enabled: true,
    maxScore: 40,
    evaluate: evaluateFn ?? (async () => ({
      rule: rest.name ?? 'mock-rule',
      reason: 'Mock evaluation',
      score: 0,
    })),
    ...rest,
  };
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

describe('RiskEngine', () => {
  describe('evaluate()', () => {
    it('should return "allowed" with score 0 when all rules return score 0', async () => {
      const engine = new RiskEngine([
        mockRule({ name: 'rule-a' }),
        mockRule({ name: 'rule-b' }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.action).toBe('allowed');
      expect(result.totalScore).toBe(0);
      expect(result.rules).toHaveLength(2);
      expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return "allowed" with score 0 when there are no rules', async () => {
      const engine = new RiskEngine([]);
      const result = await engine.evaluate(mockRequest());

      expect(result.action).toBe('allowed');
      expect(result.totalScore).toBe(0);
      expect(result.rules).toHaveLength(0);
    });

    it('should return "warned" when total score >= warn threshold', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'high-scorer',
          maxScore: 60,
          evaluateFn: async () => ({ rule: 'high-scorer', reason: 'High score', score: 55 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.action).toBe('warned');
      expect(result.totalScore).toBe(55);
    });

    it('should return "blocked" when total score >= block threshold', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'blocker-a',
          maxScore: 50,
          evaluateFn: async () => ({ rule: 'blocker-a', reason: 'High', score: 50 }),
        }),
        mockRule({
          name: 'blocker-b',
          maxScore: 40,
          evaluateFn: async () => ({ rule: 'blocker-b', reason: 'High', score: 35 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.action).toBe('blocked');
      expect(result.totalScore).toBe(85);
    });

    it('should cap total score at 100', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'extreme-a',
          maxScore: 80,
          evaluateFn: async () => ({ rule: 'extreme-a', reason: 'Max', score: 80 }),
        }),
        mockRule({
          name: 'extreme-b',
          maxScore: 80,
          evaluateFn: async () => ({ rule: 'extreme-b', reason: 'Max', score: 80 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.totalScore).toBe(100);
    });

    it('should cap per-rule score at rule.maxScore', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'over-scorer',
          maxScore: 25,
          evaluateFn: async () => ({ rule: 'over-scorer', reason: 'Over max', score: 50 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.totalScore).toBe(25);
      expect(result.rules[0].score).toBe(25);
    });

    it('should skip disabled rules', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'disabled-rule',
          enabled: false,
          maxScore: 40,
          evaluateFn: async () => ({ rule: 'disabled-rule', reason: 'Should not run', score: 40 }),
        }),
        mockRule({
          name: 'enabled-rule',
          evaluateFn: async () => ({ rule: 'enabled-rule', reason: 'Normal', score: 10 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.totalScore).toBe(10);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].rule).toBe('enabled-rule');
    });

    it('should handle rule evaluation errors gracefully', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'crashing-rule',
          evaluateFn: async () => { throw new Error('Boom!'); },
        }),
        mockRule({
          name: 'healthy-rule',
          evaluateFn: async () => ({ rule: 'healthy-rule', reason: 'OK', score: 10 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      // The crashing rule should contribute 0, not block the engine
      expect(result.totalScore).toBe(10);
      expect(result.rules).toHaveLength(2);

      const crashedResult = result.rules.find((r) => r.rule === 'crashing-rule');
      expect(crashedResult).toBeDefined();
      expect(crashedResult!.score).toBe(0);
      expect(crashedResult!.reason).toContain('error');
    });

    it('should include evaluationTimeMs in the result', async () => {
      const engine = new RiskEngine([mockRule()]);
      const result = await engine.evaluate(mockRequest());

      expect(typeof result.evaluationTimeMs).toBe('number');
      expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should aggregate scores from multiple rules', async () => {
      const engine = new RiskEngine([
        mockRule({
          name: 'rule-1',
          maxScore: 30,
          evaluateFn: async () => ({ rule: 'rule-1', reason: 'R1', score: 15 }),
        }),
        mockRule({
          name: 'rule-2',
          maxScore: 30,
          evaluateFn: async () => ({ rule: 'rule-2', reason: 'R2', score: 20 }),
        }),
        mockRule({
          name: 'rule-3',
          maxScore: 40,
          evaluateFn: async () => ({ rule: 'rule-3', reason: 'R3', score: 10 }),
        }),
      ]);

      const result = await engine.evaluate(mockRequest());

      expect(result.totalScore).toBe(45);
      expect(result.rules).toHaveLength(3);
    });
  });

  describe('getRules()', () => {
    it('should return all registered rules with their metadata', () => {
      const engine = new RiskEngine([
        mockRule({ name: 'alpha', description: 'Alpha rule', maxScore: 20 }),
        mockRule({ name: 'beta', description: 'Beta rule', maxScore: 30, enabled: false }),
      ]);

      const rules = engine.getRules();

      expect(rules).toHaveLength(2);
      expect(rules[0]).toEqual({ name: 'alpha', description: 'Alpha rule', enabled: true, maxScore: 20 });
      expect(rules[1]).toEqual({ name: 'beta', description: 'Beta rule', enabled: false, maxScore: 30 });
    });
  });

  describe('setRuleEnabled()', () => {
    it('should enable/disable a rule by name', () => {
      const rule = mockRule({ name: 'toggleable' });
      const engine = new RiskEngine([rule]);

      expect(engine.setRuleEnabled('toggleable', false)).toBe(true);
      expect(engine.getRules()[0].enabled).toBe(false);

      expect(engine.setRuleEnabled('toggleable', true)).toBe(true);
      expect(engine.getRules()[0].enabled).toBe(true);
    });

    it('should return false for non-existent rule names', () => {
      const engine = new RiskEngine([mockRule({ name: 'real-rule' })]);
      expect(engine.setRuleEnabled('fake-rule', false)).toBe(false);
    });
  });
});
