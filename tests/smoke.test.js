import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../server/index.js');
const server = request(app);

test('GET /health returns ok', async () => {
  const res = await server.get('/health');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'ok');
});

test('GET /metrics returns text metrics', async () => {
  const res = await server.get('/metrics');
  assert.equal(res.statusCode, 200);
  assert.match(res.text, /process_uptime_seconds/);
  assert.equal(res.headers['content-type'], 'text/plain; charset=utf-8');
});
