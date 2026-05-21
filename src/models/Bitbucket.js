const axios = require('axios');

const API_URL = 'https://api.bitbucket.org';
const API_VERSION = '2.0';

function Bitbucket(username, password, logger) {
  this.apiUrl = `${API_URL}/${API_VERSION}`;
  this.username = username;
  this.password = password;
  this.logger = logger;
}

Bitbucket.prototype.getUser = function getUser() {
  const { username, password, apiUrl } = this;
  return axios({
    method: 'get',
    url: `${apiUrl}/user`,
    auth: { username, password },
  }).then((response) => response.data);
};

Bitbucket.prototype.getWorkspacePermission = function getWorkspacePermission(workspace, uuid) {
  const { username, password, apiUrl } = this;
  const auth = { username, password };
  const base = `${apiUrl}/workspaces/${encodeURIComponent(workspace)}`;
  this.logger.debug(`[bitbucket] checking ${username} membership in ${workspace}`);

  // /permissions only contains rows for users with an elevated role (owner /
  // collaborator). Plain members are absent from /permissions but visible in
  // /members, so we have to check both to mirror what the old /workspaces?role
  // listing returned.
  const ignoreMissing = (err) => {
    const status = err.response && err.response.status;
    if (status === 403 || status === 404) return null;
    throw err;
  };

  const memberCheck = axios({
    method: 'get',
    url: `${base}/members/${encodeURIComponent(uuid)}`,
    auth,
  }).then(() => true).catch(ignoreMissing);

  const roleLookup = axios({
    method: 'get',
    url: `${base}/permissions`,
    params: { q: `user.uuid="${uuid}"` },
    auth,
  }).then((response) => {
    const [first] = response.data.values || [];
    return first ? first.permission : null;
  }).catch(ignoreMissing);

  return Promise.all([memberCheck, roleLookup]).then(([isMember, role]) => {
    if (!isMember) return null;
    return role || 'member';
  });
};

Bitbucket.prototype.getPrivileges = function getPrivileges(workspaces) {
  return this.getUser().then((user) => Promise.all(
    workspaces.map((slug) => this.getWorkspacePermission(slug, user.uuid)
      .then((permission) => ({ slug, permission }))),
  )).then((results) => {
    const teams = {};
    results.forEach(({ slug, permission }) => {
      if (permission) teams[slug] = permission;
    });
    return { teams };
  });
};

module.exports = Bitbucket;
