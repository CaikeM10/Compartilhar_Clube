// READ-ONLY TLS diagnostic for a DISPOSABLE Neon rehearsal branch (never production).
//   node scripts/neon-tls-diagnostic.cjs
// Shows, without any write, the evidence used by scripts/neon-account-rehearsal.cjs (see scripts/neon-tls.cjs):
//   A. client-side handshake probe (verified certificate and host name; no credentials sent);
//   B. plaintext refusal probe (dummy user, never a password);
//   C. the rehearsal's own driver (Prisma, sslmode=require&sslaccept=strict) in a READ ONLY transaction:
//      pg_stat_ssl + pg_stat_activity of pg_backend_pid(), i.e. its own session.
// Output: booleans, protocol/cipher names, SQLSTATE codes and the peer address CLASS only.
const { hiddenPrompt } = require('./local-auth-admin.cjs');
const { parseRemoteTarget, confirmTarget } = require('./neon-target.cjs');
const { assertRehearsalBranch } = require('./neon-branch-smoke.cjs');
const { addressClass, tlsProbe, plaintextProbe } = require('./neon-tls.cjs');

const SESSION_SQL = `SELECT current_database() AS database, s.ssl, s.version AS tls_version, s.cipher,
  host(a.client_addr) AS client_addr, a.backend_type, pg_is_in_recovery() AS replica,
  (SELECT count(*)::int FROM pg_settings WHERE name LIKE 'neon.%') AS neon_settings
  FROM pg_stat_ssl s JOIN pg_stat_activity a ON a.pid = s.pid WHERE s.pid = pg_backend_pid()`;

async function sessionView(db) {
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [row] = await tx.$queryRawUnsafe(SESSION_SQL);
    if (!row) return { sessionRowFound: false };
    return { sessionRowFound: true, database: row.database, serverSideSsl: row.ssl, serverSideTlsVersion: row.tls_version || null,
      serverSideCipher: row.cipher || null, peerAddressClass: addressClass(row.client_addr), backendType: row.backend_type,
      replica: row.replica, neonServer: row.neon_settings > 0 };
  }, { maxWait: 10000, timeout: 20000 });
}

function verdict({ probe, plaintext, session }) {
  const clientTlsVerified = probe?.sslAccepted === true && probe.certificateVerified === true;
  const plaintextRejected = plaintext?.plaintextRefused === true;
  const proxyHop = session?.serverSideSsl === false && ['private', 'loopback'].includes(session?.peerAddressClass);
  if (clientTlsVerified && plaintextRejected && proxyHop) return 'CHECK_MEASURES_PROXY_HOP_CONNECTION_IS_TLS';
  if (!clientTlsVerified) return 'CLIENT_TLS_NOT_PROVEN';
  if (!plaintextRejected) return 'ENDPOINT_ACCEPTS_PLAINTEXT';
  if (session?.serverSideSsl === true) return 'SERVER_SIDE_TLS_VISIBLE';
  return 'INCONCLUSIVE';
}

async function main({ prompt = hiddenPrompt, log = console.log } = {}) {
  if (process.argv.length !== 2) throw new Error('NO_ARGUMENTS_ACCEPTED');
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE_TERMINAL_REQUIRED');
  assertRehearsalBranch(await prompt('Nome da branch de ENSAIO no Neon (nao production): '));
  const production = String(await prompt('ID do endpoint da branch PRODUCTION (ep-..., do console Neon): ')).trim();
  if (!/^ep-[a-z0-9-]+$/.test(production)) throw new Error('PRODUCTION_ENDPOINT_ID_INVALID');
  const target = parseRemoteTarget(await prompt('Conexao DIRETA da branch de ENSAIO (entrada oculta): '));
  if (production === target.endpoint || target.endpoint.startsWith(`${production}-`)) throw new Error('TARGET_IS_PRODUCTION_ENDPOINT');
  await confirmTarget(target, prompt, log);

  const report = { at: new Date().toISOString(), endpoint: target.endpoint, database: target.database };
  try { report.probe = await tlsProbe(target.host); } catch (error) { report.probe = { error: error.message, detail: error.detail || null }; }
  try { report.plaintext = await plaintextProbe(target.host, target); } catch (error) { report.plaintext = { error: error.message }; }

  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: target.url } }, log: [] }); // url already carries sslaccept=strict
  try { report.session = { driver: 'prisma', sslmode: 'require', sslaccept: 'strict', ...(await sessionView(db)) }; }
  catch (error) { report.session = { driver: 'prisma', sslaccept: 'strict', error: error?.errorCode || error?.code || 'CONNECT_FAILED' }; }
  finally { await db.$disconnect(); }

  report.verdict = verdict(report);
  log(JSON.stringify(report, null, 2));
}

module.exports = { sessionView, verdict, SESSION_SQL };
if (require.main === module) {
  main().catch(error => { console.error(/^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'DIAGNOSTIC_FAILED'); process.exitCode = 1; });
}
