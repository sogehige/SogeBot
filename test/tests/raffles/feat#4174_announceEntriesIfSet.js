/* eslint-disable @typescript-eslint/no-var-requires */
/* global describe it before */

require('../../general.js');

const db = require('../../general.js').db;
const message = require('../../general.js').message;
const user = require('../../general.js').user;
const commons = require('../../../dest/commons');

const { getRepository } = require('typeorm');
const { User } = require('../../../dest/database/entity/user');
const { Raffle } = require('../../../dest/database/entity/raffle');

const raffles = (require('../../../dest/systems/raffles')).default;
const api = (require('../../../dest/api')).default;

const assert = require('assert');

describe('Raffles - announce entries if set #4174', () => {
  describe('ticket raffle', () => {
    before(async () => {
      await db.cleanup();
      await message.prepare();
      await user.prepare();
      raffles.announceNewEntries = true;
      raffles.announceNewEntriesBatchTime = 10;
    });

    it('create ticket raffle', async () => {
      raffles.open({ sender: user.owner, parameters: '!winme -min 0 -max 100' });
      await message.isSentRaw('Raffle is running (0 entries). To enter type "!winme <1-100>". Raffle is opened for everyone.', { username: 'bot' })
    });

    it('Update viewer, viewer2, mod to have 200 points', async () => {
      await getRepository(User).save({ username: user.viewer.username, userId: user.viewer.userId, points: 200 });
      await getRepository(User).save({ username: user.viewer2.username, userId: user.viewer2.userId, points: 200 });
      await getRepository(User).save({ username: user.mod.username, userId: user.mod.userId, points: 200 });
    });

    it('Viewer bets max points', async () => {
      const a = await raffles.participate({ sender: user.viewer, message: '!winme 100' });
      assert(a);
    });

    it('Viewer2 bets 50 points', async () => {
      const a = await raffles.participate({ sender: user.viewer2, message: '!winme 50' });
      assert(a);
    });

    it('expecting 2 participants to have bet of 100 and 50', async () => {
      const raffle = await getRepository(Raffle).findOne({
        relations: ['participants'],
        where: { winner: null, isClosed: false },
      });
      assert.strictEqual(raffle.participants.length, 2);
      assert.strictEqual(raffle.participants[0].tickets, 100);
      assert.strictEqual(raffle.participants[1].tickets, 50);
    });

    it('expecting 150 entries in announce message', async () => {
      await raffles.announceEntries();
      await message.isSentRaw('Added 150 entries to raffle (150 total). To enter type "!winme <1-100>". Raffle is opened for everyone.', { username: 'bot' });
    });

    it('Mod bets 50 points', async () => {
      const a = await raffles.participate({ sender: user.mod, message: '!winme 50' });
      assert(a);
    });

    it('expecting 50 new entries and 200 total in announce message', async () => {
      await raffles.announceEntries();
      await message.isSentRaw('Added 50 entries to raffle (200 total). To enter type "!winme <1-100>". Raffle is opened for everyone.', { username: 'bot' });
    });
  });

  describe('normal raffle', () => {
    before(async () => {
      await db.cleanup();
      await message.prepare();
      await user.prepare();
      raffles.announceNewEntries = true;
      raffles.announceNewEntriesBatchTime = 10;
    });

    it('create raffle', async () => {
      raffles.open({ sender: user.owner, parameters: '!winme' });
      await message.isSentRaw('Raffle is running (0 entries). To enter type "!winme". Raffle is opened for everyone.', { username: 'bot' })
    });

    it('2 viewers participate in raffle', async () => {
      const a = await raffles.participate({ sender: user.viewer, message: '!winme' });
      assert(a);
      const b = await raffles.participate({ sender: user.viewer2, message: '!winme' });
      assert(b);
    });

    it('expecting 2 participants in db', async () => {
      const raffle = await getRepository(Raffle).findOne({
        relations: ['participants'],
        where: { winner: null, isClosed: false },
      });
      assert.strictEqual(raffle.participants.length, 2);
    });

    it('expecting 2 entries in announce message', async () => {
      await raffles.announceEntries();
      await message.isSentRaw('Added 2 entries to raffle (2 total). To enter type "!winme". Raffle is opened for everyone.', { username: 'bot' });
    });

    it('1 viewers participate in raffle', async () => {
      const a = await raffles.participate({ sender: user.mod, message: '!winme' });
      assert(a);
    });

    it('expecting 1 new entry and 3 total in announce message', async () => {
      await raffles.announceEntries();
      await message.isSentRaw('Added 1 entry to raffle (3 total). To enter type "!winme". Raffle is opened for everyone.', { username: 'bot' });
    });
  });
});
