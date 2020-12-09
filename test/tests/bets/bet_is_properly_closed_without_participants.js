/* eslint-disable @typescript-eslint/no-var-requires */
/* global describe it */
require('../../general.js');

const db = require('../../general.js').db;
const message = require('../../general.js').message;
const time = require('../../general.js').time;

const { getRepository } = require('typeorm');
const bets = (require('../../../dest/systems/bets')).default;
const { Bets } = require('../../../dest/database/entity/bets');

const assert = require('assert');

// users
const owner = { username: '__broadcaster__' };

describe('Bets - bet should automatically be locked after given time without participants', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();
  });

  it('Seed database with soon to be closed bet', async () => {
    await getRepository(Bets).insert({
      arePointsGiven: true,
      createdAt: Date.now(),
      endedAt: Date.now() + 1000,
      isLocked: false,
      options: ['a', 'b'],
      title: 'test',
    });
  });

  it('Bet should be locked in db in 15 seconds', async () => {
    const result = await Promise.race([
      new Promise(resolve => setTimeout(() => resolve(false), 15000)),
      new Promise(resolve => {
        const check = async () => {
          const currentBet = await getRepository(Bets).findOne({
            relations: ['participations'],
            order: { createdAt: 'DESC' },
          });
          if (currentBet.isLocked) {
            resolve(true);
          } else {
            setTimeout(() => check(), 50);
          }
        };
        check();
      }),
    ]);
    assert(result, 'Bet was not locked after 15 seconds.');
  });

  it('!bet should not show any running bet', async () => {
    const r = await bets.info({ sender: owner, parameters: '' });
    assert.strictEqual(r[0].response, 'No bet is currently opened, ask mods to open it!');
  });

  it('!bet participate should not show any running bet', async () => {
    const r = await bets.participate({ sender: owner, parameters: '1' });
    assert.strictEqual(r[0].response, 'No bet is currently opened, ask mods to open it!');
  });

});