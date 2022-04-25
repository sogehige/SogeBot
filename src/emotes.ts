import { setImmediate } from 'timers';

import { shuffle } from '@sogebot/ui-helpers/array';
import * as constants from '@sogebot/ui-helpers/constants';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

import { onStartup } from './decorators/on';
import emitter from './helpers/interfaceEmitter';
import { adminEndpoint, publicEndpoint } from './helpers/socket';
import client from './services/twitch/api/client';

import Core from '~/_interface';
import { parser, settings } from '~/decorators';
import {
  debug,
  error, info, warning,
} from '~/helpers/log';
import { ioServer } from '~/helpers/panel';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';
import { variables } from '~/watchers';

let broadcasterWarning = false;

class Emotes extends Core {
  cache: {
    code: string;
    type: 'twitch' | 'twitch-sub' | 'ffz' | 'bttv' | '7tv';
    urls: { '1': string; '2': string; '3': string };
  }[] = [];

  @settings()
    '7tv' = true;
  @settings()
    ffz = true;
  @settings()
    bttv = true;

  fetch = {
    global:  false,
    channel: false,
    ffz:     false,
    bttv:    false,
    '7tv':   false,
  };

  lastGlobalEmoteChk = 1;
  lastSubscriberEmoteChk = 1;
  lastChannelChk: string | null = null;
  lastFFZEmoteChk = 1;
  lastBTTVEmoteChk = 1;
  last7TVEmoteChk = 1;

  interval: NodeJS.Timer;

  get types() {
    const types: Emotes['cache'][number]['type'][] = ['twitch', 'twitch-sub'];
    if (this['7tv']) {
      types.push('7tv');
    }
    if (this.bttv) {
      types.push('bttv');
    }
    if (this.ffz) {
      types.push('ffz');
    }
    return types;
  }

  @onStartup()
  onStartup() {
    publicEndpoint('/core/emotes', 'getCache', async (cb) => {
      try {
        cb(null, this.cache.filter(o => this.types.includes(o.type)));
      } catch (e: any) {
        cb(e.stack, []);
      }
    });

    adminEndpoint('/core/emotes', 'testExplosion', (cb) => {
      this._testExplosion();
      cb(null, null);
    });
    adminEndpoint('/core/emotes', 'testFireworks', (cb) => {
      this._testFireworks();
      cb(null, null);
    });
    adminEndpoint('/core/emotes', 'test', (cb) => {
      this._test();
      cb(null, null);
    });
    adminEndpoint('/core/emotes', 'removeCache', (cb) => {
      this.removeCache();
      cb(null, null);
    });

    emitter.on('services::twitch::emotes', (type, value) => {
      if (type === 'explode') {
        this.explode(value);
      }
      if (type === 'firework') {
        this.firework(value);
      }
    });

    this.interval = setInterval(() => {
      if (!this.fetch.global) {
        this.fetchEmotesGlobal();
      }
      if (!this.fetch.channel) {
        this.fetchEmotesChannel();
      }
      if (!this.fetch.ffz) {
        this.fetchEmotesFFZ();
      }
      if (!this.fetch.bttv) {
        this.fetchEmotesBTTV();
      }
      if (!this.fetch['7tv']) {
        this.fetchEmotes7TV();
      }
    }, 1000);
  }

  async removeCache () {
    this.lastGlobalEmoteChk = 0;
    this.lastSubscriberEmoteChk = 0;
    this.lastFFZEmoteChk = 0;
    this.last7TVEmoteChk = 0;
    this.lastBTTVEmoteChk = 0;
    this.cache = [];

    if (!this.fetch.global) {
      this.fetchEmotesGlobal();
    }
    if (!this.fetch.channel) {
      this.fetchEmotesChannel();
    }
    if (!this.fetch.ffz) {
      this.fetchEmotesFFZ();
    }
    if (!this.fetch.bttv) {
      this.fetchEmotesBTTV();
    }
    if (!this.fetch['7tv']) {
      this.fetchEmotes7TV();
    }
  }

  async fetchEmotesChannel () {
    this.fetch.channel = true;

    const broadcasterId = variables.get('services.twitch.broadcasterId') as string;
    const broadcasterType = variables.get('services.twitch.broadcasterType') as string;

    if (broadcasterId && broadcasterType !== null && (Date.now() - this.lastSubscriberEmoteChk > 1000 * 60 * 60 * 24 * 7 || this.lastChannelChk !== broadcasterId)) {
      if (broadcasterType === '' && !broadcasterWarning) {
        info(`EMOTES: Skipping fetching of ${broadcasterId} emotes - not subscriber/affiliate`);
        broadcasterWarning = true;
      } else {
        broadcasterWarning = false;
        this.lastChannelChk = broadcasterId;
        try {
          if (this.lastGlobalEmoteChk !== 0) {
            info(`EMOTES: Fetching channel ${broadcasterId} emotes`);
          }
          const clientBot = await client('bot');
          const emotes = await clientBot.chat.getChannelEmotes(broadcasterId);
          this.lastSubscriberEmoteChk = Date.now();
          this.cache = this.cache.filter(o => o.type !== 'twitch-sub');
          for (const emote of emotes) {
            debug('emotes.channel', `Saving to cache ${emote.name}#${emote.id}`);
            this.cache.push({
              code: emote.name,
              type: 'twitch',
              urls: {
                '1': emote.getImageUrl(1),
                '2': emote.getImageUrl(2),
                '3': emote.getImageUrl(4),
              },
            });
          }
          info(`EMOTES: Fetched channel ${broadcasterId} emotes`);
        } catch (e) {
          if (e instanceof Error) {
            if (e.message.includes('Cannot initialize Twitch API')) {
              this.lastSubscriberEmoteChk = 0; // recheck next tick
              this.fetch.channel = false;
            } else {
              error (e.stack ?? e.message);
            }
          }
        }
      }
    }
    this.fetch.channel = false;
  }

  async fetchEmotesGlobal () {
    this.fetch.global = true;

    // we want to update once every week
    if (Date.now() - this.lastGlobalEmoteChk > 1000 * 60 * 60 * 24 * 7) {
      try {
        if (this.lastGlobalEmoteChk !== 0) {
          info('EMOTES: Fetching global emotes');
        }
        const clientBot = await client('bot');
        const emotes = await clientBot.chat.getGlobalEmotes();
        this.lastGlobalEmoteChk = Date.now();
        this.cache = this.cache.filter(o => o.type !== 'twitch');
        for (const emote of emotes) {
          await setImmediateAwait();
          debug('emotes.global', `Saving to cache ${emote.name}#${emote.id}`);
          this.cache.push({
            code: emote.name,
            type: 'twitch',
            urls: {
              '1': emote.getImageUrl(1),
              '2': emote.getImageUrl(2),
              '3': emote.getImageUrl(4),
            },
          });
        }
        info('EMOTES: Fetched global emotes');
      } catch (e) {
        if (e instanceof Error) {
          if (e.message.includes('Cannot initialize Twitch API')) {
            this.lastGlobalEmoteChk = 0; // recheck next tick
            this.fetch.global = false;
          } else {
            error (e.stack ?? e.message);
          }
        }
      }
    }

    this.fetch.global = false;
  }

  async fetchEmotesFFZ () {
    const broadcasterId = variables.get('services.twitch.broadcasterId') as string;
    const currentChannel = variables.get('services.twitch.currentChannel') as string;

    if (currentChannel.length === 0) {
      setImmediate(() => this.fetchEmotesFFZ());
      return;
    }
    this.fetch.ffz = true;

    // fetch FFZ emotes
    if (broadcasterId && Date.now() - this.lastFFZEmoteChk > 1000 * 60 * 60 * 24 * 7) {
      info('EMOTES: Fetching ffz emotes');
      this.lastFFZEmoteChk = Date.now();
      try {
        const request = await axios.get<any>('https://api.frankerfacez.com/v1/room/id/' + broadcasterId);

        const emoteSet = request.data.room.set;
        const emotes = request.data.sets[emoteSet].emoticons;

        for (let i = 0, length = emotes.length; i < length; i++) {
          // change 4x to 3x, to be same as Twitch and BTTV
          emotes[i].urls['3'] = emotes[i].urls['4']; delete emotes[i].urls['4'];
          const cachedEmote = this.cache.find(o => o.code === emotes[i].code && o.type === 'ffz');
          this.cache.push({
            ...cachedEmote,
            code: emotes[i].name,
            type: 'ffz',
            urls: emotes[i].urls,
          });
        }
        info('EMOTES: Fetched ffz emotes');
      } catch (e: any) {
        if (e.response.status === 404) {
          warning(`EMOTES: Channel ${currentChannel} not found in ffz`);
        } else {
          error(e);
        }
      }

      this.fetch.ffz = false;
    }
  }

  async fetchEmotes7TV () {
    const currentChannel = variables.get('services.twitch.currentChannel') as string;

    const getAllGlobalEmotes = async (query: string, urlTemplate: string, page = 1): Promise<void> => {
      const request = await axios.post<any>('https://api.7tv.app/v2/gql', {
        query,
        variables: {
          'query':        '',
          'page':         page,
          'pageSize':     16,
          'limit':        16,
          'globalState':  'only',
          'sortBy':       'popularity',
          'sortOrder':    0,
          'channel':      '',
          'submitted_by': null,
        },
      });

      for (let i = 0, length = request.data.data.search_emotes.length; i < length; i++) {
        await setImmediateAwait();
        const cachedEmote = this.cache.find(o => o.code === request.data.data.search_emotes[i].name && o.type === '7tv');
        this.cache.push({
          ...cachedEmote,
          code: request.data.data.search_emotes[i].name,
          type: '7tv',
          urls: {
            '1': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '1x'),
            '2': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '2x'),
            '3': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '3x'),
          },
        });
      }

      if (request.data.data.search_emotes.length === 16) {
        return await getAllGlobalEmotes(query, urlTemplate, page + 1);
      }
    };

    const getAllChannelEmotes = async (query: string, urlTemplate: string, channel: string, page = 1, emotes: any[] = []): Promise<void> => {
      const request = await axios.post<any>('https://api.7tv.app/v2/gql', {
        query,
        variables: {
          'query':        '',
          'page':         page,
          'pageSize':     16,
          'limit':        16,
          'globalState':  'include',
          'sortBy':       'popularity',
          'sortOrder':    0,
          'channel':      channel,
          'submitted_by': null,
        },
      });

      for (let i = 0, length = request.data.data.search_emotes.length; i < length; i++) {
        await setImmediateAwait();
        const cachedEmote = this.cache.find(o => o.code === request.data.data.search_emotes[i].name && o.type === '7tv');
        this.cache.push({
          ...cachedEmote,
          code: request.data.data.search_emotes[i].name,
          type: '7tv',
          urls: {
            '1': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '1x'),
            '2': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '2x'),
            '3': urlTemplate.replace('{{id}}', request.data.data.search_emotes[i].id).replace('{{image}}', '3x'),
          },
        });
      }

      if (request.data.data.search_emotes.length === 16) {
        return await getAllChannelEmotes(query, channel, urlTemplate, page + 1, emotes);
      }
    };

    if (currentChannel.length === 0) {
      setImmediate(() => this.fetchEmotes7TV());
      return;
    }

    this.fetch['7tv'] = true;

    if (currentChannel && Date.now() - this.last7TVEmoteChk > 1000 * 60 * 60 * 24 * 7) {
      info('EMOTES: Fetching 7tv emotes');
      this.last7TVEmoteChk = Date.now();
      this.cache = this.cache.filter(o => o.type !== '7tv');
      try {
        const urlTemplate = `https://cdn.7tv.app/emote/{{id}}/{{image}}`;

        const query = `query($query: String!,$page: Int,$pageSize: Int,$globalState: String,$sortBy: String,$sortOrder: Int,$channel: String,$submitted_by: String,$filter: EmoteFilter) {search_emotes(query: $query,limit: $pageSize,page: $page,pageSize: $pageSize,globalState: $globalState,sortBy: $sortBy,sortOrder: $sortOrder,channel: $channel,submitted_by: $submitted_by,filter: $filter) {id,visibility,owner {id,display_name,role {id,name,color},banned}name,tags}}`;
        await getAllGlobalEmotes(query, urlTemplate);
        await getAllChannelEmotes(query, urlTemplate, currentChannel),
        info('EMOTES: Fetched 7tv emotes');
      } catch (e: any) {
        error(e);
      }
    }

    this.fetch['7tv'] = false;
  }

  async fetchEmotesBTTV () {
    const currentChannel = variables.get('services.twitch.currentChannel') as string;

    if (currentChannel.length === 0) {
      setImmediate(() => this.fetchEmotesBTTV());
      return;
    }

    this.fetch.bttv = true;

    // fetch BTTV emotes
    if (currentChannel && Date.now() - this.lastBTTVEmoteChk > 1000 * 60 * 60 * 24 * 7) {
      info('EMOTES: Fetching bttv emotes');
      this.lastBTTVEmoteChk = Date.now();
      this.cache = this.cache.filter(o => o.type !== 'bttv');
      try {
        const request = await axios.get<any>('https://api.betterttv.net/2/channels/' + currentChannel);

        const urlTemplate = request.data.urlTemplate;
        const emotes = request.data.emotes;

        for (let i = 0, length = emotes.length; i < length; i++) {
          const cachedEmote = this.cache.find(o => o.code === emotes[i].code && o.type === 'bttv');
          this.cache.push({
            ...cachedEmote,
            code: emotes[i].code,
            type: 'bttv',
            urls: {
              '1': urlTemplate.replace('{{id}}', emotes[i].id).replace('{{image}}', '1x'),
              '2': urlTemplate.replace('{{id}}', emotes[i].id).replace('{{image}}', '2x'),
              '3': urlTemplate.replace('{{id}}', emotes[i].id).replace('{{image}}', '3x'),
            },
          });
        }
        info('EMOTES: Fetched bttv emotes');
      } catch (e: any) {
        if (e.response.status === 404) {
          warning(`EMOTES: Channel ${currentChannel} not found in bttv`);
        } else {
          error(e);
        }
      }
    }

    this.fetch.bttv = false;
  }

  async _testFireworks () {
    this.firework(['Kappa', 'GivePLZ', 'PogChamp']);
  }

  async _testExplosion () {
    this.explode(['Kappa', 'GivePLZ', 'PogChamp']);
  }

  async _test () {
    ioServer?.of('/services/twitch').emit('emote', {
      id:  uuid(),
      url: {
        1: 'https://static-cdn.jtvnw.net/emoticons/v1/9/1.0',
        2: 'https://static-cdn.jtvnw.net/emoticons/v1/9/2.0',
        3: 'https://static-cdn.jtvnw.net/emoticons/v1/9/3.0',
      },
    });
  }

  async firework (data: string[]) {
    const emotes = await this.parseEmotes(data);
    ioServer?.of('/services/twitch').emit('emote.firework', { emotes });
  }

  async explode (data: string[]) {
    const emotes = await this.parseEmotes(data);
    ioServer?.of('/services/twitch').emit('emote.explode', { emotes });
  }

  @parser({ priority: constants.LOW, fireAndForget: true })
  async containsEmotes (opts: ParserOptions) {
    if (!opts.sender) {
      return true;
    }

    const parsed: string[] = [];
    const usedEmotes: { [code: string]: Emotes['cache'][number]} = {};

    if (opts.emotesOffsets) {
    // add emotes from twitch which are not maybe in cache (other partner emotes etc)
      for (const emoteId of opts.emotesOffsets.keys()) {
        // if emote is already in cache, continue
        const firstEmoteOffset = opts.emotesOffsets.get(emoteId)?.shift();
        if (!firstEmoteOffset) {
          continue;
        }
        const emoteCode = opts.message.slice(Number(firstEmoteOffset.split('-')[0]), Number(firstEmoteOffset.split('-')[1])+1);
        const idx = this.cache.findIndex(o => o.code === emoteCode);
        if (idx === -1) {
          const data = {
            type: 'twitch',
            code: emoteCode,
            urls: {
              '1': 'https://static-cdn.jtvnw.net/emoticons/v1/' + emoteId + '/1.0',
              '2': 'https://static-cdn.jtvnw.net/emoticons/v1/' + emoteId + '/2.0',
              '3': 'https://static-cdn.jtvnw.net/emoticons/v1/' + emoteId + '/3.0',
            },
          } as const;

          // update emotes in cache
          this.cache.push(data);
        }
      }
    }

    for (const potentialEmoteCode of opts.message.split(' ').filter(Boolean)) {
      if (parsed.includes(potentialEmoteCode)) {
        continue;
      } // this emote was already parsed
      parsed.push(potentialEmoteCode);
      const emoteFromCache = this.cache.find(o => o.code === potentialEmoteCode && this.types.includes(o.type));
      if (emoteFromCache) {
        for (let i = 0; i < opts.message.split(' ').filter(word => word === potentialEmoteCode).length; i++) {
          usedEmotes[potentialEmoteCode + `${i}`] = emoteFromCache;
        }
      }
    }

    const emotes = shuffle(Object.keys(usedEmotes));
    const id = uuid();
    for (let i = 0; i < emotes.length; i++) {
      ioServer?.of('/services/twitch').emit('emote', { id, url: usedEmotes[emotes[i]].urls });
    }
    return true;
  }

  async parseEmotes (emotes: string[]) {
    const emotesArray: {1: string, 2: string, 3:string }[] = [];

    for (let i = 0, length = emotes.length; i < length; i++) {
      try {
        const items = this.cache.filter(o => o.code === emotes[i]);
        if (items.length > 0) {
          emotesArray.push(items[0].urls);
        }
      } catch (e: any) {
        continue;
      }
    }
    return emotesArray;
  }
}

export default new Emotes();
