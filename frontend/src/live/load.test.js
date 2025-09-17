import { describe, expect, it, vi } from 'vitest';
import { runLoadTest } from './loadRunner.js';

describe('load test runner', () => {
  it('sends the configured number of requests and logs the summary', async () => {
    const fetchMock = vi.fn(async () => ({ text: async () => {} }));
    const logMock = vi.fn();
    const errorMock = vi.fn();

    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(250);

    try {
      const result = await runLoadTest({
        target: 'http://example.test',
        connections: 2,
        requests: 5,
        fetchImpl: fetchMock,
        logger: { log: logMock, error: errorMock }
      });

      expect(fetchMock).toHaveBeenCalledTimes(5);
      expect(errorMock).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledWith('Completed 5 requests in 150ms');
      expect(result).toEqual({ duration: 150, requests: 5, connections: 2 });
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('logs failures without aborting the remaining requests', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({ text: async () => {} });
    const logMock = vi.fn();
    const errorMock = vi.fn();

    const nowSpy = vi
      .spyOn(Date, 'now')
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(60);

    try {
      const result = await runLoadTest({
        target: 'http://example.test',
        connections: 1,
        requests: 2,
        fetchImpl: fetchMock,
        logger: { log: logMock, error: errorMock }
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(errorMock).toHaveBeenCalledTimes(1);
      expect(errorMock).toHaveBeenCalledWith('worker 0 error', 'boom');
      expect(logMock).toHaveBeenCalledWith('Completed 2 requests in 40ms');
      expect(result.requests).toBe(2);
    } finally {
      nowSpy.mockRestore();
    }
  });
});
