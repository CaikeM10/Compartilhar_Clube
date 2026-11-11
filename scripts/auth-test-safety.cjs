const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');

function validateTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('AUTH_TEST_TARGET_REJECTED'); }
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' || url.port !== '5432' ||
      url.pathname !== '/compartilhar_auth_test' ||
      decodeURIComponent(url.username) !== 'compartilhar_auth_test_user' ||
      url.hash || [...url.searchParams].some(([k, v]) => k !== 'schema' || v !== 'public')) {
    throw new Error('AUTH_TEST_TARGET_REJECTED');
  }
  return value;
}

function loadTarget(root) {
  // Parse only this file; never load dotenv or consult DATABASE_URL.
  return validateTarget(parseEnv(fs.readFileSync(path.join(root, '.env.auth-test.local'), 'utf8')).TEST_DATABASE_URL);
}

async function verifyServer(db) {
  const [row] = await db.$queryRawUnsafe(`SELECT current_database() AS database,
    current_user AS username, host(inet_server_addr()) AS host,
    inet_server_port() AS port, current_setting('server_version') AS version`);
  if (row.database !== 'compartilhar_auth_test' || row.username !== 'compartilhar_auth_test_user' ||
      row.host !== '127.0.0.1' || row.port !== 5432) throw new Error('AUTH_TEST_SERVER_REJECTED');
  return row;
}
module.exports = { validateTarget, loadTarget, verifyServer };
