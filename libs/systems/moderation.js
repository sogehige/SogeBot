'use strict'

// 3rdparty libraries
var _ = require('lodash')
const debug = require('debug')('moderation')
// bot libraries
var constants = require('../constants')
var log = global.log

function Moderation () {
  this.lists = { blacklist: [], whitelist: [] }
  this.warnings = {}
  this.permits = []

  if (global.commons.isSystemEnabled(this)) {
    global.parser.register(this, '!permit', this.permitLink, constants.MODS)

    global.parser.registerParser(this, 'moderationLinks', this.containsLink, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationSymbols', this.symbols, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationLongMessage', this.longMessage, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationCaps', this.caps, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationSpam', this.spam, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationColor', this.color, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationEmotes', this.emotes, constants.VIEWERS)
    global.parser.registerParser(this, 'moderationBlacklist', this.blacklist, constants.VIEWERS)

    global.configuration.register('moderationLinks', 'moderation.settings.moderationLinks', 'bool', true)
    global.configuration.register('moderationLinksWithSpaces', 'moderation.settings.moderationLinksWithSpaces', 'bool', false)
    global.configuration.register('moderationLinksSubs', 'moderation.settings.moderationLinksSubs', 'bool', true)
    global.configuration.register('moderationLinksTimeout', 'moderation.settings.moderationLinksTimeout', 'number', 120)
    global.configuration.register('moderationLinksCustomMessage', 'moderation.settings.moderationLinksCustomMessage', 'string', '')
    global.configuration.register('moderationLinksWarningCustomMessage', 'moderation.settings.moderationLinksWarningCustomMessage', 'string', '')

    global.configuration.register('moderationSymbols', 'moderation.settings.moderationSymbols', 'bool', true)
    global.configuration.register('moderationSymbolsSubs', 'moderation.settings.moderationSymbolsSubs', 'bool', true)
    global.configuration.register('moderationSymbolsTimeout', 'moderation.settings.moderationSymbolsTimeout', 'number', 120)
    global.configuration.register('moderationSymbolsTriggerLength', 'moderation.settings.moderationSymbolsTriggerLength', 'number', 15)
    global.configuration.register('moderationSymbolsMaxConsecutively', 'moderation.settings.moderationSymbolsMaxConsecutively', 'number', 10)
    global.configuration.register('moderationSymbolsMaxPercent', 'moderation.settings.moderationSymbolsMaxPercent', 'number', 50)
    global.configuration.register('moderationSymbolsCustomMessage', 'moderation.settings.moderationSymbolsCustomMessage', 'string', '')
    global.configuration.register('moderationSymbolsWarningCustomMessage', 'moderation.settings.moderationSymbolsWarningCustomMessage', 'string', '')

    global.configuration.register('moderationLongMessage', 'moderation.settings.moderationLongMessage', 'bool', true)
    global.configuration.register('moderationLongMessageSubs', 'moderation.settings.moderationLongMessageSubs', 'bool', true)
    global.configuration.register('moderationLongMessageTimeout', 'moderation.settings.moderationLongMessageTimeout', 'number', 120)
    global.configuration.register('moderationLongMessageTriggerLength', 'moderation.settings.moderationLongMessageTriggerLength', 'number', 300)
    global.configuration.register('moderationLongMessageCustomMessage', 'moderation.settings.moderationLongMessageCustomMessage', 'string', '')
    global.configuration.register('moderationLongMessageWarningCustomMessage', 'moderation.settings.moderationLongMessageWarningCustomMessage', 'string', '')

    global.configuration.register('moderationCaps', 'moderation.settings.moderationCaps', 'bool', true)
    global.configuration.register('moderationCapsSubs', 'moderation.settings.moderationCapsSubs', 'bool', true)
    global.configuration.register('moderationCapsTimeout', 'moderation.settings.moderationCapsTimeout', 'number', 120)
    global.configuration.register('moderationCapsTriggerLength', 'moderation.settings.moderationCapsTriggerLength', 'number', 15)
    global.configuration.register('moderationCapsMaxPercent', 'moderation.settings.moderationCapsMaxPercent', 'number', 50)
    global.configuration.register('moderationCapsCustomMessage', 'moderation.settings.moderationCapsCustomMessage', 'string', '')
    global.configuration.register('moderationCapsWarningCustomMessage', 'moderation.settings.moderationCapsWarningCustomMessage', 'string', '')

    global.configuration.register('moderationSpam', 'moderation.settings.moderationSpam', 'bool', true)
    global.configuration.register('moderationSpamSubs', 'moderation.settings.moderationSpamSubs', 'bool', true)
    global.configuration.register('moderationSpamTimeout', 'moderation.settings.moderationSpamTimeout', 'number', 300)
    global.configuration.register('moderationSpamTriggerLength', 'moderation.settings.moderationSpamTriggerLength', 'number', 15)
    global.configuration.register('moderationSpamMaxLength', 'moderation.settings.moderationSpamMaxLength', 'number', 15)
    global.configuration.register('moderationSpamCustomMessage', 'moderation.settings.moderationSpamCustomMessage', 'string', '')
    global.configuration.register('moderationSpamWarningCustomMessage', 'moderation.settings.moderationSpamWarningCustomMessage', 'string', '')

    global.configuration.register('moderationColor', 'moderation.settings.moderationColor', 'bool', true)
    global.configuration.register('moderationColorSubs', 'moderation.settings.moderationColorSubs', 'bool', true)
    global.configuration.register('moderationColorTimeout', 'moderation.settings.moderationColorTimeout', 'number', 120)
    global.configuration.register('moderationColorCustomMessage', 'moderation.settings.moderationColorCustomMessage', 'string', '')
    global.configuration.register('moderationColorWarningCustomMessage', 'moderation.settings.moderationColorWarningCustomMessage', 'string', '')

    global.configuration.register('moderationEmotes', 'moderation.settings.moderationEmotes', 'bool', true)
    global.configuration.register('moderationEmotesSubs', 'moderation.settings.moderationEmotesSubs', 'bool', true)
    global.configuration.register('moderationEmotesTimeout', 'moderation.settings.moderationEmotesTimeout', 'number', 120)
    global.configuration.register('moderationEmotesMaxCount', 'moderation.settings.moderationEmotesMaxCount', 'number', 15)
    global.configuration.register('moderationEmotesCustomMessage', 'moderation.settings.moderationEmotesCustomMessage', 'string', '')
    global.configuration.register('moderationEmotesWarningCustomMessage', 'moderation.settings.moderationEmotesWarningCustomMessage', 'string', '')

    global.configuration.register('moderationBlacklistTimeout', 'moderation.settings.moderationBlacklistTimeout', 'number', 120)
    global.configuration.register('moderationBlacklistSubs', 'moderation.settings.moderationBlacklistSubs', 'bool', true)
    global.configuration.register('moderationBlacklistCustomMessage', 'moderation.settings.moderationBlacklistCustomMessage', 'string', '')
    global.configuration.register('moderationBlacklistWarningCustomMessage', 'moderation.settings.moderationBlacklistWarningCustomMessage', 'string', '')

    global.configuration.register('moderationWarnings', 'moderation.settings.moderationWarnings', 'number', 3)
    global.configuration.register('moderationAnnounceTimeouts', 'moderation.settings.moderationAnnounceTimeouts', 'bool', true)
    global.configuration.register('moderationWarningsTimeouts', 'moderation.settings.moderationWarningsTimeouts', 'bool', true)

    var self = this
    // purge warnings older than hour
    setInterval(function () {
      _.each(self.warnings, function (times, user) {
        let now = new Date().getTime()
        self.warnings[user] = _.filter(times, function (time) {
          return (now - parseInt(time, 10) < 3600000)
        })
        if (_.size(self.warnings[user]) === 0) delete self.warnings[user]
      })
    }, 60000)

    this._update(this)
    this.webPanel()
  }
}

Moderation.prototype._update = async function (self) {
  let blacklist = global.db.engine.findOne('settings', { key: 'blacklist' })
  let whitelist = global.db.engine.findOne('settings', { key: 'whitelist' })

  await blacklist
  await whitelist

  self.lists.blacklist = blacklist.value
  self.lists.whitelist = whitelist.value
}

Moderation.prototype.webPanel = function () {
  global.panel.addMenu({category: 'settings', name: 'moderation', id: 'moderation'})
  global.panel.socketListening(this, 'moderation.lists.get', this.emitLists)
  global.panel.socketListening(this, 'moderation.lists.set', this.setLists)
}

Moderation.prototype.emitLists = function (self, socket) {
  socket.emit('moderation.lists', self.lists)
}
Moderation.prototype.setLists = function (self, socket, data) {
  self.lists.blacklist = data.blacklist.filter(entry => entry.trim() !== '')
  self.lists.whitelist = data.whitelist.filter(entry => entry.trim() !== '')

  global.db.engine.update('settings', { key: 'blacklist' }, { value: self.lists.blacklist })
  global.db.engine.update('settings', { key: 'whitelist' }, { value: self.lists.whitelist })
}

Moderation.prototype.timeoutUser = function (self, sender, warning, msg, time) {
  var warningsAllowed = global.configuration.getValue('moderationWarnings')
  var warningsTimeout = global.configuration.getValue('moderationWarningsTimeouts')
  if (warningsAllowed === 0) {
    global.commons.timeout(sender.username, msg, time)
    return
  }

  let warnings = _.isUndefined(self.warnings[sender.username]) ? [] : self.warnings[sender.username]

  if (warnings.length >= warningsAllowed) {
    global.commons.timeout(sender.username, msg, time)
    delete self.warnings[sender.username]
    return
  }

  warnings.push(new Date().getTime())
  if (warningsTimeout) {
    global.commons.timeout(sender.username, warning.replace(/\$count/g, parseInt(warningsAllowed, 10) - warnings.length), 1)
  } else {
    global.commons.sendMessage('$sender: ' + warning.replace('$count', parseInt(warningsAllowed, 10) - warnings.length), sender)
  }

  self.warnings[sender.username] = warnings
}

Moderation.prototype.whitelist = function (text) {
  let ytRegex, clipsRegex

  // check if songrequest -or- alias of songrequest contain youtube link -> change it to ID
  if (global.commons.isSystemEnabled('songs')) {
    let alias = _.find(global.systems.alias.alias, function (oAlias) { return oAlias.command === 'songrequest' })
    if (!_.isUndefined(alias) && alias.enabled && global.commons.isSystemEnabled('alias')) {
      ytRegex = new RegExp('^(!songrequest|!' + alias.alias + ') \\S+(?:youtu.be\\/|v\\/|e\\/|u\\/\\w+\\/|embed\\/|v=)([^#&?]*).*', 'gi')
    } else {
      ytRegex = /^(!songrequest) \S+(?:youtu.be\/|v\/|e\/|u\/\w+\/|embed\/|v=)([^#&?]*).*/gi
    }
    text = text.replace(ytRegex, '')
  }

  clipsRegex = /.*(clips.twitch.tv\/)(\w+)/
  text = text.replace(clipsRegex, '')

  _.each(this.lists.whitelist, function (value) {
    text = text.replace(value, '')
  })

  return text
}

Moderation.prototype.permitLink = function (self, sender, text) {
  try {
    var parsed = text.match(/^@?([\u0500-\u052F\u0400-\u04FF\w]+) ?(\d+)?$/)
    let count = 1
    if (!_.isNil(parsed[2])) count = parseInt(parsed[2], 10)

    _.range(count).forEach(function () {
      self.permits.push(parsed[1].toLowerCase())
    })

    global.commons.sendMessage(global.translate('moderation.permit')
      .replace(/\$who/g, (global.configuration.getValue('atUsername') ? '@' : '') + parsed[1].toLowerCase())
      .replace(/\$link/g, global.parser.getLocalizedName(count, 'core.links'))
      .replace(/\$count/g, count), sender)
  } catch (e) {
    global.commons.sendMessage(global.translate('moderation.failed.parsePermit'), sender)
  }
}

Moderation.prototype.containsLink = async function (self, id, sender, text, skip) {
  debug('containLinks(%s, %j, %s, %s', id, sender, text, skip)
  const customMessage = global.configuration.getValue('moderationLinksCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationLinksWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationLinksTimeout')
  text = self.whitelist(text)

  debug('should check links - %s', global.configuration.getValue('moderationLinks'))
  debug('skip: %s', skip)
  debug('isOwner: %s', global.parser.isOwner(sender))
  debug('isMod: %s', isMod)
  debug('moderate with spaces: %s', global.configuration.getValue('moderationLinksWithSpaces'))
  if (skip || global.parser.isOwner(sender) || isMod || !global.configuration.getValue('moderationLinks') || (sender.subscriber && !global.configuration.getValue('moderationLinksSubs'))) {
    debug('checking links skipped')
    global.updateQueue(id, true)
    return
  }

  var urlRegex
  if (global.configuration.getValue('moderationLinksWithSpaces')) urlRegex = /[a-zA-Z0-9]+([a-zA-Z0-9-]+) ??\. ?(aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|ac|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw)\b/ig
  else urlRegex = /[a-zA-Z0-9]+([a-zA-Z0-9-]+)?\.(aero|biz|com|coop|edu|gov|info|int|mil|museum|name|net|org|ac|ad|ae|af|ag|ai|al|am|an|ao|aq|ar|as|at|au|aw|az|ba|bb|bd|be|bf|bg|bh|bi|bj|bm|bn|bo|br|bs|bt|bv|bw|by|bz|ca|cc|cd|cf|cg|ch|ci|ck|cl|cm|cn|co|cr|cs|cu|cv|cx|cy|cz|de|dj|dk|dm|do|dz|ec|ee|eg|eh|er|es|et|fi|fj|fk|fm|fo|fr|ga|gb|gd|ge|gf|gg|gh|gi|gl|gm|gn|gp|gq|gr|gs|gt|gu|gw|gy|hk|hm|hn|hr|ht|hu|id|ie|il|im|in|io|iq|ir|is|it|je|jm|jo|jp|ke|kg|kh|ki|km|kn|kp|kr|kw|ky|kz|la|lb|lc|li|lk|lr|ls|lt|lu|lv|ly|ma|mc|md|mg|mh|mk|ml|mm|mn|mo|mp|mq|mr|ms|mt|mu|mv|mw|mx|my|mz|na|nc|ne|nf|ng|ni|nl|no|np|nr|nu|nz|om|pa|pe|pf|pg|ph|pk|pl|pm|pn|pr|ps|pt|pw|py|qa|re|ro|ru|rw|sa|sb|sc|sd|se|sg|sh|si|sj|sk|sl|sm|sn|so|sr|st|su|sv|sy|sz|tc|td|tf|tg|th|tj|tk|tm|tn|to|tp|tr|tt|tv|tw|tz|ua|ug|uk|um|us|uy|uz|va|vc|ve|vg|vi|vn|vu|wf|ws|ye|yt|yu|za|zm|zr|zw)\b/ig

  if (text.search(urlRegex) >= 0) {
    if (_.includes(self.permits, sender.username.toLowerCase())) {
      _.pull(self.permits, sender.username.toLowerCase())
      global.updateQueue(id, true)
    } else {
      log.info(sender.username + ' [link] ' + timeout + 's timeout: ' + text)
      self.timeoutUser(self, sender,
        customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.links'),
        customMessage.length > 0 ? customMessage : global.translate('moderation.links'), timeout)
      global.updateQueue(id, false)
    }
  } else {
    global.updateQueue(id, true)
  }
}

Moderation.prototype.symbols = async function (self, id, sender, text, skip) {
  text = self.whitelist(text)

  const customMessage = global.configuration.getValue('moderationSymbolsCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationSymbolsWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationSymbolsTimeout')
  var triggerLength = global.configuration.getValue('moderationSymbolsTriggerLength')
  var maxSymbolsConsecutively = global.configuration.getValue('moderationSymbolsMaxConsecutively')
  var maxSymbolsPercent = global.configuration.getValue('moderationSymbolsMaxPercent')

  var msgLength = text.trim().length
  var symbolsLength = 0

  if (skip || global.parser.isOwner(sender) || isMod || msgLength < triggerLength || !global.configuration.getValue('moderationSymbols') || (sender.subscriber && !global.configuration.getValue('moderationSymbolsSubs'))) {
    global.updateQueue(id, true)
    return
  }

  var out = text.match(/([^\s\u0500-\u052F\u0400-\u04FF\w]+)/g)
  for (var item in out) {
    if (out.hasOwnProperty(item)) {
      var symbols = out[item]
      if (symbols.length >= maxSymbolsConsecutively) {
        global.updateQueue(id, false)
        log.info(sender.username + ' [symbols] ' + timeout + 's timeout: ' + text)
        self.timeoutUser(self, sender,
          customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.symbols'),
          customMessage.length > 0 ? customMessage : global.translate('moderation.symbols'), timeout)
        return
      }
      symbolsLength = symbolsLength + symbols.length
    }
  }
  if (Math.ceil(symbolsLength / (msgLength / 100)) >= maxSymbolsPercent) {
    global.updateQueue(id, false)
    log.info(sender.username + ' [symbols] ' + timeout + 's timeout: ' + text)
    self.timeoutUser(self, sender, global.translate('moderation.warnings.symbols'), global.translate('moderation.symbols'), timeout)
    return
  }
  global.updateQueue(id, true)
}

Moderation.prototype.longMessage = async function (self, id, sender, text, skip) {
  text = self.whitelist(text)

  const customMessage = global.configuration.getValue('moderationLongMessageCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationLongMessageWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationLongMessageTimeout')
  var triggerLength = global.configuration.getValue('moderationLongMessageTriggerLength')

  var msgLength = text.trim().length
  if (skip || global.parser.isOwner(sender) || isMod || msgLength < triggerLength || !global.configuration.getValue('moderationLongMessage') || (sender.subscriber && !global.configuration.getValue('moderationLongMessageSubs'))) {
    global.updateQueue(id, true)
  } else {
    global.updateQueue(id, false)
    log.info(sender.username + ' [longMessage] ' + timeout + 's timeout: ' + text)
    self.timeoutUser(self, sender,
      customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.longMessage'),
      customMessage.length > 0 ? customMessage : global.translate('moderation.longMessage'), timeout)
  }
}

Moderation.prototype.caps = async function (self, id, sender, text, skip) {
  debug('caps(%s, %j, %s, %s', id, sender, text, skip)
  text = self.whitelist(text)

  const customMessage = global.configuration.getValue('moderationCapsCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationCapsWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var emotesCharList = [] // remove emotes from caps checking
  _.each(sender['emotes'], function (emote) {
    _.each(emote, function (list) {
      _.each(_.range(parseInt(list.split('-')[0], 10), parseInt(list.split('-')[1], 10) + 1), function (val) {
        emotesCharList.push(val)
      })
    })
  })

  var timeout = global.configuration.getValue('moderationCapsTimeout')
  var triggerLength = global.configuration.getValue('moderationCapsTriggerLength')
  var maxCapsPercent = global.configuration.getValue('moderationCapsMaxPercent')

  var msgLength = text.trim().length
  var capsLength = 0

  debug('should check caps - %s', global.configuration.getValue('moderationLinks'))
  debug('skip: %s', skip)
  debug('isOwner: %s', global.parser.isOwner(sender))
  debug('isMod: %s', isMod)
  if (skip || global.parser.isOwner(sender) || isMod || msgLength < triggerLength || !global.configuration.getValue('moderationCaps') || (sender.subscriber && !global.configuration.getValue('moderationCapsSubs'))) {
    global.updateQueue(id, true)
    return
  }

  const regexp = /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]/gi
  for (let i = 0; i < text.length; i++) {
    // if is emote or symbol - continue
    if (_.includes(emotesCharList, i) || !_.isNull(text.charAt(i).match(regexp))) {
      msgLength = parseInt(msgLength, 10) - 1
      continue
    }
    if (!_.isFinite(parseInt(text.charAt(i), 10)) && text.charAt(i).toUpperCase() === text.charAt(i) && text.charAt(i) !== ' ') capsLength += 1
  }

  debug('capped chars: %i', capsLength)
  debug('capped percent: %i%', Math.ceil(capsLength / (msgLength / 100)))
  if (Math.ceil(capsLength / (msgLength / 100)) >= maxCapsPercent) {
    global.updateQueue(id, false)
    log.info(sender.username + ' [caps] ' + timeout + 's timeout: ' + text)
    self.timeoutUser(self, sender,
      customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.caps'),
      customMessage.length > 0 ? customMessage : global.translate('moderation.caps'), timeout)
    return
  }
  global.updateQueue(id, true)
}

Moderation.prototype.spam = async function (self, id, sender, text, skip) {
  text = self.whitelist(text)

  const customMessage = global.configuration.getValue('moderationSpamCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationSpamWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationSpamTimeout')
  var triggerLength = global.configuration.getValue('moderationSpamTriggerLength')
  var maxSpamLength = global.configuration.getValue('moderationSpamMaxLength')

  var msgLength = text.trim().length

  if (skip || global.parser.isOwner(sender) || isMod || msgLength < triggerLength || !global.configuration.getValue('moderationSpam') || (sender.subscriber && !global.configuration.getValue('moderationSpamSubs'))) {
    global.updateQueue(id, true)
    return
  }
  var out = text.match(/(.+)(\1+)/g)
  for (var item in out) {
    if (out.hasOwnProperty(item) && out[item].length >= maxSpamLength) {
      global.updateQueue(id, false)
      log.info(sender.username + ' [spam] ' + timeout + 's timeout: ' + text)
      self.timeoutUser(self, sender,
        customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.spam'),
        customMessage.length > 0 ? customMessage : global.translate('moderation.spam'), timeout)
      break
    }
  }
  global.updateQueue(id, true)
}

Moderation.prototype.color = async function (self, id, sender, text, skip) {
  const customMessage = global.configuration.getValue('moderationColorCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationColorWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationColorTimeout')

  if (skip || global.parser.isOwner(sender) || isMod || !global.configuration.getValue('moderationColor') || (sender.subscriber && !global.configuration.getValue('moderationColorSubs'))) {
    global.updateQueue(id, true)
    return
  }

  if (sender['message-type'] === 'action') {
    global.updateQueue(id, false)
    log.info(sender.username + ' [color] ' + timeout + 's timeout: ' + text)
    self.timeoutUser(self, sender,
      customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.color'),
      customMessage.length > 0 ? customMessage : global.translate('moderation.color'), timeout)
  } else global.updateQueue(id, true)
}

Moderation.prototype.emotes = async function (self, id, sender, text, skip) {
  text = self.whitelist(text)

  const customMessage = global.configuration.getValue('moderationEmotesCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationEmotesWarningCustomMessage')
  const isMod = await global.parser.isMod(sender)

  var timeout = global.configuration.getValue('moderationSpamTimeout')
  var maxCount = global.configuration.getValue('moderationEmotesMaxCount')
  var count = 0

  if (skip || global.parser.isOwner(sender) || isMod || !global.configuration.getValue('moderationEmotes') || (sender.subscriber && !global.configuration.getValue('moderationEmotesSubs'))) {
    global.updateQueue(id, true)
    return
  }

  _.each(sender['emotes'], function (value, index) {
    count = count + value.length
  })

  if (count > maxCount) {
    global.updateQueue(id, false)
    log.info(sender.username + ' [emotes] ' + timeout + 's timeout: ' + text)
    self.timeoutUser(self, sender,
      customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.emotes'),
      customMessage.length > 0 ? customMessage : global.translate('moderation.emotes'), timeout)
  } else global.updateQueue(id, true)
}

Moderation.prototype.blacklist = async function (self, id, sender, text, skip) {
  const isMod = await global.parser.isMod(sender)
  if (skip || global.parser.isOwner(sender) || isMod || (sender.subscriber && !global.configuration.getValue('moderationBlacklistSubs'))) {
    global.updateQueue(id, true)
    return
  }

  const customMessage = global.configuration.getValue('moderationBlacklistCustomMessage')
  const customMessageWarning = global.configuration.getValue('moderationBlacklistWarningCustomMessage')

  var timeout = global.configuration.getValue('moderationBlacklistTimeout')
  _.each(self.lists.blacklist, function (value) {
    value = value.trim()
    if (text.indexOf(value) !== -1 && value.length > 0) {
      log.info(sender.username + ' [blacklist] ' + timeout + 's timeout: ' + text)
      self.timeoutUser(self, sender,
        customMessageWarning.length > 0 ? customMessageWarning : global.translate('moderation.warnings.blacklist'),
        customMessage.length > 0 ? customMessage : global.translate('moderation.blacklist'), timeout)
      global.updateQueue(id, false)
      return false
    }
  })
  global.updateQueue(id, true)
}

module.exports = new Moderation()
