/* global */
require('../../general.js');

const assert = require('assert');

const owner = { userId: String(Math.floor(Math.random() * 100000)), userName: '__broadcaster__' };
const ignoredUser = { userId: String(Math.floor(Math.random() * 100000)), userName: 'ignoreduser' };
const user = { userId: String(Math.floor(Math.random() * 100000)), userName: 'user1' };

const { getRepository } = require('typeorm');

const { User } = require('../../../dest/database/entity/user');
const { prepare } = require('../../../dest/helpers/commons/prepare');
const Message = require('../../../dest/message').default;
const db = require('../../general.js').db;
const msg = require('../../general.js').message;

async function setUsersOnline(users) {
  await getRepository(User).update({}, { isOnline: false });
  for (const userName of users) {
    await getRepository(User).update({ userName }, { isOnline: true });
  }
}

let twitch;
describe('Message - random filter - @func3', () => {
  before(() => {
    twitch = require('../../../dest/services/twitch.js').default;
  });
  describe('(random.online.viewer) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });

    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));
    });

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        await setUsersOnline(['ignoreduser', 'user1']);
        const message = await new Message('(random.online.viewer)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });

  describe('(random.online.follower) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });
    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));

    });

    const users = ['ignoreduser', 'user1'];
    for (const userName of users) {
      it('add user ' + userName + ' to users list', async () => {
        await getRepository(User).save({ userId: String(Math.floor(Math.random() * 100000)), userName, isFollower: true });
      });
    }

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        await setUsersOnline(['ignoreduser', 'user1']);
        const message = await new Message('(random.online.follower)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });

  describe('(random.online.subscriber) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });
    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));
    });

    const users = ['ignoreduser', 'user1'];
    for (const userName of users) {
      it('add user ' + userName + ' to users list', async () => {
        await getRepository(User).save({ userId: String(Math.floor(Math.random() * 100000)), userName, isSubscriber: true });
      });
    }

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        await setUsersOnline(['ignoreduser', 'user1']);
        const message = await new Message('(random.online.subscriber)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });

  describe('(random.viewer) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });

    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));
    });

    const users = ['ignoreduser', 'user1'];
    for (const userName of users) {
      it('add user ' + userName + ' to users list', async () => {
        await getRepository(User).save({ userId: String(Math.floor(Math.random() * 100000)), userName });
      });
    }

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        const message = await new Message('(random.viewer)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });

  describe('(random.follower) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });
    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));
    });

    const users = ['ignoreduser', 'user1'];
    for (const userName of users) {
      it('add user ' + userName + ' to users list', async () => {
        await getRepository(User).save({ userId: String(Math.floor(Math.random() * 100000)), userName, isFollower: true });
      });
    }

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        const message = await new Message('(random.follower)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });

  describe('(random.subscriber) should exclude ignored user', () => {
    before(async () => {
      await db.cleanup();
      await msg.prepare();

      await getRepository(User).save(owner);
      await getRepository(User).save(ignoredUser);
      await getRepository(User).save(user);

      const r = await twitch.ignoreRm({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.removed', { userName: 'ignoreduser' }));
    });
    it('add user ignoreduser to ignore list', async () => {
      const r = await twitch.ignoreAdd({ sender: owner, parameters: 'ignoreduser' });
      assert.strictEqual(r[0].response, prepare('ignore.user.is.added', { userName: 'ignoreduser' }));
    });

    const users = ['ignoreduser', 'user1'];
    for (const userName of users) {
      it('add user ' + userName + ' to users list', async () => {
        await getRepository(User).save({ userId: String(Math.floor(Math.random() * 100000)), userName, isSubscriber: true });
      });
    }

    it('From 100 randoms ignoreduser shouldn\'t be picked', async () => {
      for (let i = 0; i < 100; i++) {
        const message = await new Message('(random.subscriber)').parse({ sender: owner });
        assert.notEqual(message, 'ignoreduser');
      }
    });
  });
});
