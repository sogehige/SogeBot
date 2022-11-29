// 3rdparty libraries

// bot libraries

import { Event, Events } from '@entity/event';
import { WidgetSocial } from '@entity/widget';
import chalk from 'chalk';
import _ from 'lodash';
import {
  ETwitterStreamEvent,
  TwitterApi,
} from 'twitter-api-v2';
import { AppDataSource } from '~/database';

import { settings } from '../decorators';
import { onChange, onStartup } from '../decorators/on';
import events from '../events';
import Message from '../message';
import Integration from './_interface';

import { attributesReplace } from '~/helpers/attributesReplace';
import { getOwner } from '~/helpers/commons';
import { eventEmitter } from '~/helpers/events';
import { error, info } from '~/helpers/log';

class Twitter extends Integration {
  public watchedStreams: {
    hash: string;
    stream: any;
  }[] = [];
  public client: TwitterApi | null = null;

  @settings('token')
    consumerKey = '';
  @settings('token')
    consumerSecret = '';
  @settings('token')
    accessToken = '';
  @settings('token')
    secretToken = '';

  @onStartup()
  onStartup() {
    this.addEvent();
    setInterval(() => {
      this.updateStreams();
    }, 10000);
  }

  public addEvent() {
    if (typeof events === 'undefined') {
      setTimeout(() => this.addEvent(), 1000);
    } else {
      events.supportedEventsList.push(
        {
          id: 'tweet-post-with-hashtag', variables: [ 'tweet.text', 'tweet.username', 'tweet.displayname', 'tweet.url' ], definitions: { hashtag: '' }, check: this.eventHaveCorrectHashtag,
        },
      );
      events.supportedOperationsList.push(
        {
          id: 'send-twitter-message', definitions: { messageToSend: '' }, fire: this.fireSendTwitterMessage,
        },
      );
    }
  }

  public async fireSendTwitterMessage(operation: Events.OperationDefinitions, attributes: Events.Attributes): Promise<void> {
    attributes.username = _.get(attributes, 'username', getOwner());
    const message = attributesReplace(attributes, String(operation.messageToSend));
    self.send(await new Message(message).parse());
  }

  public send(text: string): void {
    if (this.client === null) {
      throw new Error('Twitter integration is not connected');
    }
    this.client.v1.post('statuses/update.json', { status: text }, { forceBodyMode: 'url' })
      .catch(postError => error(chalk.yellow('TWITTER: ') + postError.message));
  }

  public async enableStreamForHash(hash: string): Promise<void> {
    if (!this.watchedStreams.find((o) => o.hash === hash)) {
      const stream = await this.client?.v1.stream.getStream('statuses/filter.json', { track: hash });
      info(chalk.yellow('TWITTER: ') + 'Stream for ' + hash + ' was started.');
      this.watchedStreams.push({ hash, stream });
      await stream?.on(ETwitterStreamEvent.Data, (tweet) => {
        const data = {
          id:          tweet.id_str,
          type:        'twitter',
          timestamp:   Date.now(),
          hashtag:     hash,
          text:        tweet.text,
          username:    tweet.user.screen_name,
          displayname: tweet.user.name,
          url:         `https://twitter.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
        };
        AppDataSource.getRepository(WidgetSocial).save(data);
        eventEmitter.emit('tweet-post-with-hashtag', { tweet: data });
      });
      await stream?.on(ETwitterStreamEvent.ConnectionError, onError => {
        error(chalk.yellow('TWITTER: ') + onError);
      });
    }
  }

  public async disableStreamForHash(hash: string) {
    const stream = this.watchedStreams.find((o) => o.hash === hash);
    if (stream) {
      stream.stream.destroy();
    }
    this.watchedStreams = this.watchedStreams.filter((o) => o.hash !== hash);
    info(chalk.yellow('TWITTER: ') + 'Stream for ' + hash + ' was ended.');
  }

  @onStartup()
  @onChange('enabled')
  public onStateChange(key: string, value: boolean) {
    if (value) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  protected async eventHaveCorrectHashtag(event: any, attributes: Events.Attributes): Promise<boolean> {
    const shouldTrigger = event.definitions.hashtag === attributes.tweet.hashtag;
    return shouldTrigger;
  }

  protected async updateStreams() {
    if (this.client === null) {
      // do nothing if client is not defined
      return;
    }
    const hashtagsToWatch = (await AppDataSource.getRepository(Event).findBy({ name: 'tweet-post-with-hashtag' })).map((o) => {
      return o.definitions.hashtag;
    });

    for (const s of this.watchedStreams) {
      if (hashtagsToWatch.includes(s.hash)) {
        // hash already added
        continue;
      } else {
        // hash is not in watchlist
        this.disableStreamForHash(s.hash);
      }
    }

    for (const hash of hashtagsToWatch) {
      // enable rest of hashed
      this.enableStreamForHash(hash as string);
    }
  }

  private disconnect() {
    this.client = null;
    info(chalk.yellow('TWITTER: ') + 'Client disconnected from service');
  }

  private connect() {
    try {
      const errors: string[] = [];
      if (this.consumerKey.trim().length === 0) {
        errors.push('consumerKey');
      }
      if (this.consumerSecret.trim().length === 0) {
        errors.push('consumerSecret');
      }
      if (this.accessToken.trim().length === 0) {
        errors.push('accessToken');
      }
      if (this.secretToken.trim().length === 0) {
        errors.push('secretToken');
      }
      if (errors.length > 0) {
        throw new Error(errors.join(', ') + 'missing');
      }

      this.client = new TwitterApi({
        appKey:       this.consumerKey.trim(),
        appSecret:    this.consumerSecret.trim(),
        accessToken:  this.accessToken.trim(),
        accessSecret: this.secretToken.trim(),
      });
      info(chalk.yellow('TWITTER: ') + 'Client connected to service');
    } catch (e: any) {
      info(chalk.yellow('TWITTER: ') + e.message);
    }
  }
}

const self = new Twitter();
export default self;
