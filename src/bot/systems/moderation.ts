// 3rdparty libraries
import * as _ from 'lodash';
import XRegExp from 'xregexp';
import emojiRegex from 'emoji-regex';

import constants from '../constants';
import { permission } from '../permissions';
import { command, default_permission, parser, permission_settings, settings } from '../decorators';
import Message from '../message';
import System from './_interface';
import { getLocalizedName, prepare, sendMessage, timeout } from '../commons';
import { isMainThread } from 'worker_threads';

class Moderation extends System {
  @settings('lists')
  cListsWhitelist: string[] = [];
  @settings('lists')
  cListsBlacklist: string[] = [];
  @permission_settings('lists')
  cListsEnabled = true;
  @permission_settings('lists')
  cListsTimeout = 120;

  @permission_settings('links')
  cLinksEnabled = true;
  @permission_settings('links')
  cLinksIncludeSpaces = false;
  @permission_settings('links')
  cLinksIncludeClips = true;
  @permission_settings('links')
  cLinksTimeout = 120;

  @permission_settings('symbols')
  cSymbolsEnabled = true;
  @permission_settings('symbols')
  cSymbolsTriggerLength = 15;
  @permission_settings('symbols')
  cSymbolsMaxSymbolsConsecutively = 10;
  @permission_settings('symbols')
  cSymbolsMaxSymbolsPercent = 50;
  @permission_settings('symbols')
  cSymbolsTimeout = 120;

  @permission_settings('longMessage')
  cLongMessageEnabled = true;
  @permission_settings('longMessage')
  cLongMessageTriggerLength = 300;
  @permission_settings('longMessage')
  cLongMessageTimeout = 120;

  @permission_settings('caps')
  cCapsEnabled = true;
  @permission_settings('caps')
  cCapsTriggerLength = 15;
  @permission_settings('caps')
  cCapsMaxCapsPercent = 50;
  @permission_settings('caps')
  cCapsTimeout = 120;

  @permission_settings('spam')
  cSpamEnabled = true;
  @permission_settings('spam')
  cSpamTriggerLength = 15;
  @permission_settings('spam')
  cSpamMaxLength = 50;
  @permission_settings('spam')
  cSpamTimeout = 300;

  @permission_settings('color')
  cColorEnabled = true;
  @permission_settings('color')
  cColorTimeout = 300;

  @permission_settings('emotes')
  cEmotesEnabled = true;
  @permission_settings('emotes')
  cEmotesEmojisAreEmotes = true;
  @permission_settings('emotes')
  cEmotesMaxCount = 15;
  @permission_settings('emotes')
  cEmotesTimeout = 120;

  @settings('warnings')
  cWarningsAllowedCount = 3;
  @settings('warnings')
  cWarningsAnnounceTimeouts = true;
  @settings('warnings')
  cWarningsShouldClearChat = true;

  constructor () {
    super();

    if(isMainThread) {
      global.db.engine.index(this.collection.messagecooldown, [{ index: 'key', unique: true }]);
      global.db.engine.index(this.collection.permits, [{ index: 'username' }]);
      global.db.engine.index(this.collection.warnings, [{ index: 'username' }]);
    }
  }

  sockets () {
    if (this.socket === null) {
      return setTimeout(() => this.sockets(), 100);
    }
    this.socket.on('connection', (socket) => {
      socket.on('lists.get', async (cb) => {
        cb(null, {
          blacklist: this.cListsBlacklist,
          whitelist: this.cListsWhitelist,
        });
      });
      socket.on('lists.set', async (data) => {
        this.cListsBlacklist = data.blacklist.filter(entry => entry.trim() !== '');
        this.cListsWhitelist = data.whitelist.filter(entry => entry.trim() !== '');
      });
    });
  }

  async timeoutUser (sender, text, warning, msg, time, type) {
    let [warnings, silent] = await Promise.all([
      global.db.engine.find(global.systems.moderation.collection.warnings, { username: sender.username }),
      this.isSilent(type),
    ]);
    text = text.trim();

    // cleanup warnings
    let wasCleaned = false;
    for (const warning of _.filter(warnings, (o) => _.now() - o.timestamp > 1000 * 60 * 60)) {
      await global.db.engine.remove(global.systems.moderation.collection.warnings, { _id: warning._id.toString() });
      wasCleaned = true;
    }
    if (wasCleaned) {
      warnings = await global.db.engine.find(global.systems.moderation.collection.warnings, { username: sender.username });
    }

    if (this.cWarningsAllowedCount === 0) {
      msg = await new Message(msg.replace(/\$count/g, -1)).parse();
      global.log.timeout(`${sender.username} [${type}] ${time}s timeout | ${text}`);
      timeout(sender.username, msg, time);
      return;
    }

    const isWarningCountAboveThreshold = warnings.length >= this.cWarningsAllowedCount;
    if (isWarningCountAboveThreshold) {
      msg = await new Message(warning.replace(/\$count/g, this.cWarningsAllowedCount - warnings.length)).parse();
      global.log.timeout(`${sender.username} [${type}] ${time}s timeout | ${text}`);
      timeout(sender.username, msg, time);
      await global.db.engine.remove(global.systems.moderation.collection.warnings, { username: sender.username });
    } else {
      await global.db.engine.insert(global.systems.moderation.collection.warnings, { username: sender.username, timestamp: _.now() });
      const warningsLeft = this.cWarningsAllowedCount - warnings.length;
      warning = await new Message(warning.replace(/\$count/g, warningsLeft < 0 ? 0 : warningsLeft)).parse();
      if (this.cWarningsShouldClearChat) {
        global.log.timeout(`${sender.username} [${type}] 1s timeout, warnings left ${warningsLeft < 0 ? 0 : warningsLeft} | ${text}`);
        timeout(sender.username, warning, 1);
      }

      if (this.cWarningsAnnounceTimeouts && !silent) {
        global.tmi.delete('bot', sender.id);
        sendMessage('$sender, ' + warning, sender);
      }
    }
  }

  async whitelist (text, permId: string | null) {
    let ytRegex, clipsRegex, spotifyRegex;

    // check if spotify -or- alias of spotify contain open.spotify.com link
    if (await global.integrations.spotify.isEnabled()) {
      // we can assume its first command in array (spotify have only one command)
      const command = (await global.integrations.spotify.commands())[0].command;
      const alias = await global.db.engine.findOne(global.systems.alias.collection.data, { command });
      if (!_.isEmpty(alias) && alias.enabled && await global.systems.alias.isEnabled()) {
        spotifyRegex = new RegExp('^(' + command + '|' + alias.alias + ') \\S+open\\.spotify\\.com\\/track\\/(\\w+)(.*)?', 'gi');
      } else {
        spotifyRegex = new RegExp('^(' + command + ') \\S+open\\.spotify\\.com\\/track\\/(\\w+)(.*)?', 'gi');
      }
      text = text.replace(spotifyRegex, '');
    }

    // check if songrequest -or- alias of songrequest contain youtube link
    if (await global.systems.songs.isEnabled()) {
      const alias = await global.db.engine.findOne(global.systems.alias.collection.data, { command: '!songrequest' });
      const cmd = global.systems.songs.getCommand('!songrequest');
      if (!_.isEmpty(alias) && alias.enabled && await global.systems.alias.isEnabled()) {
        ytRegex = new RegExp('^(' + cmd + '|' + alias.alias + ') \\S+(?:youtu.be\\/|v\\/|e\\/|u\\/\\w+\\/|embed\\/|v=)([^#&?]*).*', 'gi');
      } else {
        ytRegex =  new RegExp('^(' + cmd + ') \\S+(?:youtu.be\\/|v\\/|e\\/|u\\/\\w+\\/|embed\\/|v=)([^#&?]*).*', 'gi');
      }
      text = text.replace(ytRegex, '');
    }

    if (permId) {
      const cLinksIncludeClips = (await this.getPermissionBasedSettingsValue('cLinksIncludeClips'))[permId];
      if (!cLinksIncludeClips) {
        clipsRegex = /.*(clips.twitch.tv\/)(\w+)/;
        text = text.replace(clipsRegex, '');
      }
    }

    text = ` ${text} `;
    const whitelist = this.cListsWhitelist;

    for (const value of whitelist.map(o => o.trim().replace(/\*/g, '[\\pL0-9\\S]*').replace(/\+/g, '[\\pL0-9\\S]+'))) {
      if (value.length > 0) {
        let regexp;
        if (value.startsWith('domain:')) {
          regexp = XRegExp(` [\\S]*${XRegExp.escape(value.replace('domain:', ''))}[\\S]* `, 'gi');
        } else { // default regexp behavior
          regexp = XRegExp(` [^\\s\\pL0-9\\w]?${value}[^\\s\\pL0-9\\w]? `, 'gi');
        }
        // we need to change 'text' to ' text ' for regexp to correctly work
        text = XRegExp.replace(` ${text} `, regexp, '').trim();
      }
    }
    return text.trim();
  }

  @command('!permit')
  @default_permission(permission.CASTERS)
  async permitLink (opts) {
    try {
      const parsed = opts.parameters.match(/^@?([\S]+) ?(\d+)?$/);
      let count = 1;
      if (!_.isNil(parsed[2])) {
        count = parseInt(parsed[2], 10);
      }

      for (let i = 0; i < count; i++) {
        await global.db.engine.insert(this.collection.permits, { username: parsed[1].toLowerCase() });
      }

      const m = await prepare('moderation.user-have-link-permit', { username: parsed[1].toLowerCase(), link: getLocalizedName(count, 'core.links'), count: count });
      sendMessage(m, opts.sender, opts.attr);
    } catch (e) {
      sendMessage(global.translate('moderation.permit-parse-failed'), opts.sender, opts.attr);
    }
  }

  @parser({ priority: constants.MODERATION })
  async containsLink (opts: ParserOptions) {
    const [enabled, cLinksIncludeSpaces, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cLinksEnabled'),
      this.getPermissionBasedSettingsValue('cLinksIncludeSpaces'),
      this.getPermissionBasedSettingsValue('cLinksTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);
    const urlRegex = cLinksIncludeSpaces[permId]
      ? /(www)? ??\.? ?[a-zA-Z0-9]+([a-zA-Z0-9-]+) ??\. ?(aero|bet|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|shop|ac|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|money|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw)\b/ig
      : /[a-zA-Z0-9]+([a-zA-Z0-9-]+)?\.(aero|bet|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|shop|ac|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|me|mg|mh|mk|ml|mm|mn|mo|money|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw)\b/ig;

    if (whitelisted.search(urlRegex) >= 0) {
      const permit = await global.db.engine.findOne(this.collection.permits, { username: opts.sender.username });
      if (!_.isEmpty(permit)) {
        await global.db.engine.remove(this.collection.permits, { _id: permit._id.toString() });
        return true;
      } else {
        this.timeoutUser(opts.sender, whitelisted,
          global.translate('moderation.user-is-warned-about-links'),
          global.translate('moderation.user-have-timeout-for-links'),
          timeout[permId], 'links');
        return false;
      }
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async symbols (opts: ParserOptions) {
    const [enabled, cSymbolsTriggerLength, cSymbolsMaxSymbolsConsecutively, cSymbolsMaxSymbolsPercent, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cSymbolsEnabled'),
      this.getPermissionBasedSettingsValue('cSymbolsTriggerLength'),
      this.getPermissionBasedSettingsValue('cSymbolsMaxSymbolsConsecutively'),
      this.getPermissionBasedSettingsValue('cSymbolsMaxSymbolsPercent'),
      this.getPermissionBasedSettingsValue('cSymbolsTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);
    const msgLength = whitelisted.trim().length;
    let symbolsLength = 0;

    if (msgLength < cSymbolsTriggerLength[permId]) {
      return true;
    }

    const out = whitelisted.match(/([^\s\u0500-\u052F\u0400-\u04FF\w]+)/g);
    for (const item in out) {
      if (out.hasOwnProperty(item)) {
        const symbols = out[item];
        if (symbols.length >= cSymbolsMaxSymbolsConsecutively[permId]) {
          this.timeoutUser(opts.sender, opts.message,
            global.translate('moderation.user-is-warned-about-symbols'),
            global.translate('moderation.user-have-timeout-for-symbols'),
            timeout[permId], 'symbols');
          return false;
        }
        symbolsLength = symbolsLength + symbols.length;
      }
    }
    if (Math.ceil(symbolsLength / (msgLength / 100)) >= cSymbolsMaxSymbolsPercent[permId]) {
      this.timeoutUser(opts.sender, opts.message, global.translate('moderation.warnings.symbols'), global.translate('moderation.symbols'), timeout[permId], 'symbols');
      return false;
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async longMessage (opts: ParserOptions) {
    const [enabled, cLongMessageTriggerLength, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cLongMessageEnabled'),
      this.getPermissionBasedSettingsValue('cLongMessageTriggerLength'),
      this.getPermissionBasedSettingsValue('cLongMessageTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    const whitelisted = await this.whitelist(opts.message, permId);

    const msgLength = whitelisted.trim().length;
    if (msgLength < cLongMessageTriggerLength[permId]) {
      return true;
    } else {
      this.timeoutUser(opts.sender, opts.message,
        global.translate('moderation.user-is-warned-about-long-message'),
        global.translate('moderation.user-have-timeout-for-long-message'),
        timeout[permId], 'longmessage');
      return false;
    }
  }

  @parser({ priority: constants.MODERATION })
  async caps (opts: ParserOptions) {
    const [enabled, cCapsTriggerLength, cCapsMaxCapsPercent, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cCapsEnabled'),
      this.getPermissionBasedSettingsValue('cCapsTriggerLength'),
      this.getPermissionBasedSettingsValue('cCapsMaxCapsPercent'),
      this.getPermissionBasedSettingsValue('cCapsTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }
    let whitelisted = await this.whitelist(opts.message, permId);

    const emotesCharList: number[] = [];
    if (Symbol.iterator in Object(opts.sender.emotes)) {
      for (const emote of opts.sender.emotes) {
        for (const i of _.range(emote.start, emote.end + 1)) {
          emotesCharList.push(i);
        }
      }
    }

    let msgLength = whitelisted.trim().length;
    let capsLength = 0;

    // exclude emotes from caps check
    whitelisted = whitelisted.replace(emojiRegex(), '').trim();

    const regexp = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/gi;
    for (let i = 0; i < whitelisted.length; i++) {
      // if is emote or symbol - continue
      if (_.includes(emotesCharList, i) || !_.isNull(whitelisted.charAt(i).match(regexp))) {
        msgLength = parseInt(msgLength, 10) - 1;
        continue;
      } else if (!_.isFinite(parseInt(whitelisted.charAt(i), 10)) && whitelisted.charAt(i).toUpperCase() === whitelisted.charAt(i) && whitelisted.charAt(i) !== ' ') {
        capsLength += 1;
      }
    }

    if (msgLength < cCapsTriggerLength[permId]) {
      return true;
    }
    if (Math.ceil(capsLength / (msgLength / 100)) >= cCapsMaxCapsPercent[permId]) {
      this.timeoutUser(opts.sender, opts.message,
        global.translate('moderation.user-is-warned-about-caps'),
        global.translate('moderation.user-have-timeout-for-caps'),
        timeout[permId], 'caps');
      return false;
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async spam (opts: ParserOptions) {
    const [enabled, cSpamTriggerLength, cSpamMaxLength, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cSpamEnabled'),
      this.getPermissionBasedSettingsValue('cSpamTriggerLength'),
      this.getPermissionBasedSettingsValue('cSpamMaxLength'),
      this.getPermissionBasedSettingsValue('cSpamTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }
    const whitelisted = await this.whitelist(opts.message,permId);

    const msgLength = whitelisted.trim().length;

    if (msgLength < cSpamTriggerLength[permId]) {
      return true;
    }
    const out = whitelisted.match(/(.+)(\1+)/g);
    for (const item in out) {
      if (out.hasOwnProperty(item) && out[item].length >= cSpamMaxLength[permId]) {
        this.timeoutUser(opts.sender, opts.message,
          global.translate('moderation.user-have-timeout-for-spam'),
          global.translate('moderation.user-is-warned-about-spam'),
          timeout[permId], 'spam');
        return false;
      }
    }
    return true;
  }

  @parser({ priority: constants.MODERATION })
  async color (opts: ParserOptions) {
    const [enabled, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cColorEnabled'),
      this.getPermissionBasedSettingsValue('cColorTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    if (opts.sender['message-type'] === 'action') {
      this.timeoutUser(opts.sender, opts.message,
        global.translate('moderation.user-is-warned-about-color'),
        global.translate('moderation.user-have-timeout-for-color'),
        timeout[permId], 'color');
      return false;
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async emotes (opts: ParserOptions) {
    if (!(Symbol.iterator in Object(opts.sender.emotes))) {
      return true;
    }

    const [enabled, cEmotesEmojisAreEmotes, cEmotesMaxCount, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cEmotesEnabled'),
      this.getPermissionBasedSettingsValue('cEmotesEmojisAreEmotes'),
      this.getPermissionBasedSettingsValue('cEmotesMaxCount'),
      this.getPermissionBasedSettingsValue('cEmotesTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    let count = opts.sender.emotes.length;
    if (cEmotesEmojisAreEmotes[permId]) {
      const regex = emojiRegex();
      while (regex.exec(opts.message)) {
        count++;
      }
    }

    if (count > cEmotesMaxCount[permId]) {
      this.timeoutUser(opts.sender, opts.message,
        global.translate('moderation.user-is-warned-about-emotes'),
        global.translate('moderation.user-have-timeout-for-emotes'),
        timeout[permId], 'emotes');
      return false;
    } else {
      return true;
    }
  }

  @parser({ priority: constants.MODERATION })
  async blacklist (opts: ParserOptions) {
    const [enabled, timeout, permId] = await Promise.all([
      this.getPermissionBasedSettingsValue('cListsEnabled'),
      this.getPermissionBasedSettingsValue('cListsTimeout'),
      global.permissions.getUserHighestPermission(opts.sender.userId),
    ]);

    if (permId === null || !enabled[permId]) {
      return true;
    }

    let isOK = true;
    for (const value of this.cListsBlacklist.map(o => o.trim().replace(/\*/g, '[\\pL0-9]*').replace(/\+/g, '[\\pL0-9]+'))) {
      if (value.length > 0) {
        const regexp = XRegExp(` [^\\s\\pL0-9\\w]?${value}[^\\s\\pL0-9\\w]? `, 'gi');
        // we need to change 'text' to ' text ' for regexp to correctly work
        if (XRegExp.exec(` ${opts.message} `, regexp)) {
          isOK = false;
          this.timeoutUser(opts.sender, opts.message,
            global.translate('moderation.user-is-warned-about-blacklist'),
            global.translate('moderation.user-have-timeout-for-blacklist'),
            timeout[permId], 'blacklist');
          break;
        }
      }
    }
    return isOK;
  }

  async isSilent (name) {
    const item = await global.db.engine.findOne(this.collection.messagecooldown, { key: name });
    if (_.isEmpty(item) || (_.now() - item.value) >= 60000) {
      await global.db.engine.update(this.collection.messagecooldown, { key: name }, { value: _.now() });
      return false;
    }
    return true;
  }
}

export default Moderation;
export { Moderation };
