import { isMainThread } from '../cluster';

import * as constants from '../constants';
import System from './_interface';
import { command, default_permission } from '../decorators';
import { permission } from '../helpers/permissions';
import { HowLongToBeatService } from 'howlongtobeat';
import Expects from '../expects';
import { prepare } from '../commons';

import { getRepository } from 'typeorm';
import { HowLongToBeatGame, HowLongToBeatGameItem } from '../database/entity/howLongToBeatGame';
import { adminEndpoint } from '../helpers/socket';
import api from '../api';
import { error, info, warning } from '../helpers/log';

class HowLongToBeat extends System {
  interval: number = constants.SECOND * 15;
  hltbService = isMainThread ? new HowLongToBeatService() : null;

  constructor() {
    super();
    this.addMenu({ category: 'manage', name: 'howlongtobeat', id: 'manage/hltb', this: this });

    if (isMainThread) {
      this.refreshImageThumbnail();
      setInterval(async () => {
        //if (api.isStreamOnline) {
        this.addToGameTimestamp();
        //}
      }, this.interval);
    }
  }

  sockets() {
    adminEndpoint(this.nsp, 'generic::getAll', async (cb) => {
      try {
        cb(null, await getRepository(HowLongToBeatGame).find(), await getRepository(HowLongToBeatGameItem).find());
      } catch (e) {
        cb(e.stack, []);
      }
    });
    adminEndpoint(this.nsp, 'hltb::save', async (item, cb) => {
      try {
        cb(null, await getRepository(HowLongToBeatGame).save(item));
      } catch (e) {
        cb(e.stack);
      }
    });
  }

  async refreshImageThumbnail() {
    try {
      const games = await getRepository(HowLongToBeatGame).find();
      for (const game of games) {
        const gamesFromHltb = await this.hltbService.search(game.game);
        const gameFromHltb = gamesFromHltb.length > 0 ? gamesFromHltb[0] : null;
        if (gameFromHltb && game.imageUrl !== gameFromHltb.imageUrl) {
          info(`HowLongToBeat | Thumbnail for ${game.game} is updated.`);
          getRepository(HowLongToBeatGame).update({ id: game.id }, { imageUrl: gameFromHltb.imageUrl });
        }
      }
    } catch (e) {
      error(e);
    }
    setTimeout(() => this.refreshImageThumbnail(), constants.HOUR);
  }

  async addToGameTimestamp() {
    if (!api.stats.currentGame) {
      return; // skip if we don't have game
    }

    if (api.stats.currentGame.trim().length === 0 || api.stats.currentGame.trim() === 'IRL') {
      return; // skip if we have empty game
    }

    try {
      const game = await getRepository(HowLongToBeatGame).findOneOrFail({ where: { game: api.stats.currentGame } });
      const stream = await getRepository(HowLongToBeatGameItem).findOne({ where: { hltb_id: game.id, createdAt: api.streamStatusChangeSince } });
      if (stream) {
        await getRepository(HowLongToBeatGameItem).increment({ id: stream.id }, 'timestamp', this.interval);
      } else {
        await getRepository(HowLongToBeatGameItem).save({
          createdAt: api.streamStatusChangeSince,
          hltb_id: game.id,
          timestamp: this.interval,
        });
      }
    } catch (e) {
      if (e.name === 'EntityNotFound') {
        const gameFromHltb = (await this.hltbService.search(api.stats.currentGame))[0];
        if (gameFromHltb) {
          // we don't care if MP game or not (user might want to track his gameplay time)
          await getRepository(HowLongToBeatGame).save({
            game: api.stats.currentGame,
            imageUrl: gameFromHltb.imageUrl,
            startedAt: Date.now(),
            gameplayMain: gameFromHltb.gameplayMain,
            gameplayMainExtra: gameFromHltb.gameplayMainExtra,
            gameplayCompletionist: gameFromHltb.gameplayCompletionist,
          });
        } else {
          warning(`HLTB: game '${api.stats.currentGame}' was not found on HLTB service`);
        }
        this.addToGameTimestamp();
      } else {
        error(e.stack);
      }
    }
  }

  @command('!hltb')
  @default_permission(permission.CASTERS)
  async currentGameInfo(opts: CommandOptions, retry = false): Promise<CommandResponse[]> {
    let [gameInput] = new Expects(opts.parameters)
      .everything({ optional: true })
      .toArray();

    if (!gameInput) {
      if (!api.stats.currentGame) {
        return []; // skip if we don't have game
      } else {
        gameInput = api.stats.currentGame;
      }
    }
    const gameToShow = await getRepository(HowLongToBeatGame).findOne({ where: { game: gameInput } });
    if (!gameToShow && !retry) {
      if (!api.stats.currentGame) {
        return this.currentGameInfo(opts, true);
      }

      if (api.stats.currentGame.trim().length === 0 || api.stats.currentGame.trim() === 'IRL') {
        return this.currentGameInfo(opts, true);
      }
      const gamesFromHltb = await this.hltbService.search(api.stats.currentGame);
      const gameFromHltb = gamesFromHltb.length > 0 ? gamesFromHltb[0] : null;
      const game = {
        game: api.stats.currentGame,
        gameplayMain: (gameFromHltb || { gameplayMain: 0 }).gameplayMain,
        gameplayCompletionist: (gameFromHltb || { gameplayMain: 0 }).gameplayCompletionist,
        isFinishedMain: false,
        isFinishedCompletionist: false,
        timeToBeatMain: 0,
        timeToBeatCompletionist: 0,
        imageUrl: (gameFromHltb || { imageUrl: '' }).imageUrl,
        startedAt: Date.now(),
      };
      if (game.gameplayMain > 0) {
        // save only if we have numbers from hltb (possible MP game)
        await getRepository(HowLongToBeatGame).save(game);
      }
      return this.currentGameInfo(opts, true);
    } else if (!gameToShow) {
      return [{ response: prepare('systems.howlongtobeat.error', { game: gameInput }), ...opts }];
    }
    return [];
    /*const timeToBeatMain = gameToShow.timeToBeatMain / constants.HOUR;
    const timeToBeatCompletionist = gameToShow.timeToBeatCompletionist / constants.HOUR;
    const gameplayMain = gameToShow.gameplayMain;
    const gameplayCompletionist = gameToShow.gameplayCompletionist;
    const finishedMain = gameToShow.isFinishedMain;
    const finishedCompletionist = gameToShow.isFinishedCompletionist;
    return [{
      response: prepare('systems.howlongtobeat.game', {
        game: gameInput, hltbMain: gameplayMain, hltbCompletionist: gameplayCompletionist, currentMain: timeToBeatMain.toFixed(1), currentCompletionist: timeToBeatCompletionist.toFixed(1),
        percentMain: Number((timeToBeatMain / gameplayMain) * 100).toFixed(2),
        percentCompletionist: Number((timeToBeatCompletionist / gameplayCompletionist) * 100).toFixed(2),
        doneMain: finishedMain ? prepare('systems.howlongtobeat.done') : '',
        doneCompletionist: finishedCompletionist ? prepare('systems.howlongtobeat.done') : '',
      }), ...opts,
    }];
    */
  }
}

export default new HowLongToBeat();
