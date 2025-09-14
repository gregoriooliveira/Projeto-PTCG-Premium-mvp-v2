import fetch from 'node-fetch';

const target = process.env.LOAD_TEST_URL || 'http://localhost:3000/live/events';
const connections = Number(process.env.LOAD_TEST_CONNECTIONS || 10);
const requests = Number(process.env.LOAD_TEST_REQUESTS || 100);

async function worker(id) {
  for (let i = id; i < requests; i += connections) {
    try {
      const res = await fetch(target);
      await res.text();
    } catch (e) {
      console.error(`worker ${id} error`, e.message);
    }
  }
}

async function run() {
  const start = Date.now();
  const jobs = [];
  for (let i = 0; i < connections; i++) jobs.push(worker(i));
  await Promise.all(jobs);
  const dur = Date.now() - start;
  console.log(`Completed ${requests} requests in ${dur}ms`);
}

run().catch(e => {
  console.error('load test failed', e);
  process.exit(1);
});
