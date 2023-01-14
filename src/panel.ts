'use strict';

import fs, { existsSync, readFileSync } from 'fs';
import path from 'path';

import Core from '~/_interface';
import { CacheGames, CacheGamesInterface } from '~/database/entity/cacheGames.js';
import { CacheTitles } from '~/database/entity/cacheTitles';
import { Translation } from '~/database/entity/translation';
import { User } from '~/database/entity/user';
import { AppDataSource } from '~/database.js';
import { onStartup } from '~/decorators/on';
import { schema } from '~/graphql/schema';
import {
  chatMessagesAtStart, isStreamOnline, rawStatus, stats, streamStatusChangeSince,
} from '~/helpers/api';
import { getOwnerAsSender } from '~/helpers/commons/getOwnerAsSender';
import {
  getURL, getValueOf, isVariableSet, postURL,
} from '~/helpers/customvariables';
import { getIsBotStarted } from '~/helpers/database';
import { flatten } from '~/helpers/flatten';
import { setValue } from '~/helpers/general';
import { getLang } from '~/helpers/locales';
import {
  error,
  getDEBUG, info, setDEBUG,
} from '~/helpers/log';
import {
  app, ioServer, server, serverSecure, setApp, setServer,
} from '~/helpers/panel';
import { errors, warns } from '~/helpers/panel/alerts';
import { socketsConnectedDec, socketsConnectedInc } from '~/helpers/panel/index';
import { linesParsed, status as statusObj } from '~/helpers/parser';
import { list, systems } from '~/helpers/register';
import { adminEndpoint } from '~/helpers/socket';
import { tmiEmitter } from '~/helpers/tmi';
import * as changelog from '~/helpers/user/changelog.js';
import lastfm from '~/integrations/lastfm';
import spotify from '~/integrations/spotify';
import Parser from '~/parser';

import cors from 'cors';

import { getGameThumbnailFromName } from '~/services/twitch/calls/getGameThumbnailFromName.js';

import express from 'express';

import { sendGameFromTwitch } from '~/services/twitch/calls/sendGameFromTwitch';

import { graphqlHTTP } from 'express-graphql';

import { updateChannelInfo } from '~/services/twitch/calls/updateChannelInfo.js';

import RateLimit from 'express-rate-limit';

import { default as socketSystem } from '~/socket';

import gitCommitInfo from 'git-commit-info';

import highlights from '~/systems/highlights';

import jwt from 'jsonwebtoken';

import songs from '~/systems/songs';

import _ from 'lodash';

import translateLib, { translate } from '~/translate';

import sanitize from 'sanitize-filename';

import { variables } from '~/watchers';

import { possibleLists } from '../d.ts/src/helpers/socket.js';

const port = Number(process.env.PORT ?? 20000);
const secureport = Number(process.env.SECUREPORT ?? 20443);

const limiter = RateLimit({
  windowMs: 60 * 1000,
  max:      1000,
  skip:     (req) => {
    return req.url.includes('/socket/refresh');
  },
  message:      'Too many requests from this IP, please try again after several minutes.',
  keyGenerator: (req) => {
    return req.ip + req.url;
  },
});

class Panel extends Core {
  @onStartup()
  onStartup() {
    this.init();
    this.expose();
    sendStreamData();
  }

  expose () {
    server.listen(port, '::');
    server.listen(port, '0.0.0.0', () => {
      info(`WebPanel is available at http://localhost:${port}`);
      info(`New dashboard is available at https://dash.sogebot.xyz/?server=http://localhost:${port}`);
    });
    serverSecure?.listen(secureport, '0.0.0.0', () => {
      info(`WebPanel is available at https://localhost:${secureport}`);
      info(`New dashboard is available at https://dash.sogebot.xyz/?server=https://localhost:${port}`);

    });
  }

  init () {
    setApp(express());
    app?.use(limiter);
    app?.use(cors());
    app?.use(express.json({
      limit:  '500mb',
      verify: (req, _res, buf) =>{
        // Small modification to the JSON bodyParser to expose the raw body in the request object
        // The raw body is required at signature verification
        (req as any).rawBody = buf;
      },
    }));

    app?.use(express.urlencoded({ extended: true, limit: '500mb' }));
    app?.use(express.raw());

    setServer();

    // highlights system
    app?.get('/highlights/:id', (req, res) => {
      highlights.url(req, res);
    });

    app?.get('/health', (req, res) => {
      if (getIsBotStarted()) {
        const version = _.get(process, 'env.npm_package_version', 'x.y.z');
        const commitFile = existsSync('./.commit') ? readFileSync('./.commit').toString() : null;
        res.status(200).send(version.replace('SNAPSHOT', commitFile && commitFile.length > 0 ? commitFile : gitCommitInfo().shortHash || 'SNAPSHOT'));
      } else {
        res.status(503).send('Not OK');
      }
    });

    app?.use(
      '/graphql',
      function (req, _res, next) {
        const token = req.headers.authorization as string | undefined;

        try {
          if (!token) {
            throw new Error();
          } else {
            const data = jwt.verify(token.replace('Bearer', '').trim(), socketSystem.JWTKey);
            (req as any).user = data;
          }
        } catch {
          (req as any).user = null;
        }
        next();
      },
      graphqlHTTP({
        schema,
        graphiql: true,
      }),
    );

    // customvariables system
    app?.get('/customvariables/:id', (req, res) => {
      getURL(req, res);
    });
    app?.post('/customvariables/:id', (req, res) => {
      postURL(req, res);
    });

    // static routing
    app?.use('/dist', express.static(path.join(__dirname, '..', 'public', 'dist')));

    const nuxtCache = new Map<string, string>();
    app?.get(['/_static/*', '/credentials/_static/*'], (req, res) => {
      if (!nuxtCache.get(req.url)) {
      // search through node_modules to find correct nuxt file
        const paths = [
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-oauth', 'dist', '_static'),
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-public', 'dist', '_static'),
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-admin', 'dist', '_static'),
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-overlay', 'dist', '_static'),
        ];
        for (const dir of paths) {
          const pathToFile = path.join(dir, req.url.replace('_static', ''));
          if (fs.existsSync(pathToFile)) { // lgtm [js/path-injection]
            nuxtCache.set(req.url, pathToFile);
          }
        }
      }

      const filepath = path.join(nuxtCache.get(req.url) ?? '') as string;
      if (fs.existsSync(filepath) && nuxtCache.has(req.url)) { // lgtm [js/path-injection]
        res.sendFile(filepath);
      } else {
        res.sendStatus(404);
      }
    });
    app?.get(['/public/_next/*'], (req, res) => {
      if (!nuxtCache.get(req.url)) {
      // search through node_modules to find correct nuxt file
        const paths = [
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-public', 'out', '_next'),
        ];
        for (const dir of paths) {
          const url = req.url.replace('public', '').replace('_next', '');
          const pathToFile = path.join(dir, url);
          if (fs.existsSync(pathToFile)) { // lgtm [js/path-injection]
            nuxtCache.set(req.url, pathToFile);
          }
        }
      }
      const filepath = path.join(nuxtCache.get(req.url) ?? '');
      if (fs.existsSync(filepath) && nuxtCache.has(req.url)) { // lgtm [js/path-injection]
        res.sendFile(filepath);
      } else {
        nuxtCache.delete(req.url);
        res.sendStatus(404);
      }
    });
    app?.get(['/_nuxt/*', '/credentials/_nuxt/*', '/overlays/_nuxt/*'], (req, res) => {
      if (!nuxtCache.get(req.url)) {
      // search through node_modules to find correct nuxt file
        const paths = [
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-oauth', 'dist', '_nuxt'),
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-admin', 'dist', '_nuxt'),
          path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-overlay', 'dist', '_nuxt'),
        ];
        for (const dir of paths) {
          const pathToFile = path.join(dir, req.url.replace('_nuxt', '').replace('credentials', '').replace('overlays', ''));
          if (fs.existsSync(pathToFile)) { // lgtm [js/path-injection]
            nuxtCache.set(req.url, pathToFile);
          }
        }
      }
      const filepath = path.join(nuxtCache.get(req.url) ?? '');
      if (fs.existsSync(filepath) && nuxtCache.has(req.url)) { // lgtm [js/path-injection]
        res.sendFile(filepath);
      } else {
        nuxtCache.delete(req.url);
        res.sendStatus(404);
      }
    });
    app?.get('/webhooks/callback', function (req, res) {
      res.status(200).send('OK');
    });
    app?.get('/popout/', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'public', 'popout.html'));
    });
    app?.get(['/overlays/:id', '/overlays/text/:id', '/overlays/alerts/:id', '/overlays/goals/:id'], function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-overlay', 'dist', 'index.html'));
    });
    app?.get('/public/:page?', function (req, res) {
      if (variables.get('core.ui.enablePublicPage')) {
        res.sendFile(path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-public', 'out', `${req.params.page ?? 'index'}.html`));
      } else {
        if (req.originalUrl !== '/public/?check=true') {
          info('Public page has been disabled, enable in Admin UI -> settings -> ui');
        }
        res.status(404).send();
      }
    });
    app?.get('/credentials/oauth/:page?', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-oauth', 'dist', 'oauth', 'index.html'));
    });
    app?.get('/credentials/login', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-oauth', 'dist', 'login', 'index.html'));
    });
    app?.get('/assets/:asset/:file?', function (req, res) {
      if (req.params.file) {
        res.sendFile(path.join(__dirname, '..', 'assets', sanitize(req.params.asset), sanitize(req.params.file)));
      } else {
        res.sendFile(path.join(__dirname, '..', 'assets', sanitize(req.params.asset)));
      }
    });
    app?.get('/assets/presets/textOverlay/:preset/:file', function (req, res) {
      const file = path.join(__dirname, '..', 'assets', 'presets', 'textOverlay', sanitize(req.params.preset), sanitize(req.params.file));
      if (existsSync(file)) {
        res.sendFile(path.join(__dirname, '..', 'assets', 'presets', 'textOverlay', sanitize(req.params.preset), sanitize(req.params.file)));
      } else {
        res.status(404).send('Not Found');
      }
    });
    app?.get('/custom/:custom', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'public', 'custom', sanitize(req.params.custom) + '.html'));
    });
    app?.get('/fonts', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'fonts.json'));
    });
    app?.get('/favicon.ico', function (req, res) {
      res.sendFile(path.join(__dirname, '..', 'favicon.ico'));
    });
    app?.get('/:page?', function (req, res) {
      const indexPath = path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-admin', 'dist', 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(path.join(__dirname, '..', 'node_modules', '@sogebot', 'ui-admin', 'dist', 'index.html'));
      } else {
        res.sendFile(path.join(__dirname, '..', 'assets', 'updating.html'));
      }
    });

    ioServer?.use(socketSystem.authorize as any);

    ioServer?.on('connect', async (socket) => {
      socket.on('disconnect', () => {
        socketsConnectedDec();
      });
      socketsConnectedInc();

      // twitch game and title change
      socket.on('getGameFromTwitch', function (game: string, cb) {
        sendGameFromTwitch(game).then((data) => cb(data));
      });
      socket.on('getUserTwitchGames', async (cb) => {
        let titles = await AppDataSource.getRepository(CacheTitles).find();
        const cachedGames = await AppDataSource.getRepository(CacheGames).find();

        // we need to cleanup titles if game is not in cache
        for (const title of titles) {
          if (!cachedGames.map(o => o.name).includes(title.game)) {
            await AppDataSource.getRepository(CacheTitles).delete({ game: title.game });
          }
        }

        const games: CacheGamesInterface[] = [];
        for (const game of cachedGames) {
          games.push({
            ...game,
            thumbnail: await getGameThumbnailFromName(game.name) || '',
          });
        }
        titles = await AppDataSource.getRepository(CacheTitles).find();
        cb(titles, games);
      });
      socket.on('cleanupGameAndTitle', async () => {
      // remove empty titles
        await AppDataSource
          .createQueryBuilder()
          .delete()
          .from(CacheTitles, 'titles')
          .where('title = :title', { title: '' })
          .execute();

        // remove duplicates
        const allTitles = await AppDataSource.getRepository(CacheTitles).find();
        for (const t of allTitles) {
          const titles = allTitles.filter(o => o.game === t.game && o.title === t.title);
          if (titles.length > 1) {
          // remove title if we have more than one title
            await AppDataSource
              .createQueryBuilder()
              .delete()
              .from(CacheTitles, 'titles')
              .where('id = :id', { id: t.id })
              .execute();
          }
        }
      });
      socket.on('updateGameAndTitle', async (data: { game: string, title: string, tags: string[] }, cb: (status: boolean | null) => void) => {
        const status = await updateChannelInfo(data);

        if (!status) { // twitch refused update
          cb(true);
        }

        data.title = data.title.trim();
        data.game = data.game.trim();

        const item = await AppDataSource.getRepository(CacheTitles).findOneBy({
          game:  data.game,
          title: data.title,
        });

        if (!item) {
          await AppDataSource
            .createQueryBuilder()
            .insert()
            .into(CacheTitles)
            .values([
              {
                game: data.game, title: data.title, timestamp: Date.now(), tags: data.tags,
              },
            ])
            .execute();
        } else {
        // update timestamp
          await AppDataSource.getRepository(CacheTitles).save({ ...item, timestamp: Date.now(), tags: data.tags });
        }
        cb(null);
      });
      socket.on('joinBot', async () => {
        tmiEmitter.emit('join', 'bot');
      });
      socket.on('leaveBot', async () => {
        tmiEmitter.emit('part', 'bot');
        // force all users offline
        await changelog.flush();
        await AppDataSource.getRepository(User).update({}, { isOnline: false });
      });

      // custom var
      socket.on('custom.variable.value', async (_variable: string, cb: (error: string | null, value: string) => void) => {
        let value = translate('webpanel.not-available');
        const isVarSet = await isVariableSet(_variable);
        if (isVarSet) {
          value = await getValueOf(_variable);
        }
        cb(null, value);
      });

      socket.on('responses.get', async function (at: string | null, callback: (responses: Record<string, string>) => void) {
        const responses = flatten(!_.isNil(at) ? translateLib.translations[getLang()][at] : translateLib.translations[getLang()]);
        _.each(responses, function (value, key) {
          const _at = !_.isNil(at) ? at + '.' + key : key;
          responses[key] = {}; // remap to obj
          responses[key].default = translate(_at, true);
          responses[key].current = translate(_at);
        });
        callback(responses);
      });
      socket.on('responses.set', function (data: { key: string }) {
        _.remove(translateLib.custom, function (o: any) {
          return o.key === data.key;
        });
        translateLib.custom.push(data);
        translateLib._save();

        const lang = {};
        _.merge(
          lang,
          translate({ root: 'webpanel' }),
          translate({ root: 'ui' }), // add ui root -> slowly refactoring to new name
        );
        socket.emit('lang', lang);
      });
      socket.on('responses.revert', async function (data: { name: string }, callback: (translation: string) => void) {
        _.remove(translateLib.custom, function (o: any) {
          return o.name === data.name;
        });
        await AppDataSource.getRepository(Translation).delete({ name: data.name });
        callback(translate(data.name));
      });

      adminEndpoint('/', 'debug::get', (cb) => {
        cb(null, getDEBUG());
      });

      adminEndpoint('/', 'debug::set', (data) => {
        setDEBUG(data);
      });

      adminEndpoint('/', 'panel::alerts', (cb) => {
        const toShow: { errors: typeof errors, warns: typeof warns }  = { errors: [], warns: [] };
        do {
          const err = errors.shift();
          if (!err) {
            break;
          }

          if (!toShow.errors.find((o) => {
            return o.name === err.name && o.message === err.message;
          })) {
            toShow.errors.push(err);
          }
        } while (errors.length > 0);
        do {
          const warn = warns.shift();
          if (!warn) {
            break;
          }

          if (!toShow.warns.find((o) => {
            return o.name === warn.name && o.message === warn.message;
          })) {
            toShow.warns.push(warn);
          }
        } while (warns.length > 0);
        cb(null, toShow);
      });

      socket.on('connection_status', (cb: (status: typeof statusObj) => void) => {
        cb(statusObj);
      });
      socket.on('saveConfiguration', function (data: any) {
        _.each(data, async function (index, value) {
          if (value.startsWith('_')) {
            return true;
          }
          setValue({
            sender: getOwnerAsSender(), createdAt: 0, command: '', parameters: value + ' ' + index, attr: { quiet: data._quiet }, isAction: false, emotesOffsets: new Map(), isFirstTimeMessage: false, discord: undefined,
          });
        });
      });

      socket.on('populateListOf', async (type: possibleLists, cb: (err: string | null, toEmit: any) => void) => {
        const toEmit: any[] = [];
        if (type === 'systems') {
          for (const system of systems) {
            toEmit.push({
              name:                   system.__moduleName__.toLowerCase(),
              enabled:                system.enabled,
              areDependenciesEnabled: await system.areDependenciesEnabled,
              isDisabledByEnv:        system.isDisabledByEnv,
              type:                   'systems',
            });
          }
        } else if (type === 'services') {
          for (const system of list('services')) {
            toEmit.push({
              name: system.__moduleName__.toLowerCase(),
              type: 'services',
            });
          }
        } else if (type === 'core') {
          for (const system of ['dashboard', 'currency', 'ui', 'general', 'twitch', 'socket', 'eventsub', 'updater', 'tts', 'emotes']) {
            toEmit.push({ name: system.toLowerCase(), type: 'core' });
          }
        } else if (type === 'integrations') {
          for (const system of list('integrations')) {
            if (!system.showInUI) {
              continue;
            }
            toEmit.push({
              name:                   system.__moduleName__.toLowerCase(),
              enabled:                system.enabled,
              areDependenciesEnabled: await system.areDependenciesEnabled,
              isDisabledByEnv:        system.isDisabledByEnv,
              type:                   'integrations',
            });
          }
        } else if (type === 'overlays') {
          for (const system of list('overlays')) {
            if (!system.showInUI) {
              continue;
            }
            toEmit.push({ name: system.__moduleName__.toLowerCase(), type: 'overlays' });
          }
        } else if (type === 'games') {
          for (const system of list('games')) {
            if (!system.showInUI) {
              continue;
            }
            toEmit.push({
              name:                   system.__moduleName__.toLowerCase(),
              enabled:                system.enabled,
              areDependenciesEnabled: await system.areDependenciesEnabled,
              isDisabledByEnv:        system.isDisabledByEnv,
              type:                   'games',
            });
          }
        }

        cb(null, toEmit);
      });

      socket.on('name', function (cb: (botUsername: string) => void) {
        cb(variables.get('services.twitch.botUsername') as string);
      });
      socket.on('channelName', function (cb: (broadcasterUsername: string) => void) {
        cb(variables.get('services.twitch.broadcasterUsername') as string);
      });
      socket.on('version', function (cb: (version: string) => void) {
        const version = _.get(process, 'env.npm_package_version', 'x.y.z');
        const commitFile = existsSync('./.commit') ? readFileSync('./.commit').toString() : null;
        cb(version.replace('SNAPSHOT', commitFile && commitFile.length > 0 ? commitFile : gitCommitInfo().shortHash || 'SNAPSHOT'));
      });

      socket.on('parser.isRegistered', function (data: { emit: string, command: string }) {
        socket.emit(data.emit, { isRegistered: new Parser().find(data.command) });
      });

      socket.on('translations', (cb: (lang: Record<string, any>) => void) => {
        const lang = {};
        _.merge(
          lang,
          translate({ root: 'webpanel' }),
          translate({ root: 'ui' }), // add ui root -> slowly refactoring to new name
          { bot: translate({ root: 'core' }) },
        );
        cb(lang);
      });

      // send webpanel translations
      const lang = {};
      _.merge(
        lang,
        translate({ root: 'webpanel' }),
        translate({ root: 'ui' }), // add ui root -> slowly refactoring to new name,
        { bot: translate({ root: 'core' }) },
      );
      socket.emit('lang', lang);
    });
  }
}

export const getServer = function () {
  return server;
};

export const getApp = function () {
  return app;
};

const sendStreamData = async () => {
  try {
    if (!translateLib.isLoaded) {
      throw new Error('Translation not yet loaded');
    }

    const ytCurrentSong = Object.values(songs.isPlaying).find(o => o) ? _.get(JSON.parse(songs.currentSong), 'title', null) : null;
    let spotifyCurrentSong: null | string = _.get(JSON.parse(spotify.currentSong), 'song', '') + ' - ' + _.get(JSON.parse(spotify.currentSong), 'artist', '');
    if (spotifyCurrentSong.trim().length === 1 /* '-' */  || !_.get(JSON.parse(spotify.currentSong), 'is_playing', false)) {
      spotifyCurrentSong = null;
    }

    const broadcasterType = variables.get('services.twitch.broadcasterType') as string;
    const data = {
      broadcasterType:    broadcasterType,
      uptime:             isStreamOnline.value ? streamStatusChangeSince.value : null,
      currentViewers:     stats.value.currentViewers,
      currentSubscribers: stats.value.currentSubscribers,
      currentBits:        stats.value.currentBits,
      currentTips:        stats.value.currentTips,
      chatMessages:       isStreamOnline.value ? linesParsed - chatMessagesAtStart.value : 0,
      currentFollowers:   stats.value.currentFollowers,
      maxViewers:         stats.value.maxViewers,
      newChatters:        stats.value.newChatters,
      game:               stats.value.currentGame,
      status:             stats.value.currentTitle,
      rawStatus:          rawStatus.value,
      currentSong:        lastfm.currentSong || ytCurrentSong || spotifyCurrentSong || translate('songs.not-playing'),
      currentWatched:     stats.value.currentWatchedTime,
      tags:               stats.value.currentTags ?? [],
    };
    ioServer?.emit('panel::stats', data);
  } catch (e: any) {
    if (e instanceof Error) {
      if (e.message !== 'Translation not yet loaded') {
        error(e);
      }
    }
  }
  setTimeout(async () => await sendStreamData(), 1000);
};

export default new Panel();