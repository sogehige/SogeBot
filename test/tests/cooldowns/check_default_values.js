/* eslint-disable @typescript-eslint/no-var-requires */
/* global describe it before */


require('../../general.js');

const { getRepository } = require('typeorm');
const { Cooldown, CooldownViewer } = require('../../../dest/database/entity/cooldown');
const { User } = require('../../../dest/database/entity/user');
const { Keyword } = require('../../../dest/database/entity/keyword');

const assert = require('assert');

const db = require('../../general.js').db;
const message = require('../../general.js').message;
const time = require('../../general.js').time;

const cooldown = (require('../../../dest/systems/cooldown')).default;
const customcommands = (require('../../../dest/systems/customcommands')).default;
const gamble = (require('../../../dest/games/gamble')).default;

// users
const owner = { userId: Math.floor(Math.random() * 100000), username: 'soge__', badges: {} };
const usermod1 = { userId: Math.floor(Math.random() * 100000), username: 'usermod1', badges: { moderator: 1 } };
const subuser1 = { userId: Math.floor(Math.random() * 100000), username: 'subuser1', badges: { subscriber: 1 } };
const testUser = { userId: Math.floor(Math.random() * 100000), username: 'test', badges: {} };
const testUser2 = { userId: Math.floor(Math.random() * 100000), username: 'test2', badges: {} };


describe('Cooldowns - default check', () => {
  describe('command - default', async () => {
    before(async () => {
      await db.cleanup();
      await message.prepare();

      gamble.enabled = true;
      cooldown.defaultCooldownOfCommandsInSeconds = 5;

      await getRepository(User).save({ username: usermod1.username, userId: usermod1.userId, isModerator: true });
      await getRepository(User).save({ username: subuser1.username, userId: subuser1.userId, isSubscriber: true });
      await getRepository(User).save({ username: testUser.username, userId: testUser.userId });
      await getRepository(User).save({ username: testUser2.username, userId: testUser2.userId });
      await getRepository(User).save({ username: owner.username, userId: owner.userId, isSubscriber: true });
    });

    after(() => {
      gamble.enabled = false;
      cooldown.defaultCooldownOfCommandsInSeconds = 0;
    });

    it('testuser should not be affected by cooldown', async () => {
      const isOk = await cooldown.check({ sender: testUser, message: '!test 10' });
      assert(isOk);
    });

    it('testuser should be affected by cooldown second time', async () => {
      const isOk = await cooldown.check({ sender: testUser, message: '!test 15' });
      assert(!isOk);
    });

    it('wait 2 seconds', async () => {
      await time.waitMs(2000);
    });

    it('testuser2 should be affected by cooldown', async () => {
      const isOk = await cooldown.check({ sender: testUser2, message: '!test 25' });
      assert(!isOk);
    });

    it('subuser1 should NOT be affected by cooldown as it is different permGroup', async () => {
      const isOk = await cooldown.check({ sender: subuser1, message: '!test 25' });
      assert(isOk);
    });

    it('wait 4 seconds', async () => {
      await time.waitMs(4000);
    });

    it('testuser2 should not be affected by cooldown second time', async () => {
      const isOk = await cooldown.check({ sender: testUser2, message: '!test 15' });
      assert(isOk);
    });
  });

  describe('keyword - default', async () => {
    before(async () => {
      await db.cleanup();
      await message.prepare();

      gamble.enabled = true;
      cooldown.defaultCooldownOfKeywordsInSeconds = 5;

      await getRepository(User).save({ username: usermod1.username, userId: usermod1.userId, isModerator: true });
      await getRepository(User).save({ username: subuser1.username, userId: subuser1.userId, isSubscriber: true });
      await getRepository(User).save({ username: testUser.username, userId: testUser.userId });
      await getRepository(User).save({ username: testUser2.username, userId: testUser2.userId });
      await getRepository(User).save({ username: owner.username, userId: owner.userId, isSubscriber: true });
    });

    after(() => {
      gamble.enabled = false;
      cooldown.defaultCooldownOfKeywordsInSeconds = 0;
    });

    it('test', async () => {
      await getRepository(Keyword).save({
        keyword: 'me',
        response: '(!me)',
        enabled: true,
      });

      let isOk = await cooldown.check({ sender: testUser, message: 'me' });
      assert(isOk);

      isOk = await cooldown.check({ sender: testUser, message: 'me' });
      assert(!isOk); // second should fail

      isOk = await cooldown.check({ sender: subuser1, message: 'me' });
      assert(isOk); // another perm group should not fail

      await time.waitMs(2000);

      isOk = await cooldown.check({ sender: testUser2, message: 'me' });
      assert(!isOk); // another user should fail as well

      await time.waitMs(4000);

      isOk = await cooldown.check({ sender: testUser2, message: 'me' });
      assert(isOk);

    });
  });
});
