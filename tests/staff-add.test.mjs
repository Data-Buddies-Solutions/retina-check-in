import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('staff can add unsigned attendees with validation and duplicate protection', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retina-add-'));
  process.env.DATABASE_URL = '';
  process.env.DATA_FILE = path.join(dir, 'attendees.json');
  process.env.STAFF_PIN = 'test-pin';
  const { default: app } = await import('../server.mjs');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify(body) });
  const details = { name: '  Dr. Manual Example  ', license: ' EX123 ', ce: 'YES', paid: 'NO' };
  try {
    assert.equal((await post('/api/staff', details)).status, 401);
    const login = await post('/api/login', { pin: 'test-pin' });
    cookie = login.headers.get('set-cookie').split(';')[0];
    for (const invalid of [{ name: ' ' }, { name: 'x'.repeat(151) }, { license: 3 }, { license: 'x'.repeat(81) }, { ce: 'invalid' }, { paid: 'invalid' }]) {
      assert.equal((await post('/api/staff', { ...details, ...invalid })).status, 400);
    }
    const created = await post('/api/staff', details);
    assert.equal(created.status, 201);
    const person = await created.json();
    assert.equal(person.name, 'Dr. Manual Example');
    assert.equal(person.license, 'EX123');
    assert.equal(person.signature, null);
    assert.equal(person.signedAt, null);
    assert.equal(person.walkIn, false);
    assert.equal((await post('/api/staff', { ...details, name: 'dr. manual example' })).status, 409);
    const roster = await (await fetch(base + '/api/attendees')).json();
    assert.equal(roster.length, 1);
    assert.equal(roster[0].id, person.id);
    const signed = await post('/api/sign', { ...details, id: person.id, signature: 'data:image/png;base64,YQ==' });
    assert.equal(signed.status, 200);
    assert.equal((await post('/api/staff', details)).status, 409);
    const rows = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
    assert.ok(rows[0].signedAt);
    assert.equal(rows[0].signature, 'data:image/png;base64,YQ==');
    const nameOnly = await post('/api/staff', { name: 'Name Only', license: '', ce: '', paid: '' });
    assert.equal(nameOnly.status, 201);
    assert.equal((await nameOnly.json()).license, '');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
