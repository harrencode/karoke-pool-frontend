import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPool, poolApiBase, poolRequest, PoolUnavailable, roomIdFromInput, validTicket } from '../lib/pool-api.ts';
import { canSing } from '../lib/pool-types.ts';

test('hosted frontend needs no backend configuration and does not fall back to visitor localhost', async t => {
  const previousWindow = globalThis.window;
  const previousApi = process.env.NEXT_PUBLIC_POOL_API_URL;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousApi === undefined) delete process.env.NEXT_PUBLIC_POOL_API_URL;
    else process.env.NEXT_PUBLIC_POOL_API_URL = previousApi;
  });
  delete process.env.NEXT_PUBLIC_POOL_API_URL;
  globalThis.window = { location: new URL('https://encore-example.vercel.app') };
  assert.equal(poolApiBase(), '');
  await assert.rejects(checkPool(poolApiBase()), PoolUnavailable);
  process.env.NEXT_PUBLIC_POOL_API_URL = 'https://pool.example.com/';
  assert.equal(poolApiBase(), 'https://pool.example.com');
  delete process.env.NEXT_PUBLIC_POOL_API_URL;
  globalThis.window = { location: new URL('http://localhost:3000') };
  assert.equal(poolApiBase(), 'http://localhost:8000');
});

test('pool unavailability covers missing configuration without a network request', async t => {
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Must not request an unconfigured backend'); });
  await assert.rejects(checkPool(''), PoolUnavailable);
});
test('connection failures and incompatible health responses become the friendly unavailable state', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(checkPool('http://backend.test'), PoolUnavailable);
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({status: 'ok'})));
  await assert.rejects(checkPool('http://backend.test'), PoolUnavailable);
  mock.mock.mockImplementation(async () => new Response('down', {status: 503}));
  await assert.rejects(checkPool('http://backend.test'), PoolUnavailable);
  mock.mock.mockImplementation(async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(checkPool('http://backend.test'), PoolUnavailable);
});
test('valid backend health enables pool and room errors retain their explanation', async t => {
  const mock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({status:'ok', service:'encore-pool', protocol:1})));
  await checkPool('http://backend.test');
  mock.mock.mockImplementation(async () => new Response(JSON.stringify({detail:'The host has locked this room.'}), {status:403}));
  await assert.rejects(poolRequest('http://backend.test', '/api/rooms/example/join', {name:'Guest'}), /locked/);
});
test('invitation parsing and stored credentials reject malformed values', () => {
  const id = 'secure_room_code_123';
  assert.equal(roomIdFromInput(id), id);
  assert.equal(roomIdFromInput(`https://karaoke.test/pool?room=${id}`), id);
  assert.equal(roomIdFromInput('https://karaoke.test/pool?room=../../etc'), null);
  assert.equal(validTicket({room_id:id, member_id:'member_code_123', token:'a'.repeat(43)}), true);
  assert.equal(validTicket({room_id:'../bad', member_id:'member_code_123', token:'a'.repeat(43)}), false);
});
test('singer policy gates disconnected, host-muted and unselected microphones', () => {
  const room = { mode:'group', singers:[], members:[{id:'me',connected:true,forced_muted:false}] };
  assert.equal(canSing(room, 'me'), true);
  assert.equal(canSing({...room,mode:'solo'}, 'me'), false);
  assert.equal(canSing({...room,mode:'duet',singers:['me']}, 'me'), true);
  assert.equal(canSing({...room,members:[{id:'me',connected:false}]}, 'me'), false);
  assert.equal(canSing({...room,members:[{id:'me',connected:true,forced_muted:true}]}, 'me'), false);
});
