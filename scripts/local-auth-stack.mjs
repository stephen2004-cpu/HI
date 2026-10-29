// Isolated, minimal self-hosted Supabase Auth + PostgREST + PostgreSQL test stack.
// Run only locally. No managed project/production credentials are used.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
const root = '/tmp/lbd-auth-stack';
mkdirSync(root, { recursive: true, mode: 0o700 });
const password = randomBytes(24).toString('hex'),
  jwtSecret = randomBytes(32).toString('hex');
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ role: 'anon', iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 })}`;
const anon = `${body}.${createHmac('sha256', jwtSecret).update(body).digest('base64url')}`;
const docker = (args, input) =>
  execFileSync('docker', args, {
    input,
    stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
const env = (name, values) => {
  const path = `${root}/${name}.env`;
  writeFileSync(
    path,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    { mode: 0o600 },
  );
  return path;
};
// Private, local SMTP capture for recovery-email integration tests. No mail is
// delivered externally and no email body/token is printed to stdout.
writeFileSync(`${root}/mailbox.json`, '[]', { mode: 0o600 });
const mailbox = [];
const smtp = net.createServer((socket) => {
  socket.setEncoding('utf8');
  socket.write('220 local-test SMTP ready\r\n');
  let buffer = '',
    data = false,
    lines = [],
    recipient = '';
  socket.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\r\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data) {
        if (line === '.') {
          mailbox.push({ recipient, raw: lines.join('\r\n') });
          writeFileSync(`${root}/mailbox.json`, JSON.stringify(mailbox), {
            mode: 0o600,
          });
          data = false;
          lines = [];
          socket.write('250 Message captured\r\n');
        } else lines.push(line.startsWith('..') ? line.slice(1) : line);
      } else if (/^EHLO/i.test(line))
        socket.write('250-local-test\r\n250 8BITMIME\r\n');
      else if (/^DATA/i.test(line)) {
        data = true;
        socket.write('354 End with dot\r\n');
      } else if (/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
      else {
        if (/^RCPT TO:/i.test(line))
          recipient = line.slice(8).trim().replace(/[<>]/g, '');
        socket.write('250 OK\r\n');
      }
    }
  });
  socket.on('error', () => {});
});
await new Promise((resolve, reject) => {
  smtp.once('error', reject);
  smtp.listen(54328, '0.0.0.0', resolve);
});

try {
  docker(['network', 'create', 'lbd-auth-test']);
} catch {}
for (const n of ['lbd-auth-gotrue', 'lbd-auth-rest', 'lbd-auth-pg']) {
  try {
    docker(['rm', '-f', n]);
  } catch {}
}
docker([
  'run',
  '-d',
  '--name',
  'lbd-auth-pg',
  '--network',
  'lbd-auth-test',
  '--env-file',
  env('pg', { POSTGRES_PASSWORD: password }),
  'postgres:15-alpine',
]);
for (let i = 0; i < 60; i++) {
  try {
    docker([
      'exec',
      'lbd-auth-pg',
      'pg_isready',
      '-h',
      '127.0.0.1',
      '-U',
      'postgres',
    ]);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
const sql = `create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;create role authenticator login password '${password}' noinherit;grant anon,authenticated,service_role to authenticator;create role supabase_auth_admin login createrole password '${password}';create schema auth authorization supabase_auth_admin;grant usage on schema auth to anon,authenticated,service_role;grant usage on schema public to anon,authenticated,service_role;create extension if not exists pgcrypto;create extension if not exists "uuid-ossp";create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claims'',true)::jsonb->>''sub'','''')::uuid';alter function auth.uid() owner to supabase_auth_admin;`;
docker(
  [
    'exec',
    '-i',
    'lbd-auth-pg',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  sql,
);
docker([
  'run',
  '-d',
  '--name',
  'lbd-auth-gotrue',
  '--add-host',
  'host.docker.internal:host-gateway',
  '--network',
  'lbd-auth-test',
  '-p',
  '127.0.0.1:54326:9999',
  '--env-file',
  env('auth', {
    GOTRUE_API_HOST: '0.0.0.0',
    GOTRUE_API_PORT: '9999',
    API_EXTERNAL_URL: 'http://127.0.0.1:54321',
    GOTRUE_SITE_URL: 'http://127.0.0.1:5174',
    GOTRUE_URI_ALLOW_LIST: 'http://127.0.0.1:5174/**',
    GOTRUE_DB_DRIVER: 'postgres',
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@lbd-auth-pg:5432/postgres?search_path=auth`,
    GOTRUE_JWT_SECRET: jwtSecret,
    GOTRUE_JWT_EXP: '3600',
    GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
    GOTRUE_JWT_ADMIN_ROLES: 'service_role',
    GOTRUE_DISABLE_SIGNUP: 'false',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
    GOTRUE_MAILER_AUTOCONFIRM: 'true',
    GOTRUE_SMTP_HOST: 'host.docker.internal',
    GOTRUE_SMTP_PORT: '54328',
    GOTRUE_SMTP_ADMIN_EMAIL: 'auth@lbd-local.test',
    GOTRUE_SMTP_SENDER_NAME: 'LBD Local Test',
    GOTRUE_SMTP_MAX_FREQUENCY: '1s',
    GOTRUE_MAILER_URLPATHS_RECOVERY: '/auth/v1/verify',
    GOTRUE_RATE_LIMIT_EMAIL_SENT: '1000',
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: '1000',
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true',
  }),
  'supabase/gotrue:v2.197.0',
]);
let ready = false;
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch('http://127.0.0.1:54326/health')).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (!ready)
  throw Error(
    'Local Auth did not become healthy; inspect docker logs lbd-auth-gotrue.',
  );
docker(
  [
    'exec',
    '-i',
    'lbd-auth-pg',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  `create or replace function auth.uid() returns uuid language sql stable as 'select coalesce(nullif(current_setting(''request.jwt.claim.sub'',true),''''),nullif(current_setting(''request.jwt.claims'',true),'''')::jsonb->>''sub'')::uuid';`,
);
const { readFileSync } = await import('node:fs');
docker(
  [
    'exec',
    '-i',
    'lbd-auth-pg',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  readFileSync(
    new URL(
      '../supabase/migrations/202610270001_auth_workspace.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
docker(
  [
    'exec',
    '-i',
    'lbd-auth-pg',
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ],
  readFileSync(
    new URL(
      '../supabase/migrations/202610300001_habit_deletions.sql',
      import.meta.url,
    ),
    'utf8',
  ),
);
docker([
  'run',
  '-d',
  '--name',
  'lbd-auth-rest',
  '--network',
  'lbd-auth-test',
  '-p',
  '127.0.0.1:54327:3000',
  '--env-file',
  env('rest', {
    PGRST_DB_URI: `postgres://authenticator:${password}@lbd-auth-pg:5432/postgres`,
    PGRST_DB_SCHEMAS: 'public',
    PGRST_DB_ANON_ROLE: 'anon',
    PGRST_JWT_SECRET: jwtSecret,
    PGRST_SERVER_PORT: '3000',
  }),
  'postgrest/postgrest:v16.5',
]);
writeFileSync(
  `${root}/public.json`,
  JSON.stringify({ url: 'http://127.0.0.1:54321', key: anon }),
  { mode: 0o600 },
);
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,accept-profile,content-profile',
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  );
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const emailVerification =
    req.method === 'GET' && req.url.startsWith('/auth/v1/verify?');
  if (req.headers.apikey !== anon && !emailVerification) {
    res.writeHead(401);
    res.end();
    return;
  }
  const auth = req.url.startsWith('/auth/v1/'),
    rest = req.url.startsWith('/rest/v1/');
  if (!auth && !rest) {
    res.writeHead(404);
    res.end();
    return;
  }
  const upstream = http.request(
    {
      hostname: '127.0.0.1',
      port: auth ? 54326 : 54327,
      path: req.url.replace(auth ? '/auth/v1' : '/rest/v1', ''),
      method: req.method,
      headers: {
        ...req.headers,
        host: auth ? '127.0.0.1:54326' : '127.0.0.1:54327',
      },
    },
    (response) => {
      res.writeHead(response.statusCode, {
        ...response.headers,
        'access-control-allow-origin': req.headers.origin ?? '*',
      });
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
});
server.listen(54321, '127.0.0.1', () =>
  console.log(
    'Local Supabase Auth/PostgREST test stack ready. Public test configuration: /tmp/lbd-auth-stack/public.json',
  ),
);
