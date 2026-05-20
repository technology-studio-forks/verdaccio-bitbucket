/**
 * End-to-end tests that hit the real Bitbucket Cloud API.
 *
 * Required env vars (suite is skipped if any are missing):
 *   BITBUCKET_USERNAME            Verdaccio login string. Either the short
 *                                  user name (when BITBUCKET_DEFAULT_MAIL_DOMAIN
 *                                  is set) or a `user..domain.tld`-encoded
 *                                  email.
 *   BITBUCKET_PASSWORD            API token (or App Password) for that user.
 *   BITBUCKET_WORKSPACE           A workspace slug the user is a member of.
 *
 * Optional:
 *   BITBUCKET_DEFAULT_MAIL_DOMAIN Appended to BITBUCKET_USERNAME if it does
 *                                  not contain `..`.
 */

const Auth = require('../..');
const Bitbucket = require('../../models/Bitbucket');

const {
  BITBUCKET_USERNAME,
  BITBUCKET_PASSWORD,
  BITBUCKET_WORKSPACE,
  BITBUCKET_DEFAULT_MAIL_DOMAIN,
} = process.env;

// Public Atlassian workspace — used as a workspace the authenticating user is
// almost certainly NOT a member of. If you happen to be an Atlassian employee
// running these tests, edit this constant.
const FOREIGN_WORKSPACE = 'atlassian';

const REQUIRED_VARS = ['BITBUCKET_USERNAME', 'BITBUCKET_PASSWORD', 'BITBUCKET_WORKSPACE'];
const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

if (missing.length) {
  const lines = [
    '',
    '  Bitbucket e2e suite SKIPPED — missing env vars:',
    ...missing.map((name) => `    - ${name}`),
    '',
    '  To run the e2e suite, set:',
    '    BITBUCKET_USERNAME=<verdaccio-login-name>      # e.g. john.doe (or john.doe..example.com)',
    '    BITBUCKET_PASSWORD=<atlassian-api-token>       # scopes: read:user:bitbucket, read:workspace:bitbucket',
    '    BITBUCKET_WORKSPACE=<slug-user-is-member-of>   # e.g. acme-corp',
    '    BITBUCKET_DEFAULT_MAIL_DOMAIN=<email-domain>   # optional, e.g. example.com',
    '',
    '  Generate an API token at:',
    '    https://id.atlassian.com/manage-profile/security/api-tokens',
    '',
    '',
  ];
  process.stdout.write(`${lines.join('\n')}`);
}

const d = missing.length ? describe.skip : describe;

const silentLogger = { debug: () => {}, warn: () => {} };

function authenticate(auth, username, password) {
  return new Promise((resolve) => {
    auth.authenticate(username, password, (err, teams) => resolve({ err, teams }));
  });
}

function makeAuth(allow) {
  const config = { allow };
  if (BITBUCKET_DEFAULT_MAIL_DOMAIN) config.defaultMailDomain = BITBUCKET_DEFAULT_MAIL_DOMAIN;
  return new Auth(config, { logger: silentLogger });
}

d('Bitbucket auth e2e', () => {
  jest.setTimeout(30000);

  let discoveredRole;

  beforeAll(async () => {
    const auth = makeAuth(BITBUCKET_WORKSPACE);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    if (err) throw new Error(`pre-flight auth failed: ${err.message || err}`);
    if (!teams.includes(BITBUCKET_WORKSPACE)) {
      throw new Error(`pre-flight: expected user to be a member of ${BITBUCKET_WORKSPACE}`);
    }
    const bb = new Bitbucket(
      auth.decodeUsernameToEmail(BITBUCKET_USERNAME),
      BITBUCKET_PASSWORD,
      silentLogger,
    );
    const user = await bb.getUser();
    discoveredRole = await bb.getWorkspacePermission(BITBUCKET_WORKSPACE, user.uuid);
    if (!discoveredRole) throw new Error('pre-flight: could not discover user role');
  });

  it('grants the workspace when membership matches (no role restriction)', async () => {
    const auth = makeAuth(BITBUCKET_WORKSPACE);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    expect(err).toBeNull();
    expect(teams).toEqual([BITBUCKET_WORKSPACE]);
  });

  it('grants the workspace when the role restriction matches the user role', async () => {
    const auth = makeAuth(`${BITBUCKET_WORKSPACE}(${discoveredRole})`);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    expect(err).toBeNull();
    expect(teams).toEqual([BITBUCKET_WORKSPACE]);
  });

  it('denies access when the role restriction excludes the user role', async () => {
    const otherRoles = ['owner', 'collaborator', 'member'].filter((r) => r !== discoveredRole);
    const auth = makeAuth(`${BITBUCKET_WORKSPACE}(${otherRoles.join('|')})`);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    expect(err).toBeNull();
    expect(teams).toEqual([]);
  });

  it('returns an empty team list for a workspace that does not exist', async () => {
    const auth = makeAuth(`${BITBUCKET_WORKSPACE}, nonexistent-workspace-${Date.now()}`);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    expect(err).toBeNull();
    expect(teams).toEqual([BITBUCKET_WORKSPACE]);
  });

  it('returns an empty team list when the user is not a member of an allow-listed workspace', async () => {
    const auth = makeAuth(FOREIGN_WORKSPACE);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, BITBUCKET_PASSWORD);
    expect(err).toBeNull();
    expect(teams).toEqual([]);
  });

  it('rejects invalid credentials', async () => {
    const auth = makeAuth(BITBUCKET_WORKSPACE);
    const { err, teams } = await authenticate(auth, BITBUCKET_USERNAME, 'definitely-not-a-valid-token');
    expect(err).toBeTruthy();
    expect(teams).toBe(false);
  });
});
