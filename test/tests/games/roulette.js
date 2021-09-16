/* eslint-disable @typescript-eslint/no-var-requires */
/* global */

require('../../general.js');

const assert = require('assert');

const _ = require('lodash');
const { getRepository } = require('typeorm');

const { User } = require('../../../dest/database/entity/user');
const roulette = (require('../../../dest/games/roulette')).default;
const changelog = (require('../../../dest/helpers/user/changelog'));
const points = (require('../../../dest/systems/points')).default;
const db = require('../../general.js').db;
const message = require('../../general.js').message;
const user = require('../../general.js').user;

const tests = [
  { user: { username: 'user1', userId: String(_.random(999999, false)) } },
  { user: user.owner },
  { user: user.mod },
];

describe('game/roulette - !roulette', () => {
  for (const test of tests) {
    describe(`${test.user.username} uses !roulette`, async () => {
      let r;
      before(async () => {
        await db.cleanup();
        await message.prepare();
        await user.prepare();
      });

      it(`${test.user.username} starts roulette`, async () => {
        r = await roulette.main({ sender: test.user });
      });

      if (user.mod.username === test.user.username) {
        it('Expecting mod message', async () => {
          assert(r[1].response === '$sender is incompement and completely missed his head!', JSON.stringify({ r }, null, 2));
        });
      } else if (user.owner.username === test.user.username) {
        it('Expecting owner message', async () => {
          assert(r[1].response === '$sender is using blanks, boo!', JSON.stringify({ r }, null, 2));
        });
      } else {
        it('Expecting win or lose', async () => {
          const msg1 = '$sender is alive! Nothing happened.';
          const msg2 = '$sender\'s brain was splashed on the wall!';
          assert(r[1].response === msg1 || r[1].response === msg2, JSON.stringify({
            r, msg1, msg2,
          }, null, 2));
        });
      }
    });
  }

  describe('/t/seppuku-and-roulette-points-can-be-negated/36', async () => {
    before(async () => {
      await db.cleanup();
      await message.prepare();
      await getRepository(User).save(tests[0].user);
    });

    it(`set lose value to 100`, () => {
      roulette.loserWillLose = 100;
    });

    it(`User starts roulette and we are waiting for lose`, async () => {
      let isAlive = true;
      let r;
      while(isAlive) {
        r = await roulette.main({ sender: tests[0].user });
        isAlive = r[1].isAlive;
      }
      const msg1 = '$sender\'s brain was splashed on the wall!';
      assert(r[1].response === msg1, JSON.stringify({ r, msg1 }));
    });

    it(`User should not have negative points`, async () => {
      await changelog.flush();
      const user1 = await getRepository(User).findOne({ userId: tests[0].user.userId });
      assert.strictEqual(user1.points, 0);
    });
  });

  describe('game/roulette - winnerWillGet, loserWillLose', () => {
    describe(`Winner should get points`, async () => {
      before(async () => {
        await db.cleanup();
        await message.prepare();
        await user.prepare();
        roulette.winnerWillGet = 100;
      });
      after(() => {
        roulette.winnerWillGet = 0;
      });

      it(`${user.viewer.username} starts roulettes and we wait for win`, async () => {
        let r = '';
        while (r !== '$sender is alive! Nothing happened.') {
          const responses = await roulette.main({ sender: user.viewer });
          r = responses[1].response;
        }
      });

      it('User should get 100 points from win', async () => {
        assert.strictEqual(await points.getPointsOf(user.viewer.userId), 100);
      });
    });

    describe(`Loser should lose points`, async () => {
      before(async () => {
        await db.cleanup();
        await message.prepare();
        await user.prepare();
        roulette.loserWillLose = 100;
        await getRepository(User).save({
          userId: user.viewer.userId, username: user.viewer.username, points: 100,
        });
      });
      after(() => {
        roulette.loserWillLose = 0;
      });

      it(`${user.viewer.username} starts roulettes and we wait for lose`, async () => {
        let r = '';
        while (r !== '$sender\'s brain was splashed on the wall!') {
          const responses = await roulette.main({ sender: user.viewer });
          r = responses[1].response;
        }
      });

      it('User should lose 100 points from win', async () => {
        assert.strictEqual(await points.getPointsOf(user.viewer.userId), 0);
      });
    });
  });
});
