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

describe('Raffles - announce should contain delete info #4176', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();
    await user.prepare();
    raffles.deleteRaffleJoinCommands = true;
  });

  after(async () => {
    raffles.raffleAnnounceMessageInterval = 20;
    api.isStreamOnline = false;
    raffles.deleteRaffleJoinCommands = false;
  })

  it('create ticket raffle', async () => {
    raffles.open({ sender: user.owner, parameters: '!winme -min 0 -max 100' });
    await message.isSentRaw('Raffle is running (0 entries). To enter type "!winme <1-100>". Raffle is opened for everyone. Your raffle messages will be deleted on join.', { username: 'bot' })
  });

  it('Update viewer and viewer2 to have 200 points', async () => {
    await getRepository(User).save({ username: user.viewer.username, userId: user.viewer.userId, points: 200 });
    await getRepository(User).save({ username: user.viewer2.username, userId: user.viewer2.userId, points: 200 });
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

  it('expecting 2 entries in announce message', async () => {
    api.isStreamOnline = true
    raffles.lastAnnounceMessageCount = 0;
    raffles.lastAnnounce = 0;
    raffles.raffleAnnounceMessageInterval = 0;
    await raffles.announce();
    await message.isSentRaw('Raffle is running (2 entries). To enter type "!winme <1-100>". Raffle is opened for everyone. Your raffle messages will be deleted on join.', { username: 'bot' })
  });
});
