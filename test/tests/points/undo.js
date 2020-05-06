/* eslint-disable @typescript-eslint/no-var-requires */
/* global describe it before */

require('../../general.js');

const db = require('../../general.js').db;
const message = require('../../general.js').message;
const _ = require('lodash');
const assert = require('assert');

const { getRepository } = require('typeorm');
const { User } = require('../../../dest/database/entity/user');
const { PointsChangelog } = require('../../../dest/database/entity/points');

const points = (require('../../../dest/systems/points')).default;

const user = { username: 'oneuser', userId: Number(_.random(999999, false)) };

describe('Points - undo()', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();
  });

  describe('!point add command should be undoable', () => {
    it('create user', async () => {
      await getRepository(User).save({ username: user.username, userId: user.userId, points: 150 });
    });

    it('!points add 100', async () => {
      const r = await points.add({ sender: user, parameters: user.username + ' 100' });
      assert.strictEqual(r[0].response, '@oneuser just received 100 points!');
    });

    it('User should have correctly added 100 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 250);
    });

    it('Changelog should have 150 -> 250 log', async () => {
      const changelog = await getRepository(PointsChangelog).findOne({ userId: user.userId });
      assert(typeof changelog !== 'undefined');
      assert.strictEqual(changelog.originalValue, 150);
      assert.strictEqual(changelog.updatedValue, 250);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, points \'add\' for @oneuser was reverted (250 points to 150 points).');
    });

    it('User should have correctly set 150 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 150);
    });

    it('Changelog should be empty', async () => {
      const changelog = await getRepository(PointsChangelog).find();
      assert.strictEqual(changelog.length, 0);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, username wasn\'t found in database or user have no undo operations');
    });
  });

  describe('!point set command should be undoable', () => {
    it('create user', async () => {
      await getRepository(User).save({ username: user.username, userId: user.userId, points: 0 });
    });

    it('!points set 100', async () => {
      const r = await points.set({ sender: user, parameters: user.username + ' 100' });
      assert.strictEqual(r[0].response, '@oneuser was set to 100 points');
    });

    it('User should have correctly set 100 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 100);
    });

    it('Changelog should have 0 -> 100 log', async () => {
      const changelog = await getRepository(PointsChangelog).findOne({ userId: user.userId });
      assert(typeof changelog !== 'undefined');
      assert.strictEqual(changelog.originalValue, 0);
      assert.strictEqual(changelog.updatedValue, 100);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, points \'set\' for @oneuser was reverted (100 points to 0 points).');
    });

    it('User should have correctly set 0 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 0);
    });

    it('Changelog should be empty', async () => {
      const changelog = await getRepository(PointsChangelog).find();
      assert.strictEqual(changelog.length, 0);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, username wasn\'t found in database or user have no undo operations');
    });
  });

  describe('!point remove command should be undoable', () => {
    it('create user', async () => {
      await getRepository(User).save({ username: user.username, userId: user.userId, points: 100 });
    });

    it('!points remove 25', async () => {
      const r = await points.remove({ sender: user, parameters: user.username + ' 25' });
      assert.strictEqual(r[0].response, 'Ouch, 25 points was removed from @oneuser!');
    });

    it('User should have 75 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 75);
    });

    it('Changelog should have 100 -> 75 log', async () => {
      const changelog = await getRepository(PointsChangelog).findOne({ where: { userId: user.userId }, order: { updatedAt: 'DESC' }});
      assert(typeof changelog !== 'undefined');
      assert.strictEqual(changelog.originalValue, 100);
      assert.strictEqual(changelog.updatedValue, 75);
    });

    it('!points remove all', async () => {
      const r = await points.remove({ sender: user, parameters: user.username + ' all' });
      assert.strictEqual(r[0].response, 'Ouch, all points was removed from @oneuser!');
    });

    it('User should have 0 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 0);
    });

    it('Changelog should have 75 -> 0 log', async () => {
      const changelog = await getRepository(PointsChangelog).findOne({ where: { userId: user.userId }, order: { updatedAt: 'DESC' }});
      assert(typeof changelog !== 'undefined');
      assert.strictEqual(changelog.originalValue, 75);
      assert.strictEqual(changelog.updatedValue, 0);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, points \'remove\' for @oneuser was reverted (0 points to 75 points).');
    });

    it('User should have correctly set 75 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 75);
    });

    it('Changelog should have one change', async () => {
      const changelog = await getRepository(PointsChangelog).find();
      assert.strictEqual(changelog.length, 1);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, points \'remove\' for @oneuser was reverted (75 points to 100 points).');
    });

    it('User should have correctly set 100 points', async () => {
      const updatedUser = await getRepository(User).findOne({ username: user.username });
      assert.strictEqual(updatedUser.points, 100);
    });

    it('Changelog should be empty', async () => {
      const changelog = await getRepository(PointsChangelog).find();
      assert.strictEqual(changelog.length, 0);
    });

    it('!points undo ' + user.username, async () => {
      const r = await points.undo({ sender: user, parameters: user.username });
      assert.strictEqual(r[0].response, '$sender, username wasn\'t found in database or user have no undo operations');
    });
  });
});
