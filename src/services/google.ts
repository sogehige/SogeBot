import { getRepository } from 'typeorm';
import { GooglePrivateKeys } from '~/database/entity/google';
import { app } from '~/helpers/panel';
import { adminMiddleware } from '~/socket';
import { onChange, onStartup, onStreamEnd, onStreamStart } from '~/decorators/on';
import Service from './_interface';

import { google, youtube_v3 } from 'googleapis';
import { error, info } from '~/helpers/log';

import { OAuth2Client } from 'google-auth-library/build/src/auth/oauth2client';
import { MINUTE } from '@sogebot/ui-helpers/constants';

import {
  isStreamOnline,
  stats,
  streamStatusChangeSince,
} from '~/helpers/api';
import { persistent, settings } from '~/decorators';
import { getLang } from '~/helpers/locales';
import { getTime } from '@sogebot/ui-helpers/getTime';
import { adminEndpoint } from '~/helpers/socket';

class Google extends Service {
  clientId = '225380804535-gjd77dplfkbe4d3ct173d8qm0j83f8tr.apps.googleusercontent.com';
  @persistent()
    refreshToken = '';
  @settings()
    channel = '';
  @settings()
    streamId = '';

  @settings()
    onStreamEndTitle = 'Archive | $gamesList | $date';
  @settings()
    onStreamEndTitleEnabled = false;

  @settings()
    onStreamEndDescription = 'Streamed at https://twitch.tv/changeme\nTitle: $title\n\n=========\n$chapters\n========\n\nDate: $date';
  @settings()
    onStreamEndDescriptionEnabled = false;

  @settings()
    onStreamEndPrivacyStatus: 'private' | 'public' | 'unlisted' = 'private';
  @settings()
    onStreamEndPrivacyStatusEnabled = false;

  expiryDate: null | number = null;
  accessToken: null | string = null;
  client: OAuth2Client | null = null;

  onStartupInterval: null | NodeJS.Timer = null;
  onStartupIntervalPrepareBroadcast: null | NodeJS.Timer = null;
  chatInterval: null | NodeJS.Timer = null;

  broadcastId: string | null = null;
  gamesPlayedOnStream: { game: string, seconds: number }[] = [];
  broadcastStartedAt: string = new Date().toLocaleDateString(getLang());

  @onStreamStart()
  onStreamStart() {
    this.gamesPlayedOnStream = stats.value.currentGame ? [{ game: stats.value.currentGame, seconds: 0 }] : [];
    this.broadcastStartedAt = new Date().toLocaleDateString(getLang());
  }

  @onStreamEnd()
  async onStreamEnd() {
    if (this.client && this.broadcastId) {
      const youtube = google.youtube({
        auth:    this.client,
        version: 'v3',
      });

      // load broadcast
      const list = await youtube.liveBroadcasts.list({
        part: ['id','snippet','contentDetails','status'],
        id:   [this.broadcastId],
      });

      let broadcast: youtube_v3.Schema$LiveBroadcast;
      if (list.data.items && list.data.items.length > 0) {
        broadcast = list.data.items[0];
      } else {
        // broadcast was not found
        return;
      }

      // get active broadcasts
      youtube.liveBroadcasts.update({
        part:        ['id','snippet','contentDetails','status'],
        requestBody: {
          ...broadcast,
          id:      this.broadcastId,
          snippet: {
            ...broadcast.snippet,
            title: this.onStreamEndTitleEnabled
              ? this.onStreamEndTitle
                .replace('$gamesList', Array.from(new Set(this.gamesPlayedOnStream.map(item => item.game))).join(', '))
                .replace('$title', stats.value.currentTitle || '')
                .replace('$date', this.broadcastStartedAt)
              : broadcast.snippet?.title,
            description: this.onStreamEndDescriptionEnabled
              ? this.onStreamEndDescription
                .replace('$chapters', this.gamesPlayedOnStream
                  .map(item => `${getTime(item.seconds, false)} ${item.game}`)
                  .join('\n'))
                .replace('$title', broadcast.snippet?.title || stats.value.currentTitle || '')
                .replace('$date', this.broadcastStartedAt)
              : broadcast.snippet?.description,
          },
          status: {
            ...broadcast.status,
            privacyStatus: this.onStreamEndPrivacyStatusEnabled
              ? this.onStreamEndPrivacyStatus
              : broadcast.status?.privacyStatus,
          },
        },
      });
    }
  }

  @onChange('refreshToken')
  @onStartup()
  async onStartup() {
    if (this.refreshToken.length === 0) {
      return;
    }

    if (this.client) {
      this.client = null;
    }

    // configure a JWT auth client
    this.client = new google.auth.OAuth2({
      clientId: this.clientId,
    });
    this.client.setCredentials({
      access_token:  this.accessToken,
      refresh_token: this.refreshToken,
      expiry_date:   this.expiryDate,
    });

    this.client.on('tokens', (tokens) => {
      if (tokens.refresh_token) {
        this.refreshToken = tokens.refresh_token;
      }
      if (tokens.access_token) {
        this.accessToken = tokens.access_token;
      }
      if (tokens.expiry_date) {
        this.expiryDate = tokens.expiry_date;
      }
    });

    const youtube = google.youtube({
      auth:    this.client,
      version: 'v3',
    });

    const channel = await youtube.channels.list({
      part: ['snippet,contentDetails'],
      mine: true,
    });
    if (channel.data.items && channel.data.items.length > 0) {
      const item = channel.data.items[0].snippet!;
      this.channel = [channel.data.items[0].id, item.title, item.customUrl].filter(String).join(' | ');
      info(`YOUTUBE: Authentication to Google Service successful as ${this.channel}.`);

      if (this.onStartupInterval) {
        clearInterval(this.onStartupInterval);
      }
      this.onStartupInterval = setInterval(async () => {
        const stream = await this.getBroadcast();

        if (stream && stream.snippet) {
          const currentTitle = stats.value.currentTitle || 'n/a';
          if (stream.snippet.title !== currentTitle && isStreamOnline.value) {
            info(`YOUTUBE: Title is not matching current title, changing by bot to "${currentTitle}"`);
            await this.updateTitle(stream, currentTitle);
          }
        }

        // add game to list
        if (stats.value.currentGame
          && (this.gamesPlayedOnStream.length === 0 || this.gamesPlayedOnStream[this.gamesPlayedOnStream.length - 1].game !== stats.value.currentGame)) {
          this.gamesPlayedOnStream.push({
            game:    stats.value.currentGame,
            seconds: (Date.now() - streamStatusChangeSince.value) / 1000,
          });
        }
      }, MINUTE);

      if (this.onStartupIntervalPrepareBroadcast) {
        clearInterval(this.onStartupIntervalPrepareBroadcast);
      }
      this.onStartupInterval = setInterval(async () => {
        const broadcast = await this.getBroadcast();

        if (!broadcast) {
          this.prepareBroadcast();
        }
      }, 15 * MINUTE);
    } else {
      error(`'YOUTUBE: Couldn't get channel informations.`);
    }
  }

  async updateTitle(stream: youtube_v3.Schema$LiveBroadcast, title: string) {
    if (this.client) {
      const youtube = google.youtube({
        auth:    this.client,
        version: 'v3',
      });

      // get active broadcasts
      await youtube.liveBroadcasts.update({
        part:        ['id','snippet','contentDetails','status'],
        requestBody: {
          ...stream,
          snippet: {
            ...stream.snippet,
            title,
          },
        },
      });
    }
  }

  async getBroadcast() {
    if (this.client) {
      const youtube = google.youtube({
        auth:    this.client,
        version: 'v3',
      });

      // get active broadcasts
      const list = await youtube.liveBroadcasts.list({
        part:            ['id','snippet','contentDetails','status'],
        broadcastStatus: 'active',
      });

      if (list.data.items && list.data.items.length > 0) {
        const broadcast = list.data.items[0];
        this.broadcastId = broadcast.id ?? null;
        return broadcast;
      }
    }
    return null;
  }

  async prepareBroadcast() {
    if (isStreamOnline.value) {
      return; // do nothing if already streaming
    }
    // we want to create new stream, private for now for archive purpose
    if (this.client) {
      const youtube = google.youtube({
        auth:    this.client,
        version: 'v3',
      });

      // get active broadcasts
      const list = await youtube.liveBroadcasts.list({
        part:            ['id','snippet','contentDetails','status'],
        broadcastStatus: 'upcoming',
      });

      if (list.data.items && list.data.items.length > 0) {
        const broadcast = list.data.items[0];

        this.broadcastId = broadcast.id ?? null;

        if (this.streamId.length > 0 && broadcast.id) {
          await youtube.liveBroadcasts.bind({
            part:     ['id'],
            streamId: this.streamId,
            id:       broadcast.id,
          });
        }

        // if have broadcast, update scheduledStartTime
        return youtube.liveBroadcasts.update({
          part:        ['id','snippet','contentDetails','status'],
          requestBody: {
            ...broadcast,
            snippet: {
              ...broadcast.snippet,
              title:              stats.value.currentTitle || 'n/a',
              scheduledStartTime: new Date(Date.now() + (15 * 60000)).toISOString(),
            },
          },
        });
      }

      youtube.liveBroadcasts.insert({
        part:        ['id','snippet','contentDetails','status'],
        requestBody: {
          snippet: {
            title:              stats.value.currentTitle || 'n/a',
            scheduledStartTime: new Date(Date.now() + (15 * 60000)).toISOString(),
          },
          status: {
            privacyStatus:           'private',
            selfDeclaredMadeForKids: false,
          },
          contentDetails: {
            enableAutoStart: true,
            enableAutoStop:  true,
          },
        },
      })
        .then(liveBroadcastResponse => {
          if (this.streamId.length > 0 && liveBroadcastResponse.data.id) {
            youtube.liveBroadcasts.bind({
              part:     ['id'],
              streamId: this.streamId,
              id:       liveBroadcastResponse.data.id,
            });
          }
          info(`YOUTUBE: Created new private broadcast ${liveBroadcastResponse.data.id}`);
        })
        .catch(e => {
          error(`YOUTUBE: Something went wrong:\n${e}`);
        });
    }
  }

  sockets() {
    if (!app) {
      setTimeout(() => this.sockets(), 100);
      return;
    }

    adminEndpoint('/integrations/google', 'google::revoke', async (cb) => {
      self.channel = '';
      self.refreshToken = '';
      info(`YOUTUBE: User access revoked.`);
      cb(null);
    });
    adminEndpoint('/integrations/google', 'google::token', async (tokens, cb) => {
      self.refreshToken = tokens.refreshToken;
      cb(null);
    });

    app.get('/api/services/google/privatekeys', adminMiddleware, async (req, res) => {
      res.send({
        data: await getRepository(GooglePrivateKeys).find(),
      });
    });

    app.post('/api/services/google/privatekeys', adminMiddleware, async (req, res) => {
      const data = req.body;
      await getRepository(GooglePrivateKeys).save(data);
      res.send({ data });
    });

    app.delete('/api/services/google/privatekeys/:id', adminMiddleware, async (req, res) => {
      await getRepository(GooglePrivateKeys).delete({ id: req.params.id });
      res.status(404).send();
    });

    app.get('/api/services/google/streams', adminMiddleware, async (req, res) => {
      if (this.client) {
        const youtube = google.youtube({
          auth:    this.client,
          version: 'v3',
        });

        const rmtps = await youtube.liveStreams.list({
          part: ['id', 'snippet', 'cdn', 'status'],
          mine: true,
        });
        res.send({ data: rmtps.data.items });
      } else {
        res.send({ data: [] });
      }
    });
  }
}
const self = new Google();
export default self;
