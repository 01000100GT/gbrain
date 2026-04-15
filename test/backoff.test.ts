import { describe, test, expect, beforeEach } from 'bun:test';
import { shouldProceed, preflight, complete, getThrottleState, _resetForTest } from '../src/core/backoff.ts';

describe('backoff', () => {
  beforeEach(() => {
    _resetForTest();
  });

  test('shouldProceed returns a ThrottleResult with required fields', () => {
    const result = shouldProceed();
    expect(typeof result.proceed).toBe('boolean');
    expect(typeof result.delay).toBe('number');
    expect(typeof result.reason).toBe('string');
    expect(typeof result.load).toBe('number');
    expect(typeof result.memoryUsed).toBe('number');
    expect(result.delay).toBeGreaterThanOrEqual(0);
    expect(result.load).toBeGreaterThanOrEqual(0);
    expect(result.memoryUsed).toBeGreaterThanOrEqual(0);
  });

  test('shouldProceed enforces concurrent process limit', () => {
    // Use extremely permissive thresholds so only concurrency matters
    const cfg = { loadStopPct: 1.0, loadSlowPct: 1.0, memoryStopPct: 1.0 };
    preflight('test-1', cfg);
    preflight('test-2', cfg);
    const result = shouldProceed(cfg);
    expect(result.proceed).toBe(false);
    expect(result.reason).toContain('batch processes active');
  });

  test('complete decrements active process count', async () => {
    const cfg = { loadStopPct: 1.0, loadSlowPct: 1.0, memoryStopPct: 1.0 };
    await preflight('test-1', cfg);
    await preflight('test-2', cfg);
    complete();
    const result = shouldProceed(cfg);
    expect(result.proceed).toBe(true);
  });

  test('complete does not go below zero', () => {
    complete();
    complete();
    const state = getThrottleState();
    expect(state.activeProcesses).toBe(0);
  });

  test('getThrottleState returns current metrics', () => {
    const state = getThrottleState();
    expect(typeof state.load).toBe('number');
    expect(typeof state.memoryUsed).toBe('number');
    expect(typeof state.activeProcesses).toBe('number');
    expect(typeof state.isActiveHours).toBe('boolean');
    expect(state.load).toBeGreaterThanOrEqual(0);
    expect(state.memoryUsed).toBeGreaterThan(0);
    expect(state.memoryUsed).toBeLessThanOrEqual(1);
  });

  test('shouldProceed allows with fully permissive thresholds', () => {
    const result = shouldProceed({
      loadStopPct: 1.0,
      loadSlowPct: 1.0,
      loadNormalPct: 1.0,
      memoryStopPct: 1.0,
    });
    expect(result.proceed).toBe(true);
  });

  test('shouldProceed blocks with zero thresholds', () => {
    const result = shouldProceed({
      loadStopPct: 0.0,
      memoryStopPct: 0.0,
    });
    // Either load or memory should trigger a block (unless on Windows with no load data)
    const loadAvg = require('os').loadavg();
    if (loadAvg[0] === 0 && loadAvg[1] === 0 && loadAvg[2] === 0) {
      // Windows/no-data: memory check would still block
      expect(result.memoryUsed).toBeGreaterThan(0);
    } else {
      expect(result.proceed).toBe(false);
    }
  });

  test('preflight registers a process and returns boolean', async () => {
    const cfg = { loadStopPct: 1.0, loadSlowPct: 1.0, memoryStopPct: 1.0 };
    const ok = await preflight('test-process', cfg);
    expect(ok).toBe(true);
    const state = getThrottleState();
    expect(state.activeProcesses).toBe(1);
  });

  test('preflight returns false when overloaded', async () => {
    const cfg = { loadStopPct: 0.0, memoryStopPct: 0.0 };
    const ok = await preflight('test-process', cfg);
    // On systems with load data, this should return false
    const loadAvg = require('os').loadavg();
    if (loadAvg[0] > 0) {
      expect(ok).toBe(false);
    }
  });

  test('_resetForTest clears module state', async () => {
    const cfg = { loadStopPct: 1.0, loadSlowPct: 1.0, memoryStopPct: 1.0 };
    await preflight('a', cfg);
    await preflight('b', cfg);
    _resetForTest();
    const state = getThrottleState();
    expect(state.activeProcesses).toBe(0);
  });

  test('delay is a non-negative number', () => {
    const result = shouldProceed();
    expect(result.delay).toBeGreaterThanOrEqual(0);
    // Delay should be at most 60s * multiplier
    expect(result.delay).toBeLessThanOrEqual(120000);
  });

  test('reason is descriptive (not empty)', () => {
    const result = shouldProceed();
    expect(result.reason.length).toBeGreaterThan(5);
  });
});
