/* global describe it before */

const assert = require('chai').assert;
require('../../general.js');

const db = require('../../general.js').db;
const message = require('../../general.js').message;

const { getRepository } = require('typeorm');
const { User } = require('../../../dest/database/entity/user');
const { Settings } = require('../../../dest/database/entity/settings');

// users
const owner = { username: 'soge__' };
const testuser = { username: 'testuser', userId: '1' };
const testuser2 = { username: 'testuser2', userId: '2' };
const testuser3 = { username: 'testuser3', userId: '3' };
const nightbot = { username: 'nightbot', userId: '4' };
const botwithchangedname = { username: 'asdsadas', userId: '24900234' };

const commons = require('../../../dest/commons');
const { VariableWatcher } = require('../../../dest/watchers');

describe('TMI - ignore', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();

    global.tmi.globalIgnoreListExclude = [];
    global.tmi.ignorelist = [];

    await getRepository(User).save(testuser);
    await getRepository(User).save(testuser2);
    await getRepository(User).save(testuser3);
  });

  beforeEach(async () => {
    await VariableWatcher.check();
  });

  describe('Global ignore workflow', () => {
    it ('nightbot should be ignored by default', async () => {
      assert.isTrue(await commons.isIgnored(nightbot)); // checked by known_alias
    });

    it ('botwithchangedname should be ignored by default', async () => {
      assert.isTrue(await commons.isIgnored(botwithchangedname)); // checked by id
    });

    it ('exclude botwithchangedname from ignore list', async () => {
      global.tmi.globalIgnoreListExclude = [botwithchangedname.userId];
    });

    it ('botwithchangedname should not be ignored anymore', async () => {
      assert.isFalse(await commons.isIgnored(botwithchangedname)); // checked by id
    });
  });

  describe('Ignore workflow', () => {
    it('testuser is not ignored by default', async () => {
      assert.isFalse(await commons.isIgnored(testuser));
    });

    it('add testuser to ignore list', async () => {
      global.tmi.ignoreAdd({ sender: owner, parameters: 'testuser' });
      await message.isSent('ignore.user.is.added', owner, testuser);
    });

    it('add @testuser2 to ignore list', async () => {
      global.tmi.ignoreAdd({ sender: owner, parameters: '@testuser2' });
      await message.isSent('ignore.user.is.added', owner, testuser2);
    });

    it('testuser should be in ignore list', async () => {
      global.tmi.ignoreCheck({ sender: owner, parameters: 'testuser' });

      const item = await getRepository(Settings).findOne({
        where: {
          namespace: '/core/tmi',
          name: 'ignorelist',
        },
      });

      await message.isSent('ignore.user.is.ignored', owner, testuser);
      assert.isTrue(await commons.isIgnored(testuser));
      assert.isTrue(typeof item !== 'undefined');
      assert.include(item.value, 'testuser');
    });

    it('@testuser2 should be in ignore list', async () => {
      global.tmi.ignoreCheck({ sender: owner, parameters: '@testuser2' });
      const item = await getRepository(Settings).findOne({
        where: {
          namespace: '/core/tmi',
          name: 'ignorelist',
        },
      });

      await message.isSent('ignore.user.is.ignored', owner, testuser2);
      assert.isTrue(await commons.isIgnored(testuser2));
      assert.isTrue(typeof item !== 'undefined');
      assert.include(item.value, 'testuser2');
    });

    it('testuser3 should not be in ignore list', async () => {
      global.tmi.ignoreCheck({ sender: owner, parameters: 'testuser3' });
      const item = await getRepository(Settings).findOne({
        where: {
          namespace: '/core/tmi',
          name: 'ignorelist',
        },
      });

      await message.isSent('ignore.user.is.not.ignored', owner, testuser3);
      assert.isFalse(await commons.isIgnored(testuser3));
      assert.isTrue(typeof item !== 'undefined');
      assert.notInclude(item.value, 'testuser3');

    });

    it('remove testuser from ignore list', async () => {
      global.tmi.ignoreRm({ sender: owner, parameters: 'testuser' });
      await message.isSent('ignore.user.is.removed', owner, testuser);
    });

    it('testuser should not be in ignore list', async () => {
      global.tmi.ignoreCheck({ sender: owner, parameters: 'testuser' });
      await message.isSent('ignore.user.is.not.ignored', owner, testuser);
      assert.isFalse(await commons.isIgnored(testuser));
    });

    it('add testuser by id to ignore list', async () => {
      global.tmi.ignorelist = [ testuser.userId ];
    });

    it('user should be ignored by id', async () => {
      assert.isTrue(await commons.isIgnored(testuser));
    });
  });
});
