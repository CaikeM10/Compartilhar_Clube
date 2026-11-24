// Shared by the schema integrity guards (not a test file). The admin user-management additions are authorized only
// in the exact form of prisma/proposals/admin-users.prisma: they are removed here and the remainder must still match
// the original schema hash.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ANCHOR = '  disabledAt    DateTime?\n';

function readProposal() {
  const proposal = fs.readFileSync(path.join(root, 'prisma/proposals/admin-users.prisma'), 'utf8').replace(/\r\n/g, '\n');
  const fieldsAt = proposal.indexOf('// @user-fields');
  const modelsAt = proposal.indexOf('// @models');
  if (fieldsAt < 0 || modelsAt < fieldsAt) throw new Error('ADMIN_USERS_PROPOSAL_MALFORMED');
  const fields = proposal.slice(proposal.indexOf('\n', fieldsAt) + 1, modelsAt);
  const models = proposal.slice(proposal.indexOf('\n', modelsAt) + 1);
  return { fields, models };
}

const count = (text, part) => text.split(part).length - 1;

/** Returns the schema text without the authorized additions; throws if they differ from the proposal in any way. */
function stripAdminUsersSchema(source) {
  const { fields, models } = readProposal();
  if (count(source, ANCHOR + fields) !== 1) throw new Error('Admin user fields in model User differ from the reviewed proposal');
  if (count(source, '\n' + models) !== 1) throw new Error('Admin audit models differ from the reviewed proposal');
  return source.replace(ANCHOR + fields, ANCHOR).replace('\n' + models, '');
}

module.exports = { stripAdminUsersSchema, readProposal };
