// Local rehearsal of docs/producao-migracao/*.sql against the validated local test database ONLY.
// Everything runs inside ONE transaction that always ends in ROLLBACK: a scratch schema is created
// with the LEGACY schema (docs/auth-preparation/before.prisma) and synthetic data, then the real
// migration files are executed against it. Nothing persists; no .env is loaded; production is
// never contacted. Output: counts, codes and booleans only.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { loadTarget, verifyServer } = require('./auth-test-safety.cjs');

const root = path.resolve(__dirname, '..');
const dir = path.join(root, 'docs/producao-migracao');
const ROLLBACK = new Error('REHEARSAL_ROLLBACK');

/** Splits SQL on top-level semicolons, honouring comments, quotes and dollar quoting. */
function splitStatements(sql) {
  const out = [];
  let current = '';
  for (let i = 0; i < sql.length;) {
    const rest = sql.slice(i);
    if (rest.startsWith('--')) { const end = sql.indexOf('\n', i); i = end === -1 ? sql.length : end + 1; current += '\n'; continue; }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i]; let j = i + 1;
      while (j < sql.length) { if (sql[j] === quote) { if (sql[j + 1] === quote) { j += 2; continue; } break; } j++; }
      current += sql.slice(i, j + 1); i = j + 1; continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(rest);
    if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      if (end === -1) throw new Error('UNTERMINATED_DOLLAR_QUOTE');
      current += sql.slice(i, end + dollar[0].length); i = end + dollar[0].length; continue;
    }
    if (sql[i] === ';') { if (current.trim()) out.push(current.trim()); current = ''; i++; continue; }
    current += sql[i]; i++;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Rebinds a production file to the scratch schema and turns its transaction into a savepoint. */
function adapt(file, schema, savepoint) {
  return splitStatements(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\bpublic\b/g, schema)).map(statement => {
    if (/^BEGIN(\s+TRANSACTION\s+READ\s+ONLY)?$/i.test(statement)) return `SAVEPOINT ${savepoint}`;
    if (/^COMMIT$/i.test(statement)) return `RELEASE SAVEPOINT ${savepoint}`;
    if (/^ROLLBACK$/i.test(statement)) return `ROLLBACK TO SAVEPOINT ${savepoint}`;
    return statement;
  });
}

const plain = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? Number(v) : v));

async function run(tx, statements) {
  const results = [];
  for (const statement of statements) {
    if (/^(SELECT|WITH)\b/i.test(statement)) {
      // Prisma cannot deserialize regclass/interval/name columns; let PostgreSQL serialize each row.
      const rows = await tx.$queryRawUnsafe(`SELECT row_to_json(q)::text AS j FROM (${statement}) q`);
      results.push(rows.map(row => JSON.parse(row.j)));
    } else await tx.$executeRawUnsafe(statement);
  }
  return results;
}

async function expectFailure(tx, name, statements, pattern) {
  await tx.$executeRawUnsafe(`SAVEPOINT ${name}`);
  try { await run(tx, statements); }
  catch (error) {
    await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT ${name}`);
    const message = String(error.meta?.message || error.message || '');
    if (!pattern.test(message)) throw new Error(`UNEXPECTED_FAILURE_${name}`);
    return message.match(pattern)[0];
  }
  throw new Error(`EXPECTED_FAILURE_DID_NOT_HAPPEN_${name}`);
}

const fingerprintSql = `
SELECT 'users' AS t, count(*) AS n, md5(coalesce(string_agg(md5(row(id, name, email, password, "createdAt")::text), '' ORDER BY id), '')) AS fp FROM users
UNION ALL SELECT 'plans', count(*), md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans
UNION ALL SELECT 'subscriptions', count(*), md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions
UNION ALL SELECT 'payments', count(*), md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments`;

async function seedLegacy(tx) {
  // Synthetic data covering the risky shapes found in the analysis.
  await tx.$executeRawUnsafe(`INSERT INTO plans (id, name, price, duration) VALUES
    ('cplanmensal000000000000001', 'mensal', 4990, 1), ('cplananual0000000000000001', 'anual', 49900, 12)`);
  await tx.$executeRawUnsafe(`INSERT INTO users (id, name, email, password, "createdAt") VALUES
    ('cuser00000000000000000001', 'Aluna Um', 'aluna1@example.invalid', 'legacy$opaque$1', '2025-01-10'),
    ('cuser00000000000000000002', NULL, 'Aluno2@Example.invalid', NULL, '2025-02-11'),
    ('cuser00000000000000000003', 'Duplicada', 'dup@example.invalid', NULL, '2025-03-12'),
    ('cuser00000000000000000004', 'Duplicada caixa', 'DUP@example.invalid', 'legacy$opaque$4', '2025-03-13'),
    ('legacy-id-non-cuid', 'Formato antigo', ' espaco@example.invalid', NULL, '2024-12-01')`);
  await tx.$executeRawUnsafe(`INSERT INTO subscriptions (id, "userId", "planId", status, "startDate", "endDate") VALUES
    ('csub000000000000000000001', 'cuser00000000000000000001', 'cplanmensal000000000000001', 'active', now() - interval '10 days', now() + interval '20 days'),
    ('csub000000000000000000002', 'cuser00000000000000000002', 'cplananual0000000000000001', 'active', now() - interval '400 days', now() - interval '35 days'),
    ('csub000000000000000000003', 'cuser00000000000000000004', 'cplanmensal000000000000001', 'cancelled', now() - interval '60 days', now() - interval '30 days')`);
  await tx.$executeRawUnsafe(`INSERT INTO payments (id, "mercadopagoId", email, plan, status, amount) VALUES
    ('cpay000000000000000000001', 'mp-synthetic-1', 'aluna1@example.invalid', 'mensal', 'approved', 4990),
    ('cpay000000000000000000002', 'mp-synthetic-2', 'aluno2@example.invalid', 'anual', 'approved', 49900),
    ('cpay000000000000000000003', 'mp-synthetic-3', 'sem-conta@example.invalid', 'mensal', 'approved', 4990)`);
}

async function rehearse(db, { log = console.log } = {}) {
  const schema = `rehearsal_${randomBytes(6).toString('hex')}`;
  const legacyDdl = execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff',
    '--from-empty', '--to-schema-datamodel', path.join(root, 'docs/auth-preparation/before.prisma'), '--script'],
  { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PRISMA_HIDE_UPDATE_MESSAGE: '1' } });
  const report = {};
  try {
    await db.$transaction(async tx => {
      await verifyServer(tx);
      await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path = ${schema}`);
      await run(tx, splitStatements(legacyDdl));
      await seedLegacy(tx);

      const inspection = await run(tx, adapt('00-inspecao-somente-leitura.sql', schema, 's00'));
      const pick = predicate => inspection.find(rows => rows.length && predicate(rows[0])) || [];
      report.inspection = {
        newObjectsPresent: pick(r => 'exists' in r).filter(r => r.exists).map(r => r.name),
        enums: pick(r => 'enum_name' in r).map(r => r.enum_name),
        counts: pick(r => 'subscriptions' in r && 'payments' in r)[0],
        emailQuality: pick(r => 'with_uppercase' in r)[0],
        collisions: pick(r => 'colliding_groups' in r)[0],
        legacyFields: pick(r => 'legacy_password_present' in r)[0],
        idFormat: pick(r => 'cuid_like' in r)[0],
        relations: pick(r => 'subs_without_user' in r)[0],
        ownership: pick(r => 'current_user_is_owner' in r).every(r => r.current_user_is_owner),
      };
      const before = plain(await tx.$queryRawUnsafe(fingerprintSql));

      const started = Date.now();
      await run(tx, adapt('01-auth-better-auth.sql', schema, 's01'));
      report.apply01ms = Date.now() - started;
      report.rerun01 = await expectFailure(tx, 'r01', adapt('01-auth-better-auth.sql', schema, 's01b'), /PRECONDITION: [^\n"]+/);
      await run(tx, adapt('02-lessons.sql', schema, 's02'));
      report.rerun02 = await expectFailure(tx, 'r02', adapt('02-lessons.sql', schema, 's02b'), /PRECONDITION: [^\n"]+/);

      const post = await run(tx, adapt('03-pos-verificacao-somente-leitura.sql', schema, 's03'));
      const after = plain(await tx.$queryRawUnsafe(fingerprintSql));
      report.fingerprintsIdentical = JSON.stringify(before) === JSON.stringify(after);
      report.rows = Object.fromEntries(after.map(r => [r.t, r.n]));
      report.post = {
        roles: post.find(rows => rows.length && 'role' in rows[0] && 'email_verified' in rows[0]),
        admins: post.find(rows => rows.length && 'admins_with_credential' in rows[0])[0],
        sessions: post.find(rows => rows.length && 'active_sessions' in rows[0])[0],
      };
      const ddl = await tx.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = '${schema}' AND table_name = 'users' ORDER BY ordinal_position`);
      report.usersColumns = ddl.map(c => `${c.column_name}:${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`);
      report.legacyRowDefaults = plain(await tx.$queryRawUnsafe(`SELECT count(*) FILTER (WHERE role = 'STUDENT' AND NOT "emailVerified"
        AND "disabledAt" IS NULL AND "updatedAt" IS NOT NULL) AS ok, count(*) AS total FROM users`))[0];
      report.fkRestrict = plain(await tx.$queryRawUnsafe(`SELECT count(*) AS n FROM pg_constraint WHERE connamespace = '${schema}'::regnamespace
        AND contype = 'f' AND confdeltype = 'r' AND conrelid::regclass::text LIKE '%auth_%'`))[0].n;

      // Structural equality with the homologated local "public" schema (where Prisma Client and
      // Better Auth integration tests run): columns, types, nullability, defaults, indexes, FKs.
      const tables = ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'lessons'];
      const shape = async ns => (await Promise.all([
        tx.$queryRawUnsafe(`SELECT 'col|' || table_name || '.' || column_name || ':' || udt_name || ':' || is_nullable || ':' || coalesce(column_default, '-') AS v
          FROM information_schema.columns WHERE table_schema = $1 AND table_name = ANY($2::text[])`, ns, tables),
        tx.$queryRawUnsafe(`SELECT 'idx|' || indexdef AS v FROM pg_indexes WHERE schemaname = $1 AND tablename = ANY($2::text[])`, ns, tables),
        tx.$queryRawUnsafe(`SELECT 'con|' || c.relname || ':' || k.contype::text || ':' || pg_get_constraintdef(k.oid) AS v
          FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
          WHERE c.relnamespace = $1::regnamespace AND c.relname = ANY($2::text[])`, ns, tables),
      ])).flat().map(row => row.v.replace(/\b(public|rehearsal_[0-9a-f]+)\./g, ''));
      const local = new Set(await shape('public'));
      const rehearsed = new Set(await shape(schema));
      if (local.size < 40 || rehearsed.size < 40) throw new Error('SCHEMA_COMPARISON_TOO_SMALL');
      report.schemaVsHomologatedLocal = {
        comparedElements: { local: local.size, rehearsal: rehearsed.size },
        onlyInRehearsal: [...rehearsed].filter(x => !local.has(x)),
        onlyInLocal: [...local].filter(x => !rehearsed.has(x)),
      };

      // Emergency reversal: must refuse once auth data exists, and only then remove new objects.
      await tx.$executeRawUnsafe(`INSERT INTO auth_accounts (id, "accountId", "providerId", "userId", password)
        VALUES ('cacct00000000000000000001', 'cuser00000000000000000001', 'credential', 'cuser00000000000000000001', 'scrypt$synthetic')`);
      report.reversalWithData = await expectFailure(tx, 'r90', adapt('90-reversao-emergencia.sql', schema, 's90a'), /GUARD: [^\n"]+/);
      await tx.$executeRawUnsafe(`DELETE FROM auth_accounts WHERE id = 'cacct00000000000000000001'`);
      await run(tx, adapt('90-reversao-emergencia.sql', schema, 's90b'));
      const remaining = plain(await tx.$queryRawUnsafe(`SELECT
        (SELECT count(*) FROM information_schema.tables WHERE table_schema = '${schema}') AS tables,
        (SELECT count(*) FROM information_schema.columns WHERE table_schema = '${schema}' AND table_name = 'users') AS user_columns,
        (SELECT count(*) FROM pg_type WHERE typnamespace = '${schema}'::regnamespace AND typtype = 'e') AS enums`))[0];
      report.afterReversal = { ...remaining, fingerprintsIdentical: JSON.stringify(plain(await tx.$queryRawUnsafe(fingerprintSql))) === JSON.stringify(before) };
      // Harness only: in production each file COMMITs and "ON COMMIT DROP" removes this session temp table;
      // inside the single rehearsal transaction it survives, so discard it before re-applying 01.
      await tx.$executeRawUnsafe('DROP TABLE pg_temp._migration_before');
      await run(tx, adapt('01-auth-better-auth.sql', schema, 's01c'));
      await run(tx, adapt('02-lessons.sql', schema, 's02c'));
      report.reapplyAfterReversal = 'ok';
      throw ROLLBACK;
    }, { maxWait: 10000, timeout: 120000 });
  } catch (error) { if (error !== ROLLBACK) throw error; }
  const leftovers = plain(await db.$queryRawUnsafe(`SELECT count(*) AS n FROM pg_namespace WHERE nspname = '${schema}'`))[0].n;
  report.persisted = leftovers !== 0;
  log(JSON.stringify(report, null, 2));
  if (report.persisted) throw new Error('REHEARSAL_LEFT_OBJECTS');
  return report;
}

async function main() {
  const url = loadTarget(root);
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try { await verifyServer(db); return await rehearse(db); }
  finally { await db.$disconnect(); }
}

module.exports = { splitStatements, adapt, rehearse };
if (require.main === module) main().catch(error => {
  console.error(/^[A-Z0-9_]+$/.test(error.message || '') ? error.message : `REHEARSAL_FAILED: ${String(error.meta?.message || error.code || 'unknown').slice(0, 300)}`);
  process.exitCode = 1;
});
