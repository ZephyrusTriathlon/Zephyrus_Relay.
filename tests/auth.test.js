const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');

test('PostgreSQL authentication, persistence, cookies, RBAC and safe identity', { timeout: 60000 }, async t => {
  const { createApp } = await import('../apps/api/src/app.js');
  const { createDatabase } = await import('../apps/api/src/db.js');
  const { scopeFor } = await import('../apps/api/src/auth.js');
  const { default: bcrypt } = await import('bcrypt');
  const db = createDatabase();
  const apps = [];
  const secret = 'integration-test-secret-at-least-32-characters';
  async function start(options = {}) {
    const app = createApp({ database: () => db, sessionSecret: secret, ...options });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const instance = { app, server, base: `http://127.0.0.1:${server.address().port}` };
    apps.push(instance);return instance;
  }
  t.after(async () => {
    for (const {app,server} of apps) {
      if(server.listening)await new Promise(resolve => server.close(resolve));
      await app.locals.sessionStore.close();
    }
    await db.$disconnect();
  });
  let instance = await start();
  const request = (path, cookie, body, extra = {}) => fetch(instance.base + '/api' + path, {
    headers: { ...(cookie ? {cookie} : {}), ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...extra },
    ...(body !== undefined ? {method:'POST',body:JSON.stringify(body)} : {})
  });
  const login = identifier => request('/auth/login', null, {identifier,password:'RelayDemo!26'});
  await t.test('unauthenticated me and protected endpoints return 401', async () => {
    for(const path of ['/auth/me','/dispatcher/scope','/driver/scope'])assert.equal((await request(path)).status,401);
  });
  await t.test('wrong password and unknown account have identical errors', async () => {
    const results = [];
    for(const identifier of ['store','unknown']) {
      const response = await request('/auth/login',null,{identifier,password:'wrong'});
      assert.equal(response.status,401);assert.equal(response.headers.get('set-cookie'),null);
      results.push(await response.json());
    }
    assert.deepEqual(results[0],results[1]);
    assert.equal((await request('/auth/login',null,{identifier:'store',password:'x'.repeat(73)})).status,400);
    assert.equal((await request('/auth/login',null,{identifier:'store',password:'RelayDemo!26'},{origin:'https://untrusted.example'})).status,403);
  });
  for(const [identifier,role,path] of [['store','STORE_MANAGER','store'],['dispatcher','DISPATCHER','dispatcher'],['loader','LOADER','loader'],['driver','DRIVER','driver']]) {
    await t.test(`successful login and logout: ${role}`, async () => {
      const response = await login(identifier);
      assert.equal(response.status,200);
      assert.deepEqual(await response.json(),{ok:true});
      const header = response.headers.get('set-cookie');
      assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Lax/);assert.doesNotMatch(header,/; Secure/);
      const cookie=header.split(';')[0];
      const me=await request('/auth/me',cookie);assert.equal(me.status,200);
      const body=await me.json();assert.equal(body.user.role,role);
      assert.equal(me.headers.get('cache-control'),'no-store');
      assert.doesNotMatch(JSON.stringify(body),/password|\$2[aby]\$/i);
      const stored=await db.user.findUnique({where:{id:body.user.id}});
      assert.match(stored.passwordHash,/^\$2b\$12\$/);
      assert.ok(await bcrypt.compare('RelayDemo!26',stored.passwordHash));
      assert.equal((await request(`/${path}/scope`,cookie)).status,200);
      if(role==='STORE_MANAGER') {
        for(const denied of ['/dispatcher/scope','/driver/scope','/loader/scope'])assert.equal((await request(denied,cookie)).status,403);
        assert.deepEqual(scopeFor(body.user).orders,{outletId:stored.outletId});
      }
      if(role==='DRIVER')assert.deepEqual(scopeFor(body.user).trips,{driverId:stored.id});
      if(role==='LOADER')assert.equal(scopeFor(body.user).trips.depotId,stored.depotId);
      assert.equal((await request('/auth/logout',cookie,{})).status,204);
      assert.equal((await request('/auth/me',cookie)).status,401);
    });
  }
  await t.test('session survives an API instance restart; login rotates and logout revokes it',async()=>{
    const response=await login('driver');const cookie=response.headers.get('set-cookie').split(';')[0];
    assert.ok((await db.$queryRaw`SELECT sid FROM "Session" WHERE sess::jsonb ->> 'userId' = 'demo-user-driver'`).length);
    await new Promise(resolve=>instance.server.close(resolve));
    instance=await start();
    assert.equal((await request('/auth/me',cookie)).status,200);
    const rotated=await request('/auth/login',cookie,{identifier:'store',password:'RelayDemo!26'});
    const newCookie=rotated.headers.get('set-cookie').split(';')[0];assert.notEqual(newCookie,cookie);
    assert.equal((await request('/auth/me',cookie)).status,401);
    assert.equal((await request('/driver/scope',newCookie)).status,403);
    await request('/auth/logout',newCookie,{});
    assert.equal((await request('/auth/me',newCookie)).status,401);
  });
  await t.test('expired and tampered sessions cannot authenticate',async()=>{
    const response=await login('driver');const cookie=response.headers.get('set-cookie').split(';')[0];
    const sid=decodeURIComponent(cookie.slice(cookie.indexOf('=')+1)).slice(2).split('.')[0];
    await db.$executeRaw`UPDATE "Session" SET expire = NOW() - INTERVAL '1 minute' WHERE sid = ${sid}`;
    assert.equal((await request('/auth/me',cookie)).status,401);
    assert.equal((await request('/auth/me',cookie + 'tampered')).status,401);
    await db.$executeRaw`DELETE FROM "Session" WHERE sid = ${sid}`;
    assert.deepEqual(scopeFor({role:'STORE_MANAGER',outletId:null}).orders,{outletId:'__unassigned__'});
    assert.equal(scopeFor({role:'LOADER',depotId:null}).trips.depotId,'__unassigned__');
  });
  await t.test('production requires a secret and HTTPS cookies',async()=>{
    assert.throws(()=>createApp({production:true,sessionSecret:''}),/SESSION_SECRET/);
    instance=await start({production:true});instance.app.set('trust proxy',1);
    const response=await request('/auth/login',null,{identifier:'driver',password:'RelayDemo!26'},{'x-forwarded-proto':'https'});
    assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/; Secure/);
    await request('/auth/logout',response.headers.get('set-cookie').split(';')[0],{}, {'x-forwarded-proto':'https'});
  });
});
