const moxios = require('moxios');

const Bitbucket = require('../models/Bitbucket');

const logger = {
  debug: () => {},
  warn: () => {},
};

const PERMISSIONS_URL = /^https:\/\/api\.bitbucket\.org\/2\.0\/workspaces\/foo\/permissions(\?.*)?$/;

describe('Bitbucket', () => {
  beforeEach(() => {
    moxios.install();
  });
  afterEach(() => {
    moxios.uninstall();
  });

  describe('#getUser', () => {
    it('should return the authenticated user payload', () => {
      expect.assertions(1);
      moxios.stubRequest('https://api.bitbucket.org/2.0/user', {
        status: 200,
        response: { uuid: '{abc}', username: 'u' },
      });
      return new Bitbucket('u', 'p', logger).getUser().then((user) => {
        expect(user).toEqual({ uuid: '{abc}', username: 'u' });
      });
    });
  });

  describe('#getWorkspacePermission', () => {
    it('should return the permission string when the user is a member', () => {
      expect.assertions(1);
      moxios.stubRequest(PERMISSIONS_URL, {
        status: 200,
        response: { values: [{ permission: 'owner' }] },
      });
      return new Bitbucket('u', 'p', logger).getWorkspacePermission('foo', '{abc}')
        .then((permission) => {
          expect(permission).toEqual('owner');
        });
    });

    it('should return null when the user is not a member', () => {
      expect.assertions(1);
      moxios.stubRequest(PERMISSIONS_URL, {
        status: 200,
        response: { values: [] },
      });
      return new Bitbucket('u', 'p', logger).getWorkspacePermission('foo', '{abc}')
        .then((permission) => {
          expect(permission).toBeNull();
        });
    });

    it('should return null when the workspace does not exist (404)', () => {
      expect.assertions(1);
      moxios.stubRequest(PERMISSIONS_URL, {
        status: 404,
        response: { type: 'error', error: { message: 'No workspace' } },
      });
      return new Bitbucket('u', 'p', logger).getWorkspacePermission('foo', '{abc}')
        .then((permission) => {
          expect(permission).toBeNull();
        });
    });

    it('should return null when the user has no access to the workspace (403)', () => {
      expect.assertions(1);
      moxios.stubRequest(PERMISSIONS_URL, {
        status: 403,
        response: { type: 'error', error: { message: 'forbidden' } },
      });
      return new Bitbucket('u', 'p', logger).getWorkspacePermission('foo', '{abc}')
        .then((permission) => {
          expect(permission).toBeNull();
        });
    });

    it('should propagate auth errors (401)', () => {
      expect.assertions(1);
      moxios.stubRequest(PERMISSIONS_URL, {
        status: 401,
        response: { type: 'error', error: { message: 'unauthorized' } },
      });
      return new Bitbucket('u', 'p', logger).getWorkspacePermission('foo', '{abc}')
        .catch((err) => {
          expect(err.response.status).toEqual(401);
        });
    });
  });

  describe('#getPrivileges', () => {
    it('should resolve the user uuid then probe each workspace', () => {
      expect.assertions(1);
      const bb = new Bitbucket('u', 'p', logger);
      bb.getUser = () => Promise.resolve({ uuid: '{abc}' });
      bb.getWorkspacePermission = (slug) => {
        if (slug === 'foo') return Promise.resolve('owner');
        if (slug === 'bar') return Promise.resolve('member');
        return Promise.resolve(null);
      };
      return bb.getPrivileges(['foo', 'bar', 'baz']).then((response) => {
        expect(response).toEqual({
          teams: { foo: 'owner', bar: 'member' },
        });
      });
    });

    it('should return an empty teams map when the user is not a member anywhere', () => {
      expect.assertions(1);
      const bb = new Bitbucket('u', 'p', logger);
      bb.getUser = () => Promise.resolve({ uuid: '{abc}' });
      bb.getWorkspacePermission = () => Promise.resolve(null);
      return bb.getPrivileges(['foo', 'bar']).then((response) => {
        expect(response).toEqual({ teams: {} });
      });
    });
  });
});
