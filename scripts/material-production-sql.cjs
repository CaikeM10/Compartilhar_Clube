// Offline generator for docs/producao-migracao/{04,05,91}-*.sql. No database connection, no environment loading.
// Every material value comes from scripts/material-catalog-import-plan.cjs (lib/materials/catalog.json); nothing is typed by hand.
//   node scripts/material-production-sql.cjs           -> checks the versioned files match (exit 1 if not)
//   node scripts/material-production-sql.cjs --write   -> rewrites the three files (review the diff before committing)
const fs = require('node:fs');
const path = require('node:path');
const { initialRecords, importSummary } = require('./material-catalog-import-plan.cjs');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'docs/producao-migracao');
const FILES = {
  migration: '04-materials.sql',
  verification: '05-materials-verificacao-somente-leitura.sql',
  rollback: '91-materials-reversao.sql',
};
const COLUMNS = ['id', 'title', 'description', 'priceCents', 'currency', 'coverImage', 'checkoutUrl', 'isPremium', 'displayOrder', 'status'];
const quoted = COLUMNS.map(column => `"${column}"`).join(', ');
const LOCK = 61420320; // same advisory lock as scripts/local-material-catalog.cjs

/** SQL literal for the catalog value types (string, integer, boolean, null). Strings use standard quoting. */
function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'string') {
    if (value.includes('\0')) throw new Error('INVALID_SQL_STRING');
    return `'${value.replace(/'/g, "''")}'`;
  }
  throw new Error('UNSUPPORTED_SQL_VALUE');
}
const tuple = record => `(${COLUMNS.map(column => literal(record[column])).join(', ')})`;

/** Reviewed DDL from prisma/proposals/materials.sql, verbatim, without its own BEGIN/COMMIT. */
function proposalDdl() {
  const sql = fs.readFileSync(path.join(root, 'prisma/proposals/materials.sql'), 'utf8').replace(/\r\n/g, '\n');
  const start = sql.indexOf('BEGIN;\n');
  const end = sql.lastIndexOf('COMMIT;');
  if (start === -1 || end === -1) throw new Error('PROPOSAL_SQL_SHAPE_CHANGED');
  return sql.slice(start + 'BEGIN;\n'.length, end).trim();
}

const records = () => initialRecords();
const expectedValues = () => `(VALUES\n${records().map(record => `    ${tuple(record)}`).join(',\n')}\n  ) AS expected(${quoted})`;
const actualRows = `SELECT ${COLUMNS.map(column => column === 'status' ? '"status"::text' : `"${column}"`).join(', ')} FROM "materials"`;
// Catalog rows absent or different in the database / database rows absent or different in the catalog.
const missingInDb = () => `SELECT * FROM ${expectedValues()}\n   EXCEPT ${actualRows}`;
const extraInDb = () => `${actualRows}\n   EXCEPT SELECT * FROM ${expectedValues()}`;
const divergence = () => `(${missingInDb()})\n  UNION ALL\n  (${extraInDb()})`;

const header = (title, lines) => [
  '-- =====================================================================',
  `-- ${title}`,
  '-- =====================================================================',
  '-- GERADO por scripts/material-production-sql.cjs a partir de lib/materials/catalog.json.',
  '-- Não editar à mão: altere o gerador e rode `node scripts/material-production-sql.cjs --write`.',
  ...lines.map(line => `-- ${line}`.trimEnd()),
  '-- =====================================================================',
  '',
].join('\n');

// Tables created by 01/02 that must already exist (production auth + lessons migrated).
const REQUIRED_TABLES = ['users', 'plans', 'subscriptions', 'payments', 'auth_accounts', 'auth_sessions', 'auth_verifications', 'lessons'];
// Fingerprints of data this migration must never touch. auth_sessions/auth_verifications are excluded on purpose:
// logins during the window legitimately write them, and this script does not reference them.
const fingerprints = [
  ['users', `count(*) FROM users`, `md5(coalesce(string_agg(md5(row(id, email, role, "disabledAt", "createdAt")::text), '' ORDER BY id), '')) FROM users`],
  ['plans', `count(*) FROM plans`, `md5(coalesce(string_agg(md5(row(id, name, price, duration, "createdAt")::text), '' ORDER BY id), '')) FROM plans`],
  ['subscriptions', `count(*) FROM subscriptions`, `md5(coalesce(string_agg(md5(row(id, "userId", "planId", status, "startDate", "endDate", "createdAt")::text), '' ORDER BY id), '')) FROM subscriptions`],
  ['payments', `count(*) FROM payments`, `md5(coalesce(string_agg(md5(row(id, "mercadopagoId", email, plan, status, amount, "createdAt")::text), '' ORDER BY id), '')) FROM payments`],
  ['lessons', `count(*) FROM lessons`, `md5(coalesce(string_agg(md5(row(id, status, "updatedAt")::text), '' ORDER BY id), '')) FROM lessons`],
  ['auth_accounts', `count(*) FROM auth_accounts`, `md5(coalesce(string_agg(md5(row(id, "userId", "providerId")::text), '' ORDER BY id), '')) FROM auth_accounts`],
];
const enumCheck = `  IF (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'DRAFT,PUBLISHED,ARCHIVED'
     OR (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'MaterialAssetStatus' AND t.typnamespace = 'public'::regnamespace) IS DISTINCT FROM 'PENDING,VALIDATED,REJECTED,ARCHIVED' THEN
    RAISE EXCEPTION '%: enums de materiais divergentes', label;
  END IF;`;

function buildMigration() {
  const summary = importSummary();
  const [draft] = summary.draft;
  if (summary.total !== 15 || summary.draft.length !== 1) throw new Error('UNEXPECTED_CATALOG_SHAPE');
  return `${header('04 — MIGRAÇÃO INCREMENTAL: materiais (PROPOSTA — NÃO EXECUTADA)', [
    'Natureza: somente ADITIVA. Cria 2 enums, 2 tabelas novas (materials, material_assets),',
    'índices, FK RESTRICT e CHECKs de prisma/proposals/materials.sql, e importa os 15 materiais',
    `do catálogo: ${summary.published.length} PUBLISHED e ${summary.draft.length} DRAFT (${draft}, sem link Hotmart).`,
    'NÃO altera, renomeia ou apaga nada existente. NÃO toca users, auth_*, plans,',
    'subscriptions, payments ou lessons (impressões digitais conferidas no fim).',
    '',
    'Pré-requisitos: 01 e 02 já aplicados; backup (branch Neon) criado; autorização explícita.',
    'Execução (conexão DIRETA, sem -pooler; o arquivo controla a própria transação):',
    '  psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 04-materials.sql',
    'Qualquer erro aborta a transação inteira: nada é aplicado.',
    'Reexecução: recusada pela pré-condição (as tabelas já existem). Não usar IF NOT EXISTS:',
    'drift deve ser analisado, não mascarado.',
    'Depois: rodar 05 (trava operacional) ANTES de definir MATERIALS_PERSISTENCE=enabled.',
    'Isolamento REPEATABLE READ: as impressões digitais de antes e depois usam o mesmo snapshot,',
    'então escritas concorrentes legítimas (webhook, login) não abortam a migração; uma alteração',
    'feita por este próprio script nessas tabelas continua sendo detectada.',
  ])}
SET client_encoding = 'UTF8';
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(${LOCK});

-- ---------------------------------------------------------------------
-- Pré-condições
-- ---------------------------------------------------------------------
DO $pre$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY[${REQUIRED_TABLES.map(literal).join(', ')}]) t
  WHERE to_regclass(format('public.%I', t)) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas ausentes (aplicar 01/02 antes): %', missing;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role' AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: tipo "Role" ausente (01 não aplicado)';
  END IF;
  IF to_regclass('public.materials') IS NOT NULL OR to_regclass('public.material_assets') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: tabelas de materiais já existem';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('MaterialStatus', 'MaterialAssetStatus') AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'PRECONDITION: enums de materiais já existem';
  END IF;
END
$pre$;

-- Impressões digitais dos dados que esta migração não pode tocar.
CREATE TEMP TABLE _materials_before ON COMMIT DROP AS SELECT
${fingerprints.map(([name, count, fp]) => `  (SELECT ${count}) AS ${name},\n  (SELECT ${fp}) AS fp_${name}`).join(',\n')};

-- ---------------------------------------------------------------------
-- Estrutura (idêntica a prisma/proposals/materials.sql)
-- ---------------------------------------------------------------------
${proposalDdl()}

-- ---------------------------------------------------------------------
-- Importação dos 15 materiais do catálogo (ids, títulos, preços, capas,
-- links e ordem preservados; sem link Hotmart => DRAFT).
-- ON CONFLICT DO NOTHING: nunca sobrescreve um registro existente.
-- ---------------------------------------------------------------------
INSERT INTO "materials" (${quoted}, "updatedAt") VALUES
${records().map(record => `  ${tuple(record).slice(0, -1)}, CURRENT_TIMESTAMP)`).join(',\n')}
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------
-- Pós-condições
-- ---------------------------------------------------------------------
DO $post$
DECLARE
  b record;
  label constant text := 'POSTCONDITION';
BEGIN
  SELECT * INTO b FROM _materials_before;
${fingerprints.map(([name, count, fp]) => `  IF (SELECT ${count}) <> b.${name} OR (SELECT ${fp}) <> b.fp_${name} THEN
    RAISE EXCEPTION 'POSTCONDITION: dados de ${name} alterados';
  END IF;`).join('\n')}
  IF (SELECT count(*) FROM "materials") <> ${summary.total} THEN
    RAISE EXCEPTION 'POSTCONDITION: materials deveria ter ${summary.total} linhas';
  END IF;
  IF (SELECT count(*) FROM "materials" WHERE "status" = 'PUBLISHED') <> ${summary.published.length} THEN
    RAISE EXCEPTION 'POSTCONDITION: deveriam existir ${summary.published.length} materiais PUBLISHED';
  END IF;
  IF (SELECT string_agg("id", ',' ORDER BY "id") FROM "materials" WHERE "status" = 'DRAFT') IS DISTINCT FROM ${literal(summary.draft.join(','))} THEN
    RAISE EXCEPTION 'POSTCONDITION: somente ${draft} deveria estar em DRAFT';
  END IF;
  IF EXISTS (SELECT 1 FROM "material_assets") THEN
    RAISE EXCEPTION 'POSTCONDITION: material_assets deveria estar vazia';
  END IF;
  IF EXISTS (
  ${divergence()}
  ) THEN
    RAISE EXCEPTION 'POSTCONDITION: valores importados divergem do catálogo (verificar codificação UTF-8)';
  END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.materials'::regclass, 'public.material_assets'::regclass)
      AND contype IN ('p', 'f', 'c')) <> 10 THEN
    RAISE EXCEPTION 'POSTCONDITION: esperadas 10 restrições (2 PK, 1 FK, 7 CHECK)';
  END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('materials', 'material_assets')) <> 7 THEN
    RAISE EXCEPTION 'POSTCONDITION: esperados 7 índices';
  END IF;
${enumCheck}
END
$post$;

COMMIT;
`;
}

function buildVerification() {
  const summary = importSummary();
  return `${header('05 — TRAVA OPERACIONAL: verificação de materiais (SOMENTE LEITURA)', [
    'Rodar logo após o 04 e ANTES de definir MATERIALS_PERSISTENCE=enabled em qualquer ambiente.',
    'Termina em ROLLBACK e não grava nada. Se o bloco final levantar exceção (psql com',
    'ON_ERROR_STOP sai com erro), NÃO ligar a persistência: a vitrine ficaria incompleta.',
    `Esperado: ${summary.total} materiais, ${summary.published.length} PUBLISHED, ${summary.draft.length} DRAFT (${summary.draft.join(', ')}),`,
    'seção 3 sem linhas, material_assets vazia.',
    'Atenção: depois que o admin editar materiais, a seção 3 passa a mostrar as edições.',
    'Este arquivo serve como trava da ativação, não como auditoria permanente.',
    '  psql "<conexão>" -v ON_ERROR_STOP=1 -f 05-materials-verificacao-somente-leitura.sql -o resultados/05-<ambiente>.txt',
  ])}
SET client_encoding = 'UTF8';
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

-- 1. Objetos de materiais
SELECT to_regclass('public.materials') IS NOT NULL AS materials_existe,
       to_regclass('public.material_assets') IS NOT NULL AS material_assets_existe;

-- 2. Contagem por status (esperado: PUBLISHED ${summary.published.length}, DRAFT ${summary.draft.length})
SELECT "status"::text AS status, count(*) AS total FROM "materials" GROUP BY 1 ORDER BY 1;

-- 3a. No catálogo, mas ausente ou diferente no banco (esperado: nenhuma linha)
SELECT 'catalogo' AS origem, * FROM (
  ${missingInDb()}
) AS divergencias ORDER BY "id";

-- 3b. No banco, mas ausente ou diferente no catálogo (esperado: nenhuma linha)
SELECT 'banco' AS origem, * FROM (
  ${extraInDb()}
) AS divergencias ORDER BY "id";

-- 4. Arquivos privados (esperado: 0 antes de existir armazenamento)
SELECT count(*) AS material_assets FROM "material_assets";

-- 5. Trava: qualquer divergência interrompe com erro
DO $gate$
DECLARE
  label constant text := 'TRAVA';
BEGIN
  IF (SELECT count(*) FROM "materials") <> ${summary.total}
     OR (SELECT count(*) FROM "materials" WHERE "status" = 'PUBLISHED') <> ${summary.published.length} THEN
    RAISE EXCEPTION 'TRAVA: contagens de materiais divergentes — NÃO ligar MATERIALS_PERSISTENCE';
  END IF;
  IF EXISTS (
  ${divergence()}
  ) THEN
    RAISE EXCEPTION 'TRAVA: materiais divergem do catálogo — NÃO ligar MATERIALS_PERSISTENCE';
  END IF;
${enumCheck}
END
$gate$;

ROLLBACK;
`;
}

function buildRollback() {
  return `${header('91 — REVERSÃO DE EMERGÊNCIA: materiais (EXIGE AUTORIZAÇÃO)', [
    'Remove EXCLUSIVAMENTE os objetos criados pelo 04 (materials, material_assets e seus enums).',
    'Ordem obrigatória antes de rodar:',
    '  1) remover MATERIALS_PERSISTENCE da Vercel e fazer redeploy (o site volta ao catálogo estático);',
    '  2) confirmar que nenhuma instância ainda usa as tabelas.',
    'Aborta se existir qualquer arquivo em material_assets ou se os materiais não forem EXATAMENTE',
    'os 15 importados pelo 04, sem edições. Havendo edições do admin, o caminho é backup/PITR',
    'numa branch nova — nunca editar estas guardas para forçar a execução.',
    'Não toca users, auth_*, plans, subscriptions, payments ou lessons.',
    '  psql "<conexão DIRETA>" -v ON_ERROR_STOP=1 -f 91-materials-reversao.sql',
  ])}
SET client_encoding = 'UTF8';
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;
SELECT pg_advisory_xact_lock(${LOCK});

DO $exists$
BEGIN
  IF to_regclass('public.materials') IS NULL OR to_regclass('public.material_assets') IS NULL THEN
    RAISE EXCEPTION 'GUARD: tabelas de materiais ausentes — estado inesperado, analisar manualmente';
  END IF;
END
$exists$;

-- Impede escritas concorrentes entre a guarda e a remoção.
LOCK TABLE "materials", "material_assets" IN ACCESS EXCLUSIVE MODE;

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "material_assets") THEN
    RAISE EXCEPTION 'GUARD: existem arquivos em material_assets — usar backup/PITR';
  END IF;
  IF (SELECT count(*) FROM "materials") <> ${records().length} OR EXISTS (
  ${divergence()}
  ) THEN
    RAISE EXCEPTION 'GUARD: materiais editados ou adicionados após o 04 — usar backup/PITR';
  END IF;
END
$guard$;

DROP TABLE "material_assets";
DROP TABLE "materials";
DROP TYPE "MaterialAssetStatus";
DROP TYPE "MaterialStatus";

DO $post$
BEGIN
  IF to_regclass('public.materials') IS NOT NULL OR to_regclass('public.material_assets') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_type WHERE typname IN ('MaterialStatus', 'MaterialAssetStatus') AND typnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'POSTCONDITION: objetos de materiais ainda presentes';
  END IF;
END
$post$;

COMMIT;
`;
}

function build() {
  return { [FILES.migration]: buildMigration(), [FILES.verification]: buildVerification(), [FILES.rollback]: buildRollback() };
}

module.exports = { build, literal, tuple, proposalDdl, FILES, COLUMNS };

if (require.main === module) {
  const output = build();
  if (process.argv.includes('--write')) {
    for (const [name, sql] of Object.entries(output)) fs.writeFileSync(path.join(directory, name), sql);
    console.log(`Gerados: ${Object.keys(output).join(', ')}`);
  } else {
    const stale = Object.entries(output).filter(([name, sql]) => {
      const file = path.join(directory, name);
      return !fs.existsSync(file) || fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== sql;
    }).map(([name]) => name);
    if (stale.length) { console.error(`Desatualizados: ${stale.join(', ')}`); process.exitCode = 1; }
    else console.log('SQL de materiais em dia com o catálogo.');
  }
}
