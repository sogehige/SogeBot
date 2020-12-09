import { getRepository } from 'typeorm';

import Core from './_interface';
import api from './api';
import { isIgnored, prepare } from './commons';
import { EventList } from './database/entity/eventList';
import { User } from './database/entity/user';
import { command, default_permission, settings } from './decorators';
import { dayjs, timezone } from './helpers/dayjs';
import { getTime } from './helpers/getTime';
import { permission } from './helpers/permissions';
import { adminEndpoint } from './helpers/socket';
import oauth from './oauth';
import { translate } from './translate';
import users from './users';

class Twitch extends Core {
  @settings('general')
  isTitleForced = false;

  constructor () {
    super();

    this.addWidget('twitch', 'widget-title-twitch', 'fab fa-twitch');
  }

  sockets() {
    adminEndpoint(this.nsp, 'broadcaster', (cb) => {
      try {
        cb(null, (oauth.broadcasterUsername).toLowerCase());
      } catch (e) {
        cb(e.stack, '');
      }
    });
  }

  @command('!uptime')
  async uptime (opts: CommandOptions) {
    const time = getTime(api.streamStatusChangeSince, true) as any;
    return [
      {
        response: await translate(api.isStreamOnline ? 'uptime.online' : 'uptime.offline')
          .replace(/\$days/g, time.days)
          .replace(/\$hours/g, time.hours)
          .replace(/\$minutes/g, time.minutes)
          .replace(/\$seconds/g, time.seconds),
        ...opts,
      },
    ];
  }

  @command('!time')
  async time (opts: CommandOptions) {
    return [ { response: prepare('time', { time: dayjs().tz(timezone).format('LTS') }), ...opts }];
  }

  @command('!followers')
  async followers (opts: CommandOptions) {
    const events = await getRepository(EventList)
      .createQueryBuilder('events')
      .select('events')
      .orderBy('events.timestamp', 'DESC')
      .where('events.event = :event', { event: 'follow' })
      .getMany();
    const onlineFollowers = (await getRepository(User).createQueryBuilder('user')
      .where('user.username != :botusername', { botusername: oauth.botUsername.toLowerCase() })
      .andWhere('user.username != :broadcasterusername', { broadcasterusername: oauth.broadcasterUsername.toLowerCase() })
      .andWhere('user.isFollower = :isFollower', { isFollower: true })
      .andWhere('user.isOnline = :isOnline', { isOnline: true })
      .getMany())
      .filter(o => {
        return !isIgnored({ username: o.username, userId: o.userId });
      });

    let lastFollowAgo = '';
    let lastFollowUsername = 'n/a';
    if (events.length > 0) {
      lastFollowUsername = await users.getNameById(events[0].userId);
      lastFollowAgo = dayjs(events[0].timestamp).fromNow();
    }

    const response = prepare('followers', {
      lastFollowAgo: lastFollowAgo,
      lastFollowUsername: lastFollowUsername,
      onlineFollowersCount: onlineFollowers.length,
    });
    return [ { response, ...opts }];
  }

  @command('!subs')
  async subs (opts: CommandOptions) {
    const events = await getRepository(EventList)
      .createQueryBuilder('events')
      .select('events')
      .orderBy('events.timestamp', 'DESC')
      .where('events.event = :event', { event: 'sub' })
      .orWhere('events.event = :event2', { event2: 'resub' })
      .orWhere('events.event = :event3', { event3: 'subgift' })
      .getMany();

    const onlineSubscribers = (await getRepository(User).createQueryBuilder('user')
      .where('user.username != :botusername', { botusername: oauth.botUsername.toLowerCase() })
      .andWhere('user.username != :broadcasterusername', { broadcasterusername: oauth.broadcasterUsername.toLowerCase() })
      .andWhere('user.isSubscriber = :isSubscriber', { isSubscriber: true })
      .andWhere('user.isOnline = :isOnline', { isOnline: true })
      .getMany()).filter(o => {
      return !isIgnored({ username: o.username, userId: o.userId });
    });

    let lastSubAgo = '';
    let lastSubUsername = 'n/a';
    if (events.length > 0) {
      lastSubUsername = await users.getNameById(events[0].userId);
      lastSubAgo = dayjs(events[0].timestamp).fromNow();
    }

    const response = prepare('subs', {
      lastSubAgo: lastSubAgo,
      lastSubUsername: lastSubUsername,
      onlineSubCount: onlineSubscribers.length,
    });
    return [ { response, ...opts }];
  }

  @command('!title')
  async getTitle (opts: CommandOptions) {
    return [ { response: translate('title.current').replace(/\$title/g, api.stats.currentTitle || 'n/a'), ...opts }];
  }

  @command('!title set')
  @default_permission(permission.CASTERS)
  async setTitle (opts: CommandOptions) {
    if (opts.parameters.length === 0) {
      return [ { response: await translate('title.current').replace(/\$title/g, api.stats.currentTitle || 'n/a'), ...opts }];
    }
    const status = await api.setTitleAndGame({ title: opts.parameters });
    return status ? [ { response: status.response, ...opts } ] : [];
  }

  @command('!game')
  async getGame (opts: CommandOptions) {
    return [ { response: translate('game.current').replace(/\$title/g, api.stats.currentGame || 'n/a'), ...opts }];
  }

  @command('!game set')
  @default_permission(permission.CASTERS)
  async setGame (opts: CommandOptions) {
    if (opts.parameters.length === 0) {
      return [ { response: translate('game.current').replace(/\$title/g, api.stats.currentGame || 'n/a'), ...opts }];
    }
    const games = await api.sendGameFromTwitch(null, opts.parameters);
    if (Array.isArray(games) && games.length > 0) {
      const exactMatchIdx = games.findIndex(name => name.toLowerCase() === opts.parameters.toLowerCase());
      const status = await api.setTitleAndGame({ game: games[exactMatchIdx !== -1 ? exactMatchIdx : 0] });
      return status ? [ { response: status.response, ...opts } ] : [];
    }
    return [{ response: translate('game.change.failed').replace(/\$title/g, api.stats.currentGame || 'n/a'), ...opts }];
  }
}

export default new Twitch();
