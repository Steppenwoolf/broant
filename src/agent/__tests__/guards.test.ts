import { describe, expect, it } from 'vitest';
import { Guards, READ_REPEAT_NUDGE, READ_REPEAT_STOP } from '../guards';
import type { Result } from '@src/browser-control';

const readOk = (url: string): Result =>
  ({
    ok: true,
    page: { tabId: 1, rev: 1, url, title: 'Article' },
  }) as unknown as Result;

describe('Guards read-loop tracking', () => {
  it('nudges on the 2nd read of the same URL and stops on the 3rd even across long cycles (>6 calls)', () => {
    const g = new Guards();
    const urls = [
      'https://news.ycombinator.com/item?id=1',
      'https://news.ycombinator.com/item?id=2',
      'https://news.ycombinator.com/item?id=3',
      'https://news.ycombinator.com/item?id=4',
      'https://news.ycombinator.com/item?id=5',
    ];

    // Cycle 1: 5 different articles -> no nudges
    for (const url of urls) {
      expect(g.record('read', {}, readOk(url), false)).toEqual({});
    }

    // Cycle 2: re-reading article 1 -> should nudge (count === READ_REPEAT_NUDGE)
    const v2 = g.record('read', {}, readOk(urls[0]), false);
    expect(READ_REPEAT_NUDGE).toBe(2);
    expect(v2.nudge).toContain('already read');
    expect(v2.stop).toBeUndefined();

    // Cycle 3: 3rd read -> should stop (count === READ_REPEAT_STOP)
    const v3 = g.record('read', {}, readOk(urls[0]), false);
    expect(READ_REPEAT_STOP).toBe(3);
    expect(v3.stop).toContain('repeated 3 times');
    expect(v3.guard).toBe('no_effect');
  });
});
