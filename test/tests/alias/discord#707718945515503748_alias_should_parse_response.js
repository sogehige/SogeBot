/* global describe it */
require('../../general.js');

const db = require('../../general.js').db;
const message = require('../../general.js').message;
const user = require('../../general.js').user;
const alias = (require('../../../dest/systems/alias')).default;
const api = (require('../../../dest/api')).default;
const assert = require('assert');
const { prepare } = (require('../../../dest/commons'));

// users
const owner = { username: 'soge__' };

describe('Alias - discord#707718945515503748 - alias should parse response', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();
  });

  it('create alias !test for command !uptime', async () => {
    const r = await alias.add({ sender: owner, parameters: '-a !test -c !uptime' });
    assert.strictEqual(r[0].response, prepare('alias.alias-was-added', { alias: '!test', command: '!uptime' }));
  });

  it('alias should return correct offline message', async () => {
    api.streamStatusChangeSince = Date.now();
    await alias.run({ sender: user.viewer, message: '!test' });
    await message.debug('sendMessage.message', [
      'Stream is currently offline for 0s',
      'Stream is currently offline for 1s',
      'Stream is currently offline for 2s',
      'Stream is currently offline for 3s',
      'Stream is currently offline for 4s',
      'Stream is currently offline for 5s',
      'Stream is currently offline for 6s',
      'Stream is currently offline for 7s',
      'Stream is currently offline for 8s',
      'Stream is currently offline for 9s',
      'Stream is currently offline for 10s',
    ]);
  });
});
