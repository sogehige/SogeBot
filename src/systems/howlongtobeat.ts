import { HowLongToBeatGame } from '@entity/howLongToBeatGame';
import * as constants from '@sogebot/ui-helpers/constants';
import { HowLongToBeatService } from 'howlongtobeat';
import { EntityNotFoundError } from 'typeorm';

import { command, default_permission } from '../decorators';
import { onStartup } from '../decorators/on';
import Expects from '../expects';
import System from './_interface';

import {
  isStreamOnline, stats, streamStatusChangeSince,
} from '~/helpers/api';
import { prepare } from '~/helpers/commons';
import {
  debug, error,
} from '~/helpers/log';
import { defaultPermissions } from '~/helpers/permissions/index';
import { app } from '~/helpers/panel';
import { adminMiddleware } from '~/socket';

class HowLongToBeat extends System {
  interval: number = constants.MINUTE;
  hltbService = new HowLongToBeatService();

  @onStartup()
  onStartup() {
    this.addMenu({
      category: 'manage', name: 'howlongtobeat', id: 'manage/howlongtobeat', this: this,
    });

    setInterval(() => {
      this.updateGameplayTimes();
    }, constants.HOUR);

    let lastDbgMessage = '';
    setInterval(async () => {
      const dbgMessage = `streamOnline: ${isStreamOnline.value}, enabled: ${this.enabled}, currentGame: ${ stats.value.currentGame}`;
      if (lastDbgMessage !== dbgMessage) {
        lastDbgMessage = dbgMessage;
        debug('hltb', dbgMessage);
      }
      if (isStreamOnline.value && this.enabled) {
        this.addToGameTimestamp();
      }
    }, this.interval);
  }

  async updateGameplayTimes() {
    const games = await HowLongToBeatGame.find();

    for (const game of games) {
      try {
        if (Date.now() - new Date(game.updatedAt!).getTime() < constants.DAY) {
          throw new Error('Updated recently');
        }

        if (['irl', 'always on', 'software and game development'].includes(game.game.toLowerCase())) {
          throw new Error('Ignored game');
        }

        const gameFromHltb = (await this.hltbService.search(game.game))[0];
        if (!gameFromHltb) {
          throw new Error('Game not found');
        }

        game.gameplayMain = gameFromHltb.gameplayMain;
        game.gameplayMainExtra = gameFromHltb.gameplayMainExtra;
        game.gameplayCompletionist = gameFromHltb.gameplayCompletionist;
        await game.save();
      } catch (e) {
        continue;
      }
    }
  }

  sockets() {
    if (!app) {
      setTimeout(() => this.sockets(), 100);
      return;
    }

    app.get('/api/systems/hltb', adminMiddleware, async (req, res) => {
      res.send({
        data: await HowLongToBeatGame.find(),
      });
    });
    app.post('/api/systems/hltb/:id', async (req, res) => {
      try {
        const game = await HowLongToBeatGame.findOneOrFail({ where: { id: req.params.id } });
        for (const key of Object.keys(req.body)) {
          (game as any)[key as any] = req.body[key];
        }
        res.send({
          data: await game.save(),
        });
      } catch {
        res.status(404).send();
      }
    });
    app.get('/api/systems/hltb/:id', async (req, res) => {
      res.send({
        data: await HowLongToBeatGame.findOne({ where: { id: req.params.id } }),
      });
    });
    app.delete('/api/systems/hltb/:id', adminMiddleware, async (req, res) => {
      const item = await HowLongToBeatGame.findOne({ where: { id: req.params.id } });
      await item?.remove();
      res.status(404).send();
    });
    app.post('/api/systems/hltb', adminMiddleware, async (req, res) => {
      try {
        if (req.query.search) {
          const search = await this.hltbService.search(req.query.search as string);
          const games = await HowLongToBeatGame.find();

          res.send({
            data: search
              .filter((o: any) => {
              // we need to filter already added gaems
                return !games.map(a => a.game.toLowerCase()).includes(o.name.toLowerCase());
              })
              .map((o: any) => o.name),
          });
        } else {
          const gameFromHltb = (await this.hltbService.search(req.body))[0];
          if (gameFromHltb) {
            const game = new HowLongToBeatGame({
              game:                  gameFromHltb.name,
              startedAt:             new Date().toISOString(),
              updatedAt:             new Date().toISOString(),
              gameplayMain:          gameFromHltb.gameplayMain,
              gameplayMainExtra:     gameFromHltb.gameplayMainExtra,
              gameplayCompletionist: gameFromHltb.gameplayCompletionist,
            });
            await game.validateAndSave();
            res.send({
              data: game,
            });
          } else {
            throw new Error(`Game ${req.body} not found on HLTB service`);
          }
        }
      } catch (e: any) {
        res.status(404).send();
      }
    });
  }

  async addToGameTimestamp() {
    if (!stats.value.currentGame) {
      debug('hltb', 'No game being played on stream.');
      return; // skip if we don't have game
    }

    if (stats.value.currentGame.trim().length === 0) {
      debug('hltb', 'Empty game is being played on stream');
      return; // skip if we have empty game
    }

    try {
      const game = await HowLongToBeatGame.findOneOrFail({ where: { game: stats.value.currentGame } });
      const stream = game.streams.find(o => o.createdAt === new Date(streamStatusChangeSince.value).toISOString());
      if (stream) {
        debug('hltb', 'Another 15s entry of this stream for ' + stats.value.currentGame);
        stream.timestamp += this.interval;
      } else {
        debug('hltb', 'First entry of this stream for ' + stats.value.currentGame);
        game.streams.push({
          createdAt:              new Date(streamStatusChangeSince.value).toISOString(),
          timestamp:              this.interval,
          offset:                 0,
          isMainCounted:          false,
          isCompletionistCounted: false,
          isExtraCounted:         false,
        });
      }
      await game.save();
    } catch (e: any) {
      if (e instanceof EntityNotFoundError) {
        try {
          if (['irl', 'always on', 'software and game development'].includes(stats.value.currentGame.toLowerCase())) {
            throw new Error('Ignored game');
          }

          const gameFromHltb = (await this.hltbService.search(stats.value.currentGame))[0];
          if (!gameFromHltb) {
            throw new Error('Game not found');
          }
          // we don't care if MP game or not (user might want to track his gameplay time)
          const game = new HowLongToBeatGame({
            game:                  stats.value.currentGame,
            gameplayMain:          gameFromHltb.gameplayMain,
            gameplayMainExtra:     gameFromHltb.gameplayMainExtra,
            gameplayCompletionist: gameFromHltb.gameplayCompletionist,
          });
          await game.save();
        } catch {
          const game = new HowLongToBeatGame({
            game:                  stats.value.currentGame,
            gameplayMain:          0,
            gameplayMainExtra:     0,
            gameplayCompletionist: 0,
          });
          await game.save();
        }
      } else {
        error(e.stack);
      }
    }
  }

  @command('!hltb')
  @default_permission(defaultPermissions.CASTERS)
  async currentGameInfo(opts: CommandOptions, retry = false): Promise<CommandResponse[]> {
    let [gameInput] = new Expects(opts.parameters)
      .everything({ optional: true })
      .toArray();

    if (!gameInput) {
      if (!stats.value.currentGame) {
        return []; // skip if we don't have game
      } else {
        gameInput = stats.value.currentGame;
      }
    }
    const gameToShow = await HowLongToBeatGame.findOne({ where: { game: gameInput } });
    if (!gameToShow && !retry) {
      if (!stats.value.currentGame) {
        return this.currentGameInfo(opts, true);
      }

      if (stats.value.currentGame.trim().length === 0 || stats.value.currentGame.trim() === 'IRL') {
        return this.currentGameInfo(opts, true);
      }
      return this.currentGameInfo(opts, true);
    } else if (!gameToShow) {
      return [{ response: prepare('systems.howlongtobeat.error', { game: gameInput }), ...opts }];
    }
    const timeToBeatMain = (gameToShow.streams.filter(o => o.isMainCounted).reduce((prev, cur) => prev += cur.timestamp + cur.offset , 0) + gameToShow.offset) / constants.HOUR;
    const timeToBeatMainExtra = (gameToShow.streams.filter(o => o.isExtraCounted).reduce((prev, cur) => prev += cur.timestamp + cur.offset, 0) + gameToShow.offset) / constants.HOUR;
    const timeToBeatCompletionist = (gameToShow.streams.filter(o => o.isCompletionistCounted).reduce((prev, cur) => prev += cur.timestamp + cur.offset, 0) + gameToShow.offset) / constants.HOUR;

    const gameplayMain = gameToShow.gameplayMain;
    const gameplayMainExtra = gameToShow.gameplayMainExtra;
    const gameplayCompletionist = gameToShow.gameplayCompletionist;

    if (gameplayMain === 0) {
      return [{
        response: prepare('systems.howlongtobeat.multiplayer-game', {
          game:                 gameInput,
          currentMain:          timeToBeatMain.toFixed(1),
          currentMainExtra:     timeToBeatMainExtra.toFixed(1),
          currentCompletionist: timeToBeatCompletionist.toFixed(1),
        }), ...opts,
      }];
    }

    return [{
      response: prepare('systems.howlongtobeat.game', {
        game:                 gameInput,
        hltbMain:             gameplayMain,
        hltbCompletionist:    gameplayCompletionist,
        hltbMainExtra:        gameplayMainExtra,
        currentMain:          timeToBeatMain.toFixed(1),
        currentMainExtra:     timeToBeatMainExtra.toFixed(1),
        currentCompletionist: timeToBeatCompletionist.toFixed(1),
        percentMain:          Number((timeToBeatMain / gameplayMain) * 100).toFixed(2),
        percentMainExtra:     Number((timeToBeatMainExtra / gameplayMainExtra) * 100).toFixed(2),
        percentCompletionist: Number((timeToBeatCompletionist / gameplayCompletionist) * 100).toFixed(2),
      }), ...opts,
    }];
  }
}

export default new HowLongToBeat();
