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
  const url = `${apiUrl}/workspaces/${encodeURIComponent(workspace)}/permissions`;
  this.logger.debug(`[bitbucket] checking ${username} membership in ${workspace}`);

  return axios({
    method: 'get',
    url,
    params: { q: `user.uuid="${uuid}"` },
    auth: { username, password },
  }).then((response) => {
    const [first] = response.data.values || [];
    return first ? first.permission : null;
  }).catch((err) => {
    const status = err.response && err.response.status;
    if (status === 403 || status === 404) return null;
    throw err;
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
