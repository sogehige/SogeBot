import util from 'util';

import * as constants from '@sogebot/ui-helpers/constants';
import { getLocalizedName } from '@sogebot/ui-helpers/getLocalized';
import { StaticAuthProvider } from '@twurple/auth';
import {
  ChatClient, ChatCommunitySubInfo, ChatSubGiftInfo, ChatSubInfo, ChatUser,
} from '@twurple/chat';
import { isNil } from 'lodash';
import { getRepository } from 'typeorm';

import Core from './_interface';
import api from './api';
import { parserReply } from './commons';
import type { EmitData } from './database/entity/alert';
import { Price } from './database/entity/price';
import { UserBit, UserBitInterface } from './database/entity/user';
import { settings, timer } from './decorators';
import { command, default_permission } from './decorators';
import {
  getFunctionList, onChange, onLoad, onStreamStart,
} from './decorators/on';
import Expects from './expects';
import { isStreamOnline, stats } from './helpers/api';
import * as hypeTrain from './helpers/api/hypeTrain';
import {
  getOwner, getUserSender, prepare,
} from './helpers/commons';
import { sendMessage } from './helpers/commons/sendMessage';
import { dayjs } from './helpers/dayjs';
import { eventEmitter } from './helpers/events';
import {
  triggerInterfaceOnBit, triggerInterfaceOnMessage, triggerInterfaceOnSub,
} from './helpers/interface/triggers';
import { warning } from './helpers/log';
import {
  chatIn, cheer, debug, error, host, info, raid, resub, sub, subcommunitygift, subgift, whisperIn,
} from './helpers/log';
import { generalChannel } from './helpers/oauth/generalChannel';
import { linesParsedIncrement, setStatus } from './helpers/parser';
import { defaultPermissions } from './helpers/permissions';
import {
  globalIgnoreListExclude, ignorelist, sendWithMe, setMuteStatus, showWithAt, tmiEmitter,
} from './helpers/tmi';
import { isOwner } from './helpers/user';
import * as changelog from './helpers/user/changelog.js';
import { isBot, isBotId } from './helpers/user/isBot';
import { isIgnored } from './helpers/user/isIgnored';
import { getUserFromTwitch } from './microservices/getUserFromTwitch';
import oauth from './oauth';
import eventlist from './overlays/eventlist';
import { Parser } from './parser';
import alerts from './registries/alerts';
import alias from './systems/alias';
import customcommands from './systems/customcommands';
import { translate } from './translate';
import users from './users';
import joinpart from './widgets/joinpart';

const commandRegexp = new RegExp(/^!\w+$/);
class TMI extends Core {
  shouldConnect = false;

  @settings('chat')
  sendWithMe = false;

  @settings('chat')
  sendAsReply = true;

  @settings('chat')
  ignorelist: any[] = [];

  @settings('chat')
  globalIgnoreListExclude: any[] = [];

  @settings('chat')
  showWithAt = true;

  @settings('chat')
  mute = false;

  @settings('chat')
  whisperListener = false;

  channel = '';
  timeouts: Record<string, any> = {};
  client: {
    bot: ChatClient | null;
    broadcaster: ChatClient | null;
  } = {
    bot:         null,
    broadcaster: null,
  };
  broadcasterWarning = false;
  botWarning = false;

  ignoreGiftsFromUser = new Map<string, number>();

  constructor() {
    super();
    this.emitter();
  }

  emitter() {
    if (!tmiEmitter) {
      setTimeout(() => this.emitter(), 10);
      return;
    }
    tmiEmitter.on('reconnect', (type) => {
      this.reconnect(type);
    });
    tmiEmitter.on('part', (type) => {
      this.part(type);
    });
  }

  @onChange('showWithAt')
  @onLoad('showWithAt')
  setShowWithAt() {
    showWithAt.value = this.showWithAt;
  }

  @onChange('sendWithMe')
  @onLoad('sendWithMe')
  setSendWithMe() {
    sendWithMe.value = this.sendWithMe;
  }

  @onChange('ignorelist')
  @onLoad('ignorelist')
  setIgnoreList() {
    ignorelist.value = this.ignorelist;
  }

  @onChange('globalIgnoreListExclude')
  @onLoad('globalIgnoreListExclude')
  setGlobalIgnoreListExclude() {
    globalIgnoreListExclude.value = this.globalIgnoreListExclude;
  }

  @onChange('mute')
  @onLoad('mute')
  setMuteStatus() {
    setMuteStatus(this.mute);
  }

  @command('!ignore add')
  @default_permission(defaultPermissions.CASTERS)
  async ignoreAdd (opts: CommandOptions) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase();
      this.ignorelist = [
        ...new Set([
          ...this.ignorelist,
          username,
        ],
        )];
      // update ignore list

      return [{ response: prepare('ignore.user.is.added', { username }), ...opts }];
    } catch (e: any) {
      error(e.stack);
    }
    return [];
  }

  @command('!ignore remove')
  @default_permission(defaultPermissions.CASTERS)
  async ignoreRm (opts: CommandOptions) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase();
      this.ignorelist = this.ignorelist.filter(o => o !== username);
      // update ignore list
      return [{ response: prepare('ignore.user.is.removed', { username }), ...opts }];
    } catch (e: any) {
      error(e.stack);
    }
    return [];
  }

  @command('!ignore check')
  @default_permission(defaultPermissions.CASTERS)
  async ignoreCheck (opts: CommandOptions) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase();
      const isUserIgnored = isIgnored({ userName: username });
      return [{ response: prepare(isUserIgnored ? 'ignore.user.is.ignored' : 'ignore.user.is.not.ignored', { username }), ...opts }];
    } catch (e: any) {
      error(e.stack);
    }
    return [];
  }

  async initClient (type: 'bot' | 'broadcaster') {
    if ((global as any).mocha) {
      // do nothing if tests
      warning('initClient disabled due to mocha test run.');
      return;
    }
    clearTimeout(this.timeouts[`initClient.${type}`]);

    // wait for initial validation
    if (!oauth.initialValidation) {
      setTimeout(() => this.initClient(type), constants.SECOND);
      return;
    }

    const token = type === 'bot' ? oauth.botAccessToken : oauth.broadcasterAccessToken;
    const clientId = type === 'bot' ? oauth.botClientId : oauth.broadcasterClientId;
    const channel = generalChannel.value;

    try {
      if (token === '' || channel === '') {
        throw Error(`${type} - token and channel expected`);
      }

      const client = this.client[type];
      if (client) {
        await this.client[type]?.quit();
        client.removeListener();
        this.client[type] = null;
      }

      const authProvider = new StaticAuthProvider(clientId, token);
      this.client[type] = new ChatClient({ authProvider, isAlwaysMod: true });

      this.loadListeners(type);
      await this.client[type]?.connect();
      setTimeout(() => {
        this.join(type, channel);
      }, 5 * constants.SECOND);
    } catch (e: any) {
      error(e.stack);
      if (type === 'broadcaster' && !this.broadcasterWarning) {
        error('Broadcaster oauth is not properly set - hosts will not be loaded');
        error('Broadcaster oauth is not properly set - subscribers will not be loaded');
        this.broadcasterWarning = true;
      } else if (!this.botWarning) {
        error('Bot oauth is not properly set');
        this.botWarning = true;
      }
      oauth.refreshAccessToken(type).then(() => {
        this.initClient(type);
      });
    }
  }

  @onStreamStart()
  reconnectOnStreamStart() {
    this.part('bot').then(() => this.join('bot', this.channel));
    this.part('broadcaster').then(() => this.join('broadcaster', this.channel));
  }

  /* will connect/reconnect bot and broadcaster
   * this is called from oauth when channel is changed or initialized
   */
  async reconnect (type: 'bot' | 'broadcaster') {
    try {
      if (!this.shouldConnect) {
        setTimeout(() => this.reconnect(type), 1000);
        return;
      }
      const client = this.client[type];
      if (!client) {
        throw Error('TMI: cannot reconnect, connection is not established');
      }
      const channel = generalChannel.value;

      info(`TMI: ${type} is reconnecting`);

      client.removeListener();
      await client.part(this.channel);
      await client.connect();
      this.loadListeners(type);
      await this.join(type, channel);
    } catch (e: any) {
      this.initClient(type); // connect properly
    }
  }

  async join (type: 'bot' | 'broadcaster', channel: string) {
    const client = this.client[type];
    if (!client) {
      info(`TMI: ${type} oauth is not properly set, cannot join`);
    } else {
      if (channel === '') {
        info(`TMI: ${type} is not properly set, cannot join empty channel`);
        if (type ==='bot') {
          setStatus('TMI', constants.DISCONNECTED);
        }
      } else {
        try {
          await client.join(channel);
        } catch (e: unknown) {
          if (e instanceof Error) {
            warning('TMI: ' + e.message + ' for ' + type);
            setTimeout(() => this.join(type, channel), constants.SECOND * 5);
            return;
          }
        }
        info(`TMI: ${type} joined channel ${channel}`);
        if (type ==='bot') {
          setStatus('TMI', constants.CONNECTED);
        }
        this.channel = channel;
      }
    }
  }

  async ban (username: string, type: 'bot' | 'broadcaster' = 'bot' ): Promise<void> {
    const client = this.client[type];
    if (!client && type === 'bot') {
      return this.ban(username, 'broadcaster');
    } else if (!client) {
      error(`TMI: Cannot ban user. Bot/Broadcaster is not connected to TMI.`);
    } else {
      await client.ban(this.channel, username);
      await client.say(this.channel, `/block ${username}`);
      info(`TMI: User ${username} was banned and blocked.`);
      return;
    }
  }

  async part (type: 'bot' | 'broadcaster') {
    const client = this.client[type];
    if (!client) {
      info(`TMI: ${type} is not connected in any channel`);
    } else {
      await client.part(this.channel);
      info(`TMI: ${type} parted channel ${this.channel}`);
    }
  }

  getUsernameFromRaw (raw: string) {
    const match = raw.match(/@([a-z_0-9]*).tmi.twitch.tv/);
    if (match) {
      return match[1];
    } else {
      return null;
    }
  }

  loadListeners (type: 'bot' | 'broadcaster') {
    const client = this.client[type];
    if (!client) {
      error('Cannot init listeners for TMI ' + type + 'client');
      error(new Error().stack || '');
      return;
    }
    client.removeListener();

    // common for bot and broadcaster
    client.onPart((channel, user) => {
      if (isBot(user)) {
        info(`TMI: ${type} is disconnected from channel`);
        setStatus('TMI', constants.DISCONNECTED);
        for (const event of getFunctionList('partChannel')) {
          (this as any)[event.fName]();
        }
      }
    });

    client.onAuthenticationFailure(message => {
      info(`TMI: ${type} authentication failure, ${message}`);
      oauth.refreshAccessToken(type).then(() => this.initClient(type));
    });

    client.onDisconnect((manually, reason) => {
      setStatus('TMI', constants.DISCONNECTED);
      if (manually) {
        reason = new Error('Disconnected manually by user');
      }
      if (reason) {
        info(`TMI: ${type} is disconnected, reason: ${reason}`);
      }
    });

    client.onConnect(() => {
      setStatus('TMI', constants.CONNECTED);
      info(`TMI: ${type} is connected`);
    });

    client.onJoin(async () => {
      setStatus('TMI', constants.CONNECTED);
      for (const event of getFunctionList('joinChannel')) {
        (this as any)[event.fName]();
      }
    });

    if (type === 'bot') {
      client.onWhisper((_user, message, msg) => {
        if (isBotId(msg.userInfo.userId) || self) {
          return;
        }
        this.message({
          userstate: msg.userInfo, message, isWhisper: true, emotesOffsets: msg.emoteOffsets, isAction: false,
        });
        linesParsedIncrement();
      });

      // onCheer
      client.onMessage((channel, user, message, msg) => {
        if (msg.isCheer) {
          this.cheer(msg.userInfo, message, msg.bits);
        }
      });

      client.onAction((channel, user, message, msg) => {
        const userstate = msg.userInfo;
        if (isBotId(userstate.userId)) {
          return;
        }
        // strip message from ACTION
        message = message.replace('\u0001ACTION ', '').replace('\u0001', '');
        this.message({ userstate, message, emotesOffsets: msg.emoteOffsets, isAction: true });
        linesParsedIncrement();
        triggerInterfaceOnMessage({
          sender:    userstate,
          message,
          timestamp: Date.now(),
        });

        eventEmitter.emit('action', { userName: userstate.userName?.toLowerCase() ?? '', source: 'twitch' });
      });

      client.onMessage((_channel, user, message, msg) => {
        const userstate = msg.userInfo;
        if (isBotId(userstate.userId)) {
          return;
        }
        this.message({
          userstate, message, id: msg.id, emotesOffsets: msg.emoteOffsets, isAction: false,
        });
        linesParsedIncrement();
        triggerInterfaceOnMessage({
          sender:    userstate,
          message,
          timestamp: Date.now(),
        });
      });

      client.onChatClear(() => {
        eventEmitter.emit('clearchat');
      });
    } else if (type === 'broadcaster') {
      client.onHost((_channel, target, viewers) => {
        eventEmitter.emit('hosting', { target, viewers: viewers ?? 0 });
      });

      client.onRaid((_channel, username, raidInfo) => {
        this.raid(username, raidInfo.viewerCount);
      });

      client.onSub((_channel, username, subInfo, msg) => {
        this.subscription(username, subInfo, msg.userInfo);
      });

      client.onResub((_channel, username, subInfo, msg) => {
        this.resub(username, subInfo, msg.userInfo);
      });

      client.onSubGift((_channel, username, subInfo, msg) => {
        this.subgift(username, subInfo, msg.userInfo);
      });

      client.onCommunitySub((_channel, username, subInfo, msg) => {
        this.subscriptionGiftCommunity(username, subInfo, msg.userInfo);
      });

      client.onHosted(async (_channel, username, _auto, viewers) => {
        viewers ??= 0;
        host(`${username}, viewers: ${viewers}`);

        const data = {
          userName:  username,
          viewers,
          event:     'host',
          timestamp: Date.now(),
        };

        eventlist.add({
          userId:    String(await users.getIdByName(username) ?? '0'),
          viewers:   viewers,
          event:     'host',
          timestamp: Date.now(),
        });
        eventEmitter.emit('hosted', data);
        alerts.trigger({
          event:      'hosts',
          name:       username,
          amount:     Number(viewers),
          tier:       null,
          currency:   '',
          monthsName: '',
          message:    '',
        });
      });
    } else {
      throw Error(`This ${type} is not supported`);
    }
  }

  @timer()
  async raid(username: string, viewers: number) {
    raid(`${username}, viewers: ${viewers}`);

    const data = {
      userName:  username,
      viewers:   viewers,
      event:     'raid',
      timestamp: Date.now(),
    };

    eventlist.add({
      userId:    String(await users.getIdByName(username) ?? '0'),
      viewers:   viewers,
      event:     'raid',
      timestamp: Date.now(),
    });
    eventEmitter.emit('raid', data);
    alerts.trigger({
      event:      'raids',
      name:       username,
      amount:     viewers,
      tier:       null,
      currency:   '',
      monthsName: '',
      message:    '',
    });
  }

  @timer()
  async subscription (username: string , subInfo: ChatSubInfo, userstate: ChatUser) {
    try {
      const amount = subInfo.months;
      const tier = (subInfo.isPrime ? 'Prime' : String(Number(subInfo.plan ?? 1000) / 1000)) as EmitData['tier'];

      if (isIgnored({ userName: username, userId: userstate.userId })) {
        return;
      }

      const user = await changelog.get(userstate.userId);
      if (!user) {
        changelog.update(userstate.userId, { userName: username });
        this.subscription(username, subInfo, userstate);
        return;
      }

      let profileImageUrl = null;
      if (user.profileImageUrl.length === 0) {
        profileImageUrl = (await getUserFromTwitch(user.userName)).profile_image_url;
      }

      changelog.update(user.userId, {
        ...user,
        isSubscriber:              user.haveSubscriberLock ? user.isSubscriber : true,
        subscribedAt:              user.haveSubscribedAtLock ? user.subscribedAt : Date.now(),
        subscribeTier:             String(tier),
        subscribeCumulativeMonths: amount,
        subscribeStreak:           0,
        profileImageUrl:           profileImageUrl ? profileImageUrl : user.profileImageUrl,
      });

      hypeTrain.addSub({
        username:        user.userName,
        profileImageUrl: profileImageUrl ? profileImageUrl : user.profileImageUrl,
      });

      eventlist.add({
        event:     'sub',
        tier:      String(tier),
        userId:    String(userstate.userId),
        method:    subInfo.isPrime ? 'Twitch Prime' : '' ,
        timestamp: Date.now(),
      });
      sub(`${username}#${userstate.userId}, tier: ${tier}`);
      eventEmitter.emit('subscription', {
        userName: username, method: subInfo.isPrime ? 'Twitch Prime' : '', subCumulativeMonths: amount, tier: String(tier),
      });
      alerts.trigger({
        event:      'subs',
        name:       username,
        amount:     0,
        tier,
        currency:   '',
        monthsName: '',
        message:    '',
      });

      triggerInterfaceOnSub({
        userName:            username,
        userId:              userstate.userId,
        subCumulativeMonths: amount,
      });
    } catch (e: any) {
      error('Error parsing subscription event');
      error(util.inspect(userstate));
      error(e.stack);
    }
  }

  @timer()
  async resub (username: string, subInfo: ChatSubInfo, userstate: ChatUser) {
    try {
      const amount = subInfo.months;
      const subStreakShareEnabled = typeof subInfo.streak !== 'undefined';
      const streakMonths = subInfo.streak ?? 0;
      const tier = (subInfo.isPrime ? 'Prime' : String(Number(subInfo.plan ?? 1000) / 1000)) as EmitData['tier'];
      const message = subInfo.message ?? '';

      if (isIgnored({ userName: username, userId: userstate.userId })) {
        return;
      }

      const subStreak = subStreakShareEnabled ? streakMonths : 0;

      const user = await changelog.get(userstate.userId);
      if (!user) {
        changelog.update(userstate.userId, { userName: username });
        this.resub(username, subInfo, userstate);
        return;
      }

      let profileImageUrl = null;
      if (user.profileImageUrl.length === 0) {
        profileImageUrl = (await getUserFromTwitch(user.userName)).profile_image_url;
      }

      changelog.update(user.userId, {
        ...user,
        isSubscriber:              true,
        subscribedAt:              Number(dayjs().subtract(streakMonths, 'month').unix()) * 1000,
        subscribeTier:             String(tier),
        subscribeCumulativeMonths: amount,
        subscribeStreak:           subStreak,
        profileImageUrl:           profileImageUrl ? profileImageUrl : user.profileImageUrl,
      });

      hypeTrain.addSub({
        username:        user.userName,
        profileImageUrl: profileImageUrl ? profileImageUrl : user.profileImageUrl,
      });

      eventlist.add({
        event:                   'resub',
        tier:                    String(tier),
        userId:                  String(userstate.userId),
        subStreakShareEnabled,
        subStreak,
        subStreakName:           getLocalizedName(subStreak, translate('core.months')),
        subCumulativeMonths:     amount,
        subCumulativeMonthsName: getLocalizedName(amount, translate('core.months')),
        message,
        timestamp:               Date.now(),
      });
      resub(`${username}#${userstate.userId}, streak share: ${subStreakShareEnabled}, streak: ${subStreak}, months: ${amount}, message: ${message}, tier: ${tier}`);
      eventEmitter.emit('resub', {
        userName:                username,
        tier:                    String(tier),
        subStreakShareEnabled,
        subStreak,
        subStreakName:           getLocalizedName(subStreak, translate('core.months')),
        subCumulativeMonths:     amount,
        subCumulativeMonthsName: getLocalizedName(amount, translate('core.months')),
        message,
      });
      alerts.trigger({
        event:      'resubs',
        name:       username,
        amount:     Number(amount),
        tier,
        currency:   '',
        monthsName: getLocalizedName(amount, translate('core.months')),
        message,
      });
    } catch (e: any) {
      error('Error parsing resub event');
      error(util.inspect(userstate));
      error(e.stack);
    }
  }

  @timer()
  async subscriptionGiftCommunity (username: string, subInfo: ChatCommunitySubInfo, userstate: ChatUser) {
    try {
      const userId = subInfo.gifterUserId ?? '';
      const count = subInfo.count;

      changelog.increment(userId, { giftedSubscribes: Number(count) });

      const ignoreGifts = this.ignoreGiftsFromUser.get(username) ?? 0;
      this.ignoreGiftsFromUser.set(username, ignoreGifts + count);

      if (isIgnored({ userName: username, userId })) {
        return;
      }

      eventlist.add({
        event:     'subcommunitygift',
        userId:    userId,
        count,
        timestamp: Date.now(),
      });
      eventEmitter.emit('subcommunitygift', { userName: username, count });
      subcommunitygift(`${username}#${userId}, to ${count} viewers`);
      alerts.trigger({
        event:      'subcommunitygifts',
        name:       username,
        amount:     Number(count),
        tier:       null,
        currency:   '',
        monthsName: '',
        message:    '',
      });
    } catch (e: any) {
      error('Error parsing subscriptionGiftCommunity event');
      error(util.inspect({ userstate, subInfo }));
      error(e.stack);
    }
  }

  @timer()
  async subgift (recipient: string, subInfo: ChatSubGiftInfo, userstate: ChatUser) {
    try {
      const username = subInfo.gifter ?? '';
      const userId = subInfo.gifterUserId ?? '0';
      const amount = subInfo.months;
      const recipientId = subInfo.userId;
      const tier = (subInfo.isPrime ? 1 : (Number(subInfo.plan ?? 1000) / 1000));

      const ignoreGifts = (this.ignoreGiftsFromUser.get(username) ?? 0);
      let isGiftIgnored = false;

      const user = await changelog.get(recipientId);
      if (!user) {
        changelog.update(recipientId, { userId: recipientId, userName: username });
        this.subgift(recipient, subInfo, userstate);
        return;
      }

      if (ignoreGifts > 0) {
        isGiftIgnored = true;
        this.ignoreGiftsFromUser.set(username, ignoreGifts - 1);
      }

      if (!isGiftIgnored) {
        debug('tmi.subgift', `Triggered: ${username}#${userId} -> ${recipient}#${recipientId}`);
        alerts.trigger({
          event:      'subgifts',
          name:       username,
          recipient,
          amount:     amount,
          tier:       null,
          currency:   '',
          monthsName: getLocalizedName(amount, translate('core.months')),
          message:    '',
        });
        eventEmitter.emit('subgift', {
          userName: username, recipient: recipient, tier,
        });
        triggerInterfaceOnSub({
          userName:            recipient,
          userId:              recipientId,
          subCumulativeMonths: 0,
        });
      } else {
        console.log(`Ignored: ${username}#${userId} -> ${recipient}#${recipientId}`);
        debug('tmi.subgift', `Ignored: ${username}#${userId} -> ${recipient}#${recipientId}`);
      }
      if (isIgnored({ userName: username, userId: recipientId })) {
        return;
      }

      changelog.update(user.userId, {
        ...user,
        isSubscriber:              true,
        subscribedAt:              Date.now(),
        subscribeTier:             String(tier),
        subscribeCumulativeMonths: amount,
        subscribeStreak:           user.subscribeStreak + 1,
      });

      eventlist.add({
        event:      'subgift',
        userId:     recipientId,
        fromId:     userId,
        monthsName: getLocalizedName(amount, translate('core.months')),
        months:     amount,
        timestamp:  Date.now(),
      });
      subgift(`${recipient}#${recipientId}, from: ${username}#${userId}, months: ${amount}`);

      // also set subgift count to gifter
      if (!(isIgnored({ userName: username, userId })) && !isGiftIgnored) {
        changelog.increment(userId, { giftedSubscribes: 1 });
      }
    } catch (e: any) {
      error('Error parsing subgift event');
      error(util.inspect(userstate));
      error(e.stack);
    }
  }

  @timer()
  async cheer (userstate: ChatUser, message: string, bits: number): Promise<void> {
    try {
      const username = userstate.userName;
      const userId = userstate.userId;

      // remove <string>X or <string>X from message, but exclude from remove #<string>X or !someCommand2
      const messageFromUser = message.replace(/(?<![#!])(\b\w+[\d]+\b)/g, '').trim();
      if (!username || !userId || isIgnored({ userName: username, userId })) {
        return;
      }

      const user = await changelog.get(userId);
      if (!user) {
        // if we still doesn't have user, we create new
        changelog.update(userId, { userName: username });
        return this.cheer(userstate, message, bits);
      }

      eventlist.add({
        event:     'cheer',
        userId:    userId,
        bits,
        message:   messageFromUser,
        timestamp: Date.now(),
      });
      cheer(`${username}#${userId}, bits: ${bits}, message: ${messageFromUser}`);

      const newBits: UserBitInterface = {
        amount:    bits,
        cheeredAt: Date.now(),
        message:   messageFromUser,
        userId:    String(userId),
      };
      getRepository(UserBit).save(newBits);

      eventEmitter.emit('cheer', {
        userName: username, userId, bits: bits, message: messageFromUser,
      });

      if (isStreamOnline.value) {
        stats.value.currentBits = stats.value.currentBits + bits;
      }

      triggerInterfaceOnBit({
        userName:  username,
        amount:    bits,
        message:   messageFromUser,
        timestamp: Date.now(),
      });

      let redeemTriggered = false;
      if (messageFromUser.trim().startsWith('!')) {
        try {
          const price = await getRepository(Price).findOneOrFail({ where: { command: messageFromUser.trim().toLowerCase(), enabled: true } });
          if (price.priceBits <= bits) {
            if (customcommands.enabled) {
              await customcommands.run({
                sender: getUserSender(userId, username), id: 'null', skip: true, quiet: false, message: messageFromUser.trim().toLowerCase(), parameters: '', parser: new Parser(), isAction: false, emotesOffsets: new Map(), discord: undefined, isParserOptions: true,
              });
            }
            if (alias.enabled) {
              await alias.run({
                sender: getUserSender(userId, username), id: 'null', skip: true, message: messageFromUser.trim().toLowerCase(), parameters: '', parser: new Parser(), isAction: false, emotesOffsets: new Map(), discord: undefined, isParserOptions: true,
              });
            }
            const responses = await new Parser().command(getUserSender(userId, username), messageFromUser, true);
            for (let i = 0; i < responses.length; i++) {
              await parserReply(responses[i].response, { sender: responses[i].sender, discord: responses[i].discord, attr: responses[i].attr, id: '' });
            }
            if (price.emitRedeemEvent) {
              redeemTriggered = true;
              debug('tmi.cmdredeems', messageFromUser);
              alerts.trigger({
                event:      'cmdredeems',
                recipient:  username,
                name:       price.command,
                amount:     bits,
                tier:       null,
                currency:   '',
                monthsName: '',
                message:    '',
              });
            }
          }
        } catch (e: any) {
          debug('tmi.cheer', e.stack);
        }
      }
      if (!redeemTriggered) {
        alerts.trigger({
          event:      'cheers',
          name:       username,
          amount:     bits,
          tier:       null,
          currency:   '',
          monthsName: '',
          message:    messageFromUser,
        });
      }
    } catch (e: any) {
      error('Error parsing cheer event');
      error(util.inspect(userstate));
      error(e.stack);
    }
  }

  delete (client: 'broadcaster' | 'bot', msgId: string): void {
    this.client[client]?.deleteMessage(getOwner(), msgId);
  }

  @timer()
  async message (data: { skip?: boolean, quiet?: boolean, message: string, userstate: ChatUser, id?: string, isWhisper?: boolean, emotesOffsets?: Map<string, string[]>, isAction: boolean }) {
    data.emotesOffsets ??= new Map();
    data.isAction ??= false;

    let userId = data.userstate.userId as string | undefined;
    const userstate = data.userstate;
    const message = data.message;
    const skip = data.skip ?? false;
    const quiet = data.quiet;

    if (!userId && userstate.userName) {
      // this can happen if we are sending commands from dashboards etc.
      userId = String(await users.getIdByName(userstate.userName));
    }

    const parse = new Parser({
      sender: userstate, message: message, skip: skip, quiet: quiet, id: data.id, emotesOffsets: data.emotesOffsets, isAction: data.isAction,
    });

    if (!skip
        && data.isWhisper
        && (this.whisperListener || isOwner(userstate))) {
      whisperIn(`${message} [${userstate.userName}]`);
    } else if (!skip && !isBotId(userId)) {
      chatIn(`${message} [${userstate.userName}]`);
    }

    if (commandRegexp.test(message)) {
      // check only if ignored if it is just simple command
      if (await isIgnored({ userName: userstate.userName ?? '', userId: userId })) {
        return;
      }
    } else {
      // we need to moderate ignored users as well
      const [isModerated, isIgnoredCheck] = await Promise.all(
        [parse.isModerated(), isIgnored({ userName: userstate.userName ?? '', userId: userId })],
      );
      if (isModerated || isIgnoredCheck) {
        return;
      }
    }

    if (!skip && !isNil(userstate.userName)) {
      const user = await changelog.get(userstate.userId);
      if (user) {
        if (!user.isOnline) {
          joinpart.send({ users: [userstate.userName], type: 'join' });
          eventEmitter.emit('user-joined-channel', { userName: userstate.userName });
        }

        changelog.update(user.userId, {
          ...user,
          userName:     userstate.userName,
          userId:       userstate.userId,
          isOnline:     true,
          isVIP:        userstate.isVip,
          isModerator:  userstate.isMod,
          isSubscriber: user.haveSubscriberLock ? user.isSubscriber : userstate.isSubscriber || userstate.isFounder,
          messages:     user.messages ?? 0,
          seenAt:       Date.now(),
        });
      } else {
        joinpart.send({ users: [userstate.userName], type: 'join' });
        eventEmitter.emit('user-joined-channel', { userName: userstate.userName });
        changelog.update(userstate.userId, {
          userName:     userstate.userName,
          userId:       userstate.userId,
          isOnline:     true,
          isVIP:        userstate.isVip,
          isModerator:  userstate.isMod,
          isSubscriber: userstate.isSubscriber || userstate.isFounder,
          seenAt:       Date.now(),
        });
      }

      api.followerUpdatePreCheck(userstate.userName);

      eventEmitter.emit('keyword-send-x-times', {
        userName: userstate.userName, message: message, source: 'twitch',
      });
      if (message.startsWith('!')) {
        eventEmitter.emit('command-send-x-times', {
          userName: userstate.userName, message: message, source: 'twitch',
        });
      } else if (!message.startsWith('!')) {
        changelog.increment(userstate.userId, { messages: 1 });
      }
    }
    const responses = await parse.process();
    for (let i = 0; i < responses.length; i++) {
      await sendMessage(responses[i].response, responses[i].sender, responses[i].attr, parse.id);
    }
  }
}

export default new TMI();