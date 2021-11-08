'use strict';

import { PointsChangelog } from '@entity/points';
import { User, UserInterface } from '@entity/user';
import { MINUTE } from '@sogebot/ui-helpers/constants';
import { format } from '@sogebot/ui-helpers/number';
import * as cronparser from 'cron-parser';
import {
  FindConditions, getConnection, getRepository, LessThanOrEqual,
} from 'typeorm';

import {
  command, default_permission, parser, permission_settings, persistent, settings,
} from '../decorators';
import {
  onChange, onLoad, onStartup,
} from '../decorators/on';
import Expects from '../expects';
import general from '../general.js';
import users from '../users';
import System from './_interface';

import { isStreamOnline } from '~/helpers/api';
import { prepare } from '~/helpers/commons';
import { getAllOnlineIds } from '~/helpers/getAllOnlineUsernames';
import {
  debug, error, warning,
} from '~/helpers/log';
import { ParameterError } from '~/helpers/parameterError';
import { getUserHighestPermission } from '~/helpers/permissions/index';
import { defaultPermissions } from '~/helpers/permissions/index';
import { getPointsName, name } from '~/helpers/points/index';
import { adminEndpoint } from '~/helpers/socket';
import * as changelog from '~/helpers/user/changelog.js';
import { isBot, isBotId } from '~/helpers/user/isBot';
import { getIdFromTwitch } from '~/services/twitch/calls/getIdFromTwitch';
import { translate } from '~/translate';
import { variables } from '~/watchers';

class Points extends System {
  cronTask: any = null;
  isLoaded: string[] = [];

  @settings('reset')
  isPointResetIntervalEnabled = false;
  @settings('reset')
  resetIntervalCron = '@monthly';
  @persistent()
  lastCronRun = 0;

  @settings('customization')
  name = 'point|points'; // default is <singular>|<plural> | in some languages can be set with custom <singular>|<x:multi>|<plural> where x <= 10

  @permission_settings('customization')
  interval = 10;

  @permission_settings('customization')
  perInterval = 1;

  @permission_settings('customization')
  offlineInterval = 30;

  @permission_settings('customization')
  perOfflineInterval = 1;

  @permission_settings('customization')
  messageInterval = 5;

  @permission_settings('customization')
  perMessageInterval = 1;

  @permission_settings('customization')
  messageOfflineInterval = 5;

  @permission_settings('customization')
  perMessageOfflineInterval = 0;

  @onLoad('name')
  @onChange('name')
  setPointsName() {
    name.value = this.name;
  }

  @onStartup()
  onStartup() {
    setInterval(() => {
      try {
        const interval = cronparser.parseExpression(this.resetIntervalCron);
        const lastProbableRun = new Date(interval.prev().toISOString()).getTime();
        if (lastProbableRun > this.lastCronRun) {
          if (this.isPointResetIntervalEnabled) {
            warning('Points were reset by cron');
            changelog.flush().then(() => {
              getRepository(User).update({}, { points: 0 });
            });
          } else {
            debug('points.cron', 'Cron would run, but it is disabled.');
          }
          this.lastCronRun = Date.now();
        }
      } catch (e: any) {
        error(e);
      }
    }, MINUTE);
  }

  @onChange('resetIntervalCron')
  @onChange('isPointResetIntervalEnabled')
  resetLastCronRun() {
    this.lastCronRun = Date.now();
  }

  @onLoad('enabled')
  async updatePoints () {
    if (!this.enabled) {
      debug('points.update', 'Disabled, next check in 5s');
      setTimeout(() => this.updatePoints(), 5000);
      return;
    }

    // cleanup all undoes (only 10minutes should be kept)
    await getRepository(PointsChangelog).delete({ updatedAt: LessThanOrEqual(Date.now() - (10 * MINUTE)) });

    const [interval, offlineInterval, perInterval, perOfflineInterval] = await Promise.all([
      this.getPermissionBasedSettingsValue('interval'),
      this.getPermissionBasedSettingsValue('offlineInterval'),
      this.getPermissionBasedSettingsValue('perInterval'),
      this.getPermissionBasedSettingsValue('perOfflineInterval'),
    ]);

    try {
      const userPromises: Promise<void>[] = [];
      debug('points.update', `Started points adding, isStreamOnline: ${isStreamOnline.value}`);
      for (const userId of (await getAllOnlineIds())) {
        if (isBotId(userId)) {
          continue;
        }
        userPromises.push(this.processPoints(userId, {
          interval, offlineInterval, perInterval, perOfflineInterval, isStreamOnline: isStreamOnline.value,
        }));
        await Promise.all(userPromises);
      }
    } catch (e: any) {
      error(e);
      error(e.stack);
    } finally {
      debug('points.update', 'Finished points adding, triggering next check in 60s');
      setTimeout(() => this.updatePoints(), 60000);
    }
  }

  private async processPoints(userId: string, opts: {interval: {[permissionId: string]: any}; offlineInterval: {[permissionId: string]: any}; perInterval: {[permissionId: string]: any}; perOfflineInterval: {[permissionId: string]: any}; isStreamOnline: boolean}): Promise<void> {
    const user = await changelog.get(userId);
    if (!user) {
      return;
    }

    // get user max permission
    const permId = await getUserHighestPermission(userId);
    if (!permId) {
      debug('points.update', `User ${user.userName}#${userId} permId not found`);
      return; // skip without id
    }

    const interval_calculated = opts.isStreamOnline ? opts.interval[permId] * 60 * 1000 : opts.offlineInterval[permId]  * 60 * 1000;
    const ptsPerInterval = opts.isStreamOnline ? opts.perInterval[permId]  : opts.perOfflineInterval[permId] ;

    const chat = await users.getChatOf(userId, opts.isStreamOnline);
    const userPointsKey = opts.isStreamOnline ? 'pointsOnlineGivenAt' : 'pointsOfflineGivenAt';
    if (interval_calculated !== 0 && ptsPerInterval[permId]  !== 0) {
      const givenAt = user[userPointsKey] + interval_calculated;
      debug('points.update', `${user.userName}#${userId}[${permId}] ${chat} | ${givenAt}`);

      let modifier = 0;
      let userTimePoints = givenAt + interval_calculated;
      for (; userTimePoints <= chat; userTimePoints += interval_calculated) {
        modifier++;
      }
      if (modifier > 0) {
        // add points to user[userPointsKey] + interval to user to not overcalculate (this should ensure recursive add points in time)
        debug('points.update', `${user.userName}#${userId}[${permId}] +${Math.floor(ptsPerInterval * modifier)}`);
        changelog.update(userId, {
          ...user,
          points:          user.points + ptsPerInterval * modifier,
          [userPointsKey]: userTimePoints,
        });
      }
    } else {
      changelog.update(userId, {
        ...user,
        [userPointsKey]: chat,
      });
      debug('points.update', `${user.userName}#${userId}[${permId}] points disabled or interval is 0, settint points time to chat`);
    }
  }

  @parser({ fireAndForget: true, skippable: true })
  async messagePoints (opts: ParserOptions) {
    if (!opts.sender || opts.skip || opts.message.startsWith('!')) {
      return true;
    }

    const [perMessageInterval, messageInterval, perMessageOfflineInterval, messageOfflineInterval] = await Promise.all([
      this.getPermissionBasedSettingsValue('perMessageInterval'),
      this.getPermissionBasedSettingsValue('messageInterval'),
      this.getPermissionBasedSettingsValue('perMessageOfflineInterval'),
      this.getPermissionBasedSettingsValue('messageOfflineInterval'),
    ]);

    // get user max permission
    const permId = await getUserHighestPermission(opts.sender.userId);
    if (!permId) {
      return true; // skip without permission
    }

    const interval_calculated = isStreamOnline.value ? messageInterval[permId] : messageOfflineInterval[permId];
    const ptsPerInterval = isStreamOnline.value ? perMessageInterval[permId] : perMessageOfflineInterval[permId];

    if (interval_calculated === 0 || ptsPerInterval === 0) {
      return;
    }

    const user = await changelog.get(opts.sender.userId);
    if (!user) {
      return true;
    }

    if (user.pointsByMessageGivenAt + interval_calculated <= user.messages) {
      changelog.update(opts.sender.userId, {
        ...user,
        points:                 user.points + ptsPerInterval,
        pointsByMessageGivenAt: user.messages,
      });
    }
    return true;
  }

  sockets () {
    adminEndpoint(this.nsp, 'parseCron', (cron, cb) => {
      try {
        const interval = cronparser.parseExpression(cron);
        // get 5 dates
        const intervals: number[] = [];
        for (let i = 0; i < 5; i++) {
          intervals.push(new Date(interval.next().toISOString()).getTime());
        }
        cb(null, intervals);
      } catch (e: any) {
        cb(e.message, []);
      }
    });

    adminEndpoint(this.nsp, 'reset', async () => {
      changelog.flush().then(() => {
        getRepository(PointsChangelog).clear();
        getRepository(User).update({}, { points: 0 });
      });
    });
  }

  maxSafeInteger(number: number) {
    return number <= Number.MAX_SAFE_INTEGER
      ? number
      : Number.MAX_SAFE_INTEGER;
  }

  async getPointsOf(userId: string) {
    const user = await changelog.get(userId);

    if (user) {
      if (user.points < 0) {
        changelog.update(userId, {
          ...user,
          points: 0,
        });
      }
      return user.points <= Number.MAX_SAFE_INTEGER
        ? user.points
        : Number.MAX_SAFE_INTEGER;
    } else {
      return 0;
    }
  }

  @command('!points undo')
  @default_permission(defaultPermissions.CASTERS)
  async undo(opts: CommandOptions) {
    try {
      const [username] = new Expects(opts.parameters).username().toArray();
      const userId = await users.getIdByName(username);
      if (!userId) {
        throw new Error(`User ${username} not found in database`);
      }

      const undoOperation = await getRepository(PointsChangelog).findOne({
        where: { userId },
        order: { updatedAt: 'DESC' },
      });
      if (!undoOperation) {
        throw new Error(`No undo operation found for ` + username);
      }

      await getRepository(PointsChangelog).delete({ id: undoOperation.id });
      changelog.update(userId, { points: undoOperation.originalValue });

      return [{
        response: prepare('points.success.undo', {
          username,
          command:                   undoOperation.command,
          originalValue:             format(general.numberFormat, 0)(undoOperation.originalValue),
          originalValuePointsLocale: getPointsName(undoOperation.originalValue),
          updatedValue:              format(general.numberFormat, 0)(undoOperation.updatedValue),
          updatedValuePointsLocale:  getPointsName(undoOperation.updatedValue),
        }), ...opts,
      }];
    } catch (err: any) {
      error(err);
      return [{ response: translate('points.failed.undo').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points set')
  @default_permission(defaultPermissions.CASTERS)
  async set (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userName, points] = new Expects(opts.parameters).username().points({ all: false }).toArray();

      await changelog.flush();
      const originalUser = await getRepository(User).findOne({ userName });
      if (!originalUser) {
        throw new Error(`User ${userName} not found in database.`);
      }
      changelog.update(originalUser.userId, { points });
      await getRepository(PointsChangelog).insert({
        userId:        originalUser.userId,
        updatedAt:     Date.now(),
        command:       'set',
        originalValue: originalUser.points,
        updatedValue:  points,
      });

      const response = prepare('points.success.set', {
        amount:     format(general.numberFormat, 0)(points),
        username:   userName,
        pointsName: getPointsName(points),
      });
      return [{ response, ...opts }];
    } catch (err: any) {
      error(err);
      return [{ response: translate('points.failed.set').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points give')
  async give (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userName, points] = new Expects(opts.parameters).username().points({ all: true }).toArray();
      if (opts.sender.userName.toLowerCase() === userName.toLowerCase()) {
        return [];
      }
      await changelog.flush();
      const guser = await getRepository(User).findOne({ userName });
      const sender = await changelog.get(opts.sender.userId);

      if (!sender) {
        throw new Error('Sender was not found in DB!');
      }

      if (!guser) {
        changelog.update(await getIdFromTwitch(userName), { userName });
        return this.give(opts);
      }

      const availablePoints = sender.points;
      if (points === 0 || points === 'all' && availablePoints === 0) {
        const response = prepare('points.failed.cannotGiveZeroPoints'.replace('$command', opts.command), {
          amount:     0,
          username:   userName,
          pointsName: getPointsName(0),
        });
        return [{ response, ...opts }];
      }

      if (points !== 'all' && availablePoints < points) {
        const response = prepare('points.failed.giveNotEnough'.replace('$command', opts.command), {
          amount:     format(general.numberFormat, 0)(points),
          username:   userName,
          pointsName: getPointsName(points),
        });
        return [{ response, ...opts }];
      } else if (points === 'all') {
        changelog.increment(guser.userId, { points: availablePoints });
        changelog.update(sender.userId, { points: 0 });
        const response = prepare('points.success.give', {
          amount:     format(general.numberFormat, 0)(availablePoints),
          userName,
          pointsName: getPointsName(availablePoints),
        });
        return [{ response, ...opts }];
      } else {
        changelog.increment(guser.userId, { points: points });
        changelog.increment(sender.userId, { points: -points });
        const response = prepare('points.success.give', {
          amount:     format(general.numberFormat, 0)(points),
          userName,
          pointsName: getPointsName(points),
        });
        return [{ response, ...opts }];
      }
    } catch (err: any) {
      return [{ response: translate('points.failed.give').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points get')
  @default_permission(defaultPermissions.CASTERS)
  async get (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userName] = new Expects(opts.parameters).username({ optional: true, default: opts.sender.userName }).toArray();

      let user: Readonly<Required<UserInterface>> | null;
      if (opts.sender.userName === userName) {
        user = await changelog.get(opts.sender.userId);
      } else {
        await changelog.flush();
        user = await getRepository(User).findOne({ userName }) ?? null;
      }

      if (!user) {
        const userId = await getIdFromTwitch(userName);
        if (userId) {
          changelog.update(userId, { userName });
          return this.get(opts);
        } else {
          throw new Error(`User ${userName} not found on twitch`);
        }
      }

      const connection = await getConnection();

      const broadcasterUsername = variables.get('services.twitch.broadcasterUsername') as string;
      const query = (type: typeof connection.options.type) => {
        switch(type) {
          case 'postgres':
          case 'better-sqlite3':
            return `SELECT COUNT(*) as "order" FROM "user" WHERE "points" > (SELECT "points" FROM "user" WHERE "userId"='${user?.userId}') AND "userName"!='${broadcasterUsername}'`;
          case 'mysql':
          case 'mariadb':
          default:
            return `SELECT COUNT(*) as \`order\` FROM \`user\` WHERE \`points\` > (SELECT \`points\` FROM \`user\` WHERE \`userId\`='${user?.userId}') AND "userName"!='${broadcasterUsername}'`;
        }
      };

      await changelog.flush();
      const orderQuery = await getRepository(User).query(query(connection.options.type));
      const count = await getRepository(User).count();

      let order: number | string = '?';
      if (orderQuery.length > 0) {
        order = Number(orderQuery[0].order) + 1;
      }

      if (user.userName === broadcasterUsername) {
        order = '?'; // broadcaster is removed from ordering
      }

      const response = prepare('points.defaults.pointsResponse', {
        amount:     format(general.numberFormat, 0)(this.maxSafeInteger(user.points)),
        username:   userName,
        pointsName: getPointsName(this.maxSafeInteger(user.points)),
        order, count,
      });
      return [{ response, ...opts }];
    } catch (err: any) {
      if (!(err instanceof ParameterError)) {
        error(err.stack);
      }
      return [{ response: translate('points.failed.get').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points online')
  @default_permission(defaultPermissions.CASTERS)
  async online (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      let points = new Expects(opts.parameters).points({ all: false, negative: true }).toArray()[0];

      let response: string;
      if (points >= 0) {
        await changelog.flush();
        await getRepository(User).increment({}, 'points', points);
        response = prepare('points.success.online.positive', {
          amount:     format(general.numberFormat, 0)(points),
          pointsName: getPointsName(points),
        });
      } else {
        points = Math.abs(points);
        await this.decrement({}, points);
        response = prepare('points.success.online.negative', {
          amount:     `-${format(general.numberFormat, 0)(points)}`,
          pointsName: getPointsName(points),
        });
      }

      return [{ response, ...opts }];
    } catch (err: any) {
      return [{ response: translate('points.failed.online').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points all')
  @default_permission(defaultPermissions.CASTERS)
  async all (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      let points: number = new Expects(opts.parameters).points({ all: false, negative: true }).toArray()[0];
      let response: string;
      if (points >= 0) {
        await changelog.flush();
        await getRepository(User).increment({}, 'points', points);
        response = prepare('points.success.all.positive', {
          amount:     format(general.numberFormat, 0)(points),
          pointsName: getPointsName(points),
        });
      } else {
        points = Math.abs(points);
        await this.decrement({}, points);
        response = prepare('points.success.all.negative', {
          amount:     `-${format(general.numberFormat, 0)(points)}`,
          pointsName: getPointsName(points),
        });
      }

      return [{ response, ...opts }];
    } catch (err: any) {
      return [{ response: translate('points.failed.all').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!makeitrain')
  @default_permission(defaultPermissions.CASTERS)
  async rain (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const points = new Expects(opts.parameters).points({ all: false }).toArray()[0];
      await changelog.flush();

      for (const user of (await getRepository(User).find({ isOnline: true }))) {
        if (isBot(user.userName)) {
          continue;
        }

        changelog.increment(user.userId, { points: Math.floor(Math.random() * points) });
      }
      const response = prepare('points.success.rain', {
        amount:     format(general.numberFormat, 0)(points),
        pointsName: getPointsName(points),
      });
      return [{ response, ...opts }];
    } catch (err: any) {
      return [{ response: translate('points.failed.rain').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points add')
  @default_permission(defaultPermissions.CASTERS)
  async add (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userName, points] = new Expects(opts.parameters).username().points({ all: false }).toArray();

      await changelog.flush();
      const user = await getRepository(User).findOne({ userName });

      if (!user) {
        changelog.update(await getIdFromTwitch(userName), { userName });
        return this.add(opts);
      } else {
        changelog.increment(user.userId, { points });
      }

      await getRepository(PointsChangelog).insert({
        userId:        user.userId,
        command:       'add',
        originalValue: user.points,
        updatedValue:  user.points + points,
        updatedAt:     Date.now(),
      });

      const response = prepare('points.success.add', {
        amount:     format(general.numberFormat, 0)(points),
        username:   userName,
        pointsName: getPointsName(points),
      });
      return [{ response, ...opts }];
    } catch (err: any) {
      return [{ response: translate('points.failed.add').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points remove')
  @default_permission(defaultPermissions.CASTERS)
  async remove (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userName, points] = new Expects(opts.parameters).username().points({ all: true }).toArray();

      await changelog.flush();
      const user = await getRepository(User).findOne({ userName });
      if (!user) {
        changelog.update(await getIdFromTwitch(userName), { userName });
        return this.remove(opts);
      }

      if (points === 'all') {
        changelog.update(user.userId, { points: 0 });
      } else {
        changelog.update(user.userId, { points: Math.max(user.points - points, 0) });
      }

      await getRepository(PointsChangelog).insert({
        userId:        user.userId,
        command:       'remove',
        originalValue: user.points,
        updatedValue:  points === 'all' ? 0 : Math.max(user.points - points, 0),
        updatedAt:     Date.now(),
      });

      const response = prepare('points.success.remove', {
        amount:     format(general.numberFormat, 0)(points),
        username:   userName,
        pointsName: getPointsName(points === 'all' ? 0 : points),
      });
      return [{ response, ...opts }];
    } catch (err: any) {
      error(err);
      return [{ response: translate('points.failed.remove').replace('$command', opts.command), ...opts }];
    }
  }

  @command('!points')
  async main (opts: CommandOptions): Promise<CommandResponse[]> {
    return this.get(opts);
  }

  async decrement(where: FindConditions<Readonly<Required<UserInterface>>>, points: number) {
    await changelog.flush();
    await getRepository(User).decrement(where, 'points', points);
    await getRepository(User).createQueryBuilder()
      .update(User)
      .set({ points: 0 })
      .where('points < 0')
      .execute();
  }
}

export default new Points();
