import _ from 'lodash';
import XRegExp from 'xregexp';

import { isOwner, prepare, sendMessage } from '../commons';
import * as constants from '../constants';
import { command, default_permission, parser, rollback, settings } from '../decorators';
import Expects from '../expects';
import Parser from '../parser';
import { permission } from '../permissions';
import System from './_interface';

import { getRepository } from 'typeorm';
import { Cooldown as CooldownEntity, CooldownViewer } from '../entity/cooldown';
import { adminEndpoint } from '../helpers/socket';

/*
 * !cooldown [keyword|!command] [global|user] [seconds] [true/false] - set cooldown for keyword or !command - 0 for disable, true/false set quiet mode
 * !cooldown toggle moderators [keyword|!command] [global|user]      - enable/disable specified keyword or !command cooldown for moderators
 * !cooldown toggle owners [keyword|!command] [global|user]          - enable/disable specified keyword or !command cooldown for owners
 * !cooldown toggle subscribers [keyword|!command] [global|user]     - enable/disable specified keyword or !command cooldown for owners
 * !cooldown toggle followers [keyword|!command] [global|user]       - enable/disable specified keyword or !command cooldown for owners
 * !cooldown toggle enabled [keyword|!command] [global|user]         - enable/disable specified keyword or !command cooldown
 */

class Cooldown extends System {
  @settings()
  cooldownNotifyAsWhisper = false;

  @settings()
  cooldownNotifyAsChat = true;

  constructor () {
    super();
    this.addMenu({ category: 'manage', name: 'cooldown', id: 'manage/cooldowns/list' });
  }

  sockets () {
    adminEndpoint(this.nsp, 'cooldown::save', async (dataset: CooldownEntity, cb) => {
      const item = await getRepository(CooldownEntity).save(dataset);
      cb(null, item);
    });
    adminEndpoint(this.nsp, 'cooldown::deleteById', async (id, cb) => {
      await getRepository(CooldownEntity).delete({ id });
      cb();
    });
    adminEndpoint(this.nsp, 'cooldown::getAll', async (cb) => {
      const cooldown = await getRepository(CooldownEntity).find({
        order: {
          key: 'ASC',
        },
      });
      cb(cooldown);
    });
    adminEndpoint(this.nsp, 'cooldown::getById', async (id, cb) => {
      const cooldown = await getRepository(CooldownEntity).findOne({
        where: { id },
      });
      if (!cooldown) {
        cb('Cooldown not found');
      } else {
        cb(null, cooldown);
      }
    });
  }

  @command('!cooldown')
  @default_permission(permission.CASTERS)
  async main (opts: Record<string, any>) {
    const match = XRegExp.exec(opts.parameters, constants.COOLDOWN_REGEXP_SET) as unknown as { [x: string]: string } | null;;

    if (_.isNil(match)) {
      const message = await prepare('cooldowns.cooldown-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    let cooldown = await getRepository(CooldownEntity).findOne({ where: { key: match.command, type: match.type } });
    if (parseInt(match.seconds, 10) === 0) {
      if (cooldown) {
        await getRepository(CooldownEntity).remove(cooldown);
      }
      const message = await prepare('cooldowns.cooldown-was-unset', { type: match.type, command: match.command });
      sendMessage(message, opts.sender, opts.attr);
      return;
    }

    if (!cooldown) {
      cooldown = new CooldownEntity();
    }

    cooldown = {
      ...cooldown,
      key: match.command,
      miliseconds: parseInt(match.seconds, 10) * 1000,
      type: (match.type as 'global' | 'user'),
      timestamp: 0,
      lastTimestamp: 0,
      isErrorMsgQuiet: _.isNil(match.quiet) ? false : !!match.quiet,
      isEnabled: true,
      isOwnerAffected: false,
      isModeratorAffected: false,
      isSusbcriberAffected: true,
      isFollowerAffected: true,
    };
    await getRepository(CooldownEntity).save(cooldown);

    const message = await prepare('cooldowns.cooldown-was-set', { seconds: match.seconds, type: match.type, command: match.command });
    sendMessage(message, opts.sender, opts.attr);
  }

  @parser({ priority: constants.HIGH })
  async check (opts: Record<string, any>) {
    let data: CooldownEntity[];
    let viewer: CooldownViewer | undefined;
    let timestamp, now;
    const [command, subcommand] = new Expects(opts.message)
      .command({ optional: true })
      .string({ optional: true })
      .toArray();

    if (!_.isNil(command)) { // command
      let key = subcommand ? `${command} ${subcommand}` : command;
      const parsed = await (new Parser().find(subcommand ? `${command} ${subcommand}` : command, null));
      if (parsed) {
        key = parsed.command;
      } else {
        // search in custom commands as well
        if (global.systems.customCommands.enabled) {
          const foundCommands = await global.systems.customCommands.find(subcommand ? `${command} ${subcommand}` : command);
          if (foundCommands.length > 0) {
            key = foundCommands[0].command.command;
          }
        }
      }

      const cooldown = await getRepository(CooldownEntity).findOne({ where: { key }, relations: ['viewers'] });
      if (!cooldown) { // command is not on cooldown -> recheck with text only
        const replace = new RegExp(`${XRegExp.escape(key)}`, 'ig');
        opts.message = opts.message.replace(replace, '');
        if (opts.message.length > 0) {
          return this.check(opts);
        } else {
          return true;
        }
      }
      data = [cooldown];
    } else { // text
      let [keywords, cooldowns] = await Promise.all([
        global.db.engine.find(global.systems.keywords.collection.data),
        await getRepository(CooldownEntity).find({ relations: ['viewers'] }),
      ]);

      keywords = _.filter(keywords, function (o) {
        return opts.message.toLowerCase().search(new RegExp('^(?!\\!)(?:^|\\s).*(' + _.escapeRegExp(o.keyword.toLowerCase()) + ')(?=\\s|$|\\?|\\!|\\.|\\,)', 'gi')) >= 0;
      });

      data = [];
      _.each(keywords, (keyword) => {
        const cooldown = _.find(cooldowns, (o) => o.key.toLowerCase() === keyword.keyword.toLowerCase());
        if (keyword.enabled && cooldown) {
          data.push(cooldown);
        }
      });
    }
    if (!_.some(data, { isEnabled: true })) { // parse ok if all cooldowns are disabled
      return true;
    }

    const user = await global.users.getById(opts.sender.userId);
    let result = false;
    const isMod = typeof opts.sender.badges.moderator !== 'undefined';
    const isSubscriber = typeof opts.sender.badges.subscriber !== 'undefined';
    const isFollower = user.is && user.is.follower ? user.is.follower : false;
    for (const cooldown of data) {
      if ((isOwner(opts.sender) && !cooldown.isOwnerAffected) || (isMod && !cooldown.isModeratorAffected) || (isSubscriber && !cooldown.isSusbcriberAffected) || (isFollower && !cooldown.isFollowerAffected)) {
        result = true;
        continue;
      }

      viewer = cooldown.viewers.find(o => o.username === opts.sender.username);
      if (cooldown.type === 'global') {
        timestamp = cooldown.timestamp ?? 0;
      } else {
        timestamp = viewer?.timestamp ?? 0;
      }
      now = Date.now();

      if (now - timestamp >= cooldown.miliseconds) {
        if (cooldown.type === 'global') {
          cooldown.lastTimestamp = timestamp;
          cooldown.timestamp = now;
        } else {
          let viewer = cooldown.viewers.find(o => o.username === opts.sender.username);
          if (!viewer) {
            viewer = new CooldownViewer();
            cooldown.viewers.push(viewer);
          }
          viewer.username = opts.sender.username;
          viewer.lastTimestamp = timestamp;
          viewer.timestamp = now;
        }
        await getRepository(CooldownEntity).save(cooldown);
        result = true;
        continue;
      } else {
        if (!cooldown.isErrorMsgQuiet && this.cooldownNotifyAsWhisper) {
          opts.sender['message-type'] = 'whisper'; // we want to whisp cooldown message
          const message = await prepare('cooldowns.cooldown-triggered', { command: cooldown.key, seconds: Math.ceil((cooldown.miliseconds - now + timestamp) / 1000) });
          await sendMessage(message, opts.sender, opts.attr);
        }
        if (!cooldown.isErrorMsgQuiet && this.cooldownNotifyAsChat) {
          opts.sender['message-type'] = 'chat';
          const message = await prepare('cooldowns.cooldown-triggered', { command: cooldown.key, seconds: Math.ceil((cooldown.miliseconds - now + timestamp) / 1000) });
          await sendMessage(message, opts.sender, opts.attr);
        }
        result = false;
        break; // disable _.each and updateQueue with false
      }
    }
    return result;
  }

  @rollback()
  async cooldownRollback (opts: Record<string, any>) {
    // TODO: redundant duplicated code (search of cooldown), should be unified for check and cooldownRollback
    let data: CooldownEntity[];

    const [command, subcommand] = new Expects(opts.message)
      .command({ optional: true })
      .string({ optional: true })
      .toArray();

    if (!_.isNil(command)) { // command
      let key = subcommand ? `${command} ${subcommand}` : command;
      const parsed = await (new Parser().find(subcommand ? `${command} ${subcommand}` : command));
      if (parsed) {
        key = parsed.command;
      } else {
        // search in custom commands as well
        if (global.systems.customCommands.enabled) {
          const foundCommands = await global.systems.customCommands.find(subcommand ? `${command} ${subcommand}` : command);
          if (foundCommands.length > 0) {
            key = foundCommands[0].command.command;
          }
        }
      }

      const cooldown = await getRepository(CooldownEntity).findOne({ where: { key }});
      if (!cooldown) { // command is not on cooldown -> recheck with text only
        const replace = new RegExp(`${XRegExp.escape(key)}`, 'ig');
        opts.message = opts.message.replace(replace, '');
        if (opts.message.length > 0) {
          return this.cooldownRollback(opts);
        } else {
          return true;
        }
      }
      data = [cooldown];
    } else { // text
      let [keywords, cooldowns] = await Promise.all([
        global.db.engine.find(global.systems.keywords.collection.data),
        await getRepository(CooldownEntity).find({ relations: ['viewers'] }),
      ]);

      keywords = _.filter(keywords, function (o) {
        return opts.message.toLowerCase().search(new RegExp('^(?!\\!)(?:^|\\s).*(' + _.escapeRegExp(o.keyword.toLowerCase()) + ')(?=\\s|$|\\?|\\!|\\.|\\,)', 'gi')) >= 0;
      });

      data = [];
      _.each(keywords, (keyword) => {
        const cooldown = _.find(cooldowns, (o) => o.key.toLowerCase() === keyword.keyword.toLowerCase());
        if (keyword.enabled && cooldown) {
          data.push(cooldown);
        }
      });
    }
    if (!_.some(data, { isEnabled: true })) { // parse ok if all cooldowns are disabled
      return true;
    }

    const user = await global.users.getById(opts.sender.userId);
    const isMod = typeof opts.sender.badges.moderator !== 'undefined';
    const isSubscriber = typeof opts.sender.badges.subscriber !== 'undefined';
    const isFollower = user.is && user.is.follower ? user.is.follower : false;

    for (const cooldown of data) {
      if ((isOwner(opts.sender) && !cooldown.isOwnerAffected) || (isMod && !cooldown.isModeratorAffected) || (isSubscriber && !cooldown.isSusbcriberAffected) || (isFollower && !cooldown.isFollowerAffected)) {
        continue;
      }

      if (cooldown.type === 'global') {
        cooldown.lastTimestamp = cooldown.lastTimestamp ?? 0;
        cooldown.timestamp = cooldown.lastTimestamp ?? 0;
      } else {
        let viewer = cooldown.viewers.find(o => o.username === opts.sender.username);
        if (!viewer) {
          viewer = new CooldownViewer();
          cooldown.viewers.push(viewer);
        }
        viewer.username = opts.sender.username;
        viewer.lastTimestamp = viewer.lastTimestamp ?? 0;
        viewer.timestamp = viewer.lastTimestamp ?? 0;
      }
      // rollback to lastTimestamp
      await getRepository(CooldownEntity).save(cooldown);
    }
  }

  async toggle (opts: Record<string, any>, type: string) {
    const match = XRegExp.exec(opts.parameters, constants.COOLDOWN_REGEXP) as unknown as { [x: string]: string } | null;

    if (_.isNil(match)) {
      const message = await prepare('cooldowns.cooldown-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    const cooldown = await getRepository(CooldownEntity).findOne({ relations: ['viewers'], where: { key: match.command, type: match.type } });
    if (!cooldown) {
      const message = await prepare('cooldowns.cooldown-not-found', { command: match.command });
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    if (type === 'type') {
      cooldown[type] = cooldown[type] === 'global' ? 'user' : 'global';
    } else {
      cooldown[type] = !cooldown[type];
    }

    await getRepository(CooldownEntity).save(cooldown);

    let path = '';
    const status = cooldown[type] ? 'enabled' : 'disabled';

    if (type === 'isModeratorAffected') {
      path = '-for-moderators';
    }
    if (type === 'isOwnerAffected') {
      path = '-for-owners';
    }
    if (type === 'isSusbcriberAffected') {
      path = '-for-subscribers';
    }
    if (type === 'isFollowerAffected') {
      path = '-for-followers';
    }
    if (type === 'isErrorMsgQuiet' || type === 'type') {
      return;
    } // those two are setable only from dashboard

    const message = await prepare(`cooldowns.cooldown-was-${status}${path}`, { command: cooldown.key });
    sendMessage(message, opts.sender, opts.attr);
  }

  @command('!cooldown toggle enabled')
  @default_permission(permission.CASTERS)
  async toggleEnabled (opts: Record<string, any>) {
    await this.toggle(opts, 'isEnabled');
  }

  @command('!cooldown toggle moderators')
  @default_permission(permission.CASTERS)
  async toggleModerators (opts: Record<string, any>) {
    await this.toggle(opts, 'isModeratorAffected');
  }

  @command('!cooldown toggle owners')
  @default_permission(permission.CASTERS)
  async toggleOwners (opts: Record<string, any>) {
    await this.toggle(opts, 'isOwnerAffected');
  }

  @command('!cooldown toggle subscribers')
  @default_permission(permission.CASTERS)
  async toggleSubscribers (opts: Record<string, any>) {
    await this.toggle(opts, 'isSusbcriberAffected');
  }

  @command('!cooldown toggle followers')
  @default_permission(permission.CASTERS)
  async toggleFollowers (opts: Record<string, any>) {
    await this.toggle(opts, 'isFollowerAffected');
  }

  async toggleNotify (opts: Record<string, any>) {
    await this.toggle(opts, 'isErrorMsgQuiet');
  }
  async toggleType (opts: Record<string, any>) {
    await this.toggle(opts, 'type');
  }
}

export default Cooldown;
export { Cooldown };