import { describe, expect, it, vi } from 'vitest';
import {
  dailyTotalId,
  dailyTotalRpcArgs,
  saveDailyTotal,
  SOTIRIA_DAILY_TOTAL_NAMESPACE,
  uuidV5,
  type DailyTotalRpcArgs,
} from '@/lib/daily-total';

const childId = '00000000-0000-0000-0000-000000000001';
const date = '2026-11-16';

describe('daily total UUID v5', () => {
  it('matches the RFC UUID v5 test vector', async () => {
    expect(await uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.widgets.com'))
      .toBe('21f7f8de-8051-5b89-8680-0195ef798b6a');
  });

  it('uses the verified Sotiria namespace and canonical child/date name', async () => {
    expect(SOTIRIA_DAILY_TOTAL_NAMESPACE).toBe('bd2f9761-59e2-56d3-b9c2-2e3f0a608a5b');
    expect(await dailyTotalId(childId, date)).toBe('e72fbdb7-0862-5ded-b861-02db3ff3e8be');
  });

  it('is stable for one child/date and distinct across children or dates', async () => {
    expect(await dailyTotalId(childId.toUpperCase(), date)).toBe(await dailyTotalId(childId, date));
    expect(await dailyTotalId(childId, date)).not.toBe(await dailyTotalId(childId, '2026-11-17'));
    expect(await dailyTotalId('00000000-0000-0000-0000-000000000002', date))
      .not.toBe(await dailyTotalId(childId, date));
  });
});

describe('daily total RPC writes', () => {
  it('derives RPC identity only from the supplied child/date pair', async () => {
    await expect(dailyTotalRpcArgs(childId, date, 60)).resolves.toEqual({
      p_id: 'e72fbdb7-0862-5ded-b861-02db3ff3e8be',
      p_child_id: childId,
      p_usage_date: date,
      p_minutes: 60,
    });
  });

  it('sends concurrent saves for one child/date to the same deterministic ID', async () => {
    const calls: DailyTotalRpcArgs[] = [];
    const rpc = vi.fn(async (args: DailyTotalRpcArgs) => {
      calls.push(args);
      return { error: null };
    });

    const results = await Promise.all([
      saveDailyTotal(rpc, childId, date, 60),
      saveDailyTotal(rpc, childId, date, 90),
    ]);

    expect(results).toEqual([{ error: null }, { error: null }]);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(new Set(calls.map(call => call.p_id)).size).toBe(1);
    expect(calls.map(call => call.p_minutes)).toEqual([60, 90]);
    expect(calls.every(call => call.p_child_id === childId && call.p_usage_date === date)).toBe(true);
  });
});
