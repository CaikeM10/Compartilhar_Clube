// Shared by the schema integrity guards (not a test file). The manual access additions are authorized only in the
// exact form of prisma/proposals/manual-access.prisma: they are removed here (before the admin user-management
// additions, see tests/admin-users-schema.cjs) and the remainder must still match the original schema hash.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ANCHOR = '  adminAuditTargets  AdminAuditEvent[] @relation("AdminAuditTarget")\n';

function readManualAccessProposal() {
  const proposal = fs.readFileSync(path.join(root, 'prisma/proposals/manual-access.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const fieldsAt = proposal.indexOf('// @user-fields');
  const modelsAt = proposal.indexOf('// @models');
  if (fieldsAt < 0 || modelsAt < fieldsAt) throw new Error('MANUAL_ACCESS_PROPOSAL_MALFORMED');
  const fields = proposal.slice(proposal.indexOf('\n', fieldsAt) + 1, modelsAt);
  const models = proposal.slice(proposal.indexOf('\n', modelsAt) + 1);
  return { fields, models };
}

const count = (text, part) => text.split(part).length - 1;

/** Returns the schema text without the manual access additions; throws if they differ from the proposal in any way. */
function stripManualAccessSchema(source) {
  const { fields, models } = readManualAccessProposal();
  if (count(source, ANCHOR + fields) !== 1) throw new Error('Manual access fields in model User differ from the reviewed proposal');
  if (count(source, '\n' + models) !== 1) throw new Error('Manual access models differ from the reviewed proposal');
  return source.replace(ANCHOR + fields, ANCHOR).replace('\n' + models, '');
}

module.exports = { stripManualAccessSchema, readManualAccessProposal };
