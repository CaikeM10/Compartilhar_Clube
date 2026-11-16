// Remote (Neon) target handling for manual operator tools.
// Never loads .env files; the connection string is typed in a hidden prompt,
// kept only in memory and never printed (only host and database name are shown).

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function parseRemoteTarget(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('REMOTE_TARGET_INVALID'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw new Error('REMOTE_TARGET_INVALID');
  if (!url.hostname || LOCAL_HOSTS.has(url.hostname)) throw new Error('REMOTE_TARGET_MUST_BE_REMOTE');
  // Interactive transactions and advisory locks need a direct (non-pooled) connection.
  if (url.hostname.split('.')[0].endsWith('-pooler')) throw new Error('REMOTE_TARGET_USE_DIRECT_CONNECTION');
  const sslmode = url.searchParams.get('sslmode');
  if (!['require', 'verify-ca', 'verify-full'].includes(sslmode || '')) throw new Error('REMOTE_TARGET_SSL_REQUIRED');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database || database.includes('/')) throw new Error('REMOTE_TARGET_DATABASE_REQUIRED');
  if (url.searchParams.has('schema') && url.searchParams.get('schema') !== 'public') throw new Error('REMOTE_TARGET_SCHEMA_MUST_BE_PUBLIC');
  return { url: url.href, host: url.hostname, endpoint: url.hostname.split('.')[0], database };
}

/** Shows only non-secret identifiers and requires the operator to retype them. */
async function confirmTarget(target, prompt, log = console.log) {
  log(`Destino: host ${target.host} / banco ${target.database}`);
  const database = (await prompt('Digite o NOME DO BANCO para confirmar: ')).trim();
  const endpoint = (await prompt('Digite o ID DO ENDPOINT (primeira parte do host, ex.: ep-...): ')).trim();
  if (database !== target.database || endpoint !== target.endpoint) throw new Error('TARGET_NOT_CONFIRMED');
}

async function verifyDatabase(tx, target) {
  const [row] = await tx.$queryRawUnsafe('SELECT current_database() AS database');
  if (!row || row.database !== target.database) throw new Error('TARGET_DATABASE_MISMATCH');
}

const REQUIRED_USER_COLUMNS = ['id', 'name', 'email', 'createdAt', 'emailVerified', 'image', 'role', 'disabledAt', 'updatedAt'];
const REQUIRED_TABLES = ['users', 'auth_accounts', 'auth_sessions', 'auth_verifications'];

/** Fails closed unless 01-auth-better-auth.sql has been applied to this database. */
async function assertAuthSchemaReady(tx) {
  const tables = await tx.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
    REQUIRED_TABLES);
  const columns = await tx.$queryRawUnsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'");
  const haveTables = new Set(tables.map(row => row.table_name));
  const haveColumns = new Set(columns.map(row => row.column_name));
  if (REQUIRED_TABLES.some(name => !haveTables.has(name)) || REQUIRED_USER_COLUMNS.some(name => !haveColumns.has(name))) {
    throw new Error('AUTH_SCHEMA_NOT_MIGRATED');
  }
}

module.exports = { parseRemoteTarget, confirmTarget, verifyDatabase, assertAuthSchemaReady };
