import fetch from 'node-fetch';
import { fileURLToPath } from 'node:url';

const DEFAULT_TARGET = process.env.LOAD_TEST_URL || 'http://localhost:3000/live/events';
const DEFAULT_CONNECTIONS = Number(process.env.LOAD_TEST_CONNECTIONS || 10);
const DEFAULT_REQUESTS = Number(process.env.LOAD_TEST_REQUESTS || 100);

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.floor(number);
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export async function worker({
  id,
  target,
  connections,
  requests,
  fetchImpl = fetch,
  errorLogger = console.error
}) {
  for (let i = id; i < requests; i += connections) {
    try {
      const response = await fetchImpl(target);
      if (response && typeof response.text === 'function') {
        await response.text();
      }
    } catch (error) {
      errorLogger(`worker ${id} error`, getErrorMessage(error));
    }
  }
}

export async function runLoadTest({
  target = DEFAULT_TARGET,
  connections = DEFAULT_CONNECTIONS,
  requests = DEFAULT_REQUESTS,
  fetchImpl = fetch,
  logger = console
} = {}) {
  const normalizedConnections = normalizePositiveInteger(connections, 1);
  const normalizedRequests = normalizePositiveInteger(requests, 0);

  const log = typeof logger?.log === 'function' ? logger.log : console.log;
  const error = typeof logger?.error === 'function' ? logger.error : console.error;

  const start = Date.now();
  const jobs = [];
  for (let i = 0; i < normalizedConnections; i += 1) {
    jobs.push(
      worker({
        id: i,
        target,
        connections: normalizedConnections,
        requests: normalizedRequests,
        fetchImpl,
        errorLogger: error
      })
    );
  }
  await Promise.all(jobs);
  const duration = Date.now() - start;
  log(`Completed ${normalizedRequests} requests in ${duration}ms`);
  return { duration, requests: normalizedRequests, connections: normalizedConnections };
}

function isExecutedDirectly() {
  if (typeof process === 'undefined' || !process.argv || process.argv.length < 2) {
    return false;
  }
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  runLoadTest().catch(error => {
    console.error('load test failed', error);
    process.exit(1);
  });
}
