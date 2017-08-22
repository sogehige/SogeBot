'use strict'

var constants = require('./constants')
var crypto = require('crypto')
var _ = require('lodash')
var request = require('async-request')

var queue = {}

function Parser () {
  this.registeredHelpers = []
  this.registeredCmds = {}
  this.permissionsCmds = {}
  this.selfCmds = {}
  this.registeredParsers = {}
  this.permissionsParsers = {}
  this.selfParsers = {}
  this.linesParsed = 0
  this.timer = []

  this.messages = []

  this.customVariables = {}
  global.watcher.watch(this, 'customVariables', this._save)

  var self = this
  setInterval(function () {
    if (self.messages.length > 0) {
      let messages = _.cloneDeep(self.messages)
      self.messages = []

      _.each(messages, function (message) {
        self.linesParsed++
        self.registeredParsers === {} ? self.parseCommands(message.user, message.message, message.skip) : self.addToQueue(message.user, message.message, message.skip)
      })
    }
  }, 10)

  this._update(this)
}

Parser.prototype.parse = function (user, message, skip) {
  skip = skip || false
  this.messages.push({user: user, message: message, skip: skip})
}

Parser.prototype.addToQueue = async function (user, message, skip) {
  var id = crypto.createHash('md5').update(Math.random().toString()).digest('hex')

  var data = {
    started: 0,
    success: 0,
    user: user,
    message: message,
    skip: skip
  }
  queue[id] = data

  for (var parser in _(this.registeredParsers).toPairs().sortBy(0).fromPairs().value()) {
    if (typeof queue[id] === 'undefined') break
    if (this.permissionsParsers[parser] === constants.VIEWERS ||
        (this.permissionsParsers[parser] === constants.REGULAR && (global.users.get(user.username).is.regular || user.mod || this.isOwner(user))) ||
        (this.permissionsParsers[parser] === constants.MODS && (user.mod || this.isOwner(user))) ||
        (this.permissionsParsers[parser] === constants.OWNER_ONLY && this.isOwner(user))) {
      queue[id].started = parseInt(queue[id].started, 10) + 1
      this.registeredParsers[parser](this.selfParsers[parser], id, user, message, skip)
    }
  }

  this.processQueue(id)
}

Parser.prototype.processQueue = async function (id) {
  while (!_.isUndefined(queue[id])) {
    if (queue.hasOwnProperty(id) && queue[id].success === queue[id].started) {
      this.parseCommands(queue[id].user, queue[id].message, queue[id].skip)

      if (!_.isUndefined(queue[id].user.id)) {
        const index = _.findIndex(global.parser.timer, function (o) { return o.id === queue[id].user.id })
        if (!_.isUndefined(global.parser.timer[index])) global.parser.timer[index].sent = new Date().getTime()
        if (global.parser.timer.length > 100) {
          global.parser.timer.shift()
        }
        let avgTime = 0
        let length = global.parser.timer.length
        for (var i = 0; i < length; i++) {
          if (_.isUndefined(global.parser.timer[i].sent)) continue
          avgTime += global.parser.timer[i].sent - global.parser.timer[i].received
        }
        global.status['RES'] = (avgTime / length).toFixed(0)
      }
      global.removeFromQueue(id)
    }
  }
}

Parser.prototype.parseCommands = async function (user, message, skip) {
  message = message.trim()
  if (!message.startsWith('!')) return // do nothing, this is not a command
  for (var cmd in this.registeredCmds) {
    let onlyParams = message.trim().toLowerCase().replace(cmd, '')
    if (message.trim().toLowerCase().startsWith(cmd) && (onlyParams.length === 0 || (onlyParams.length > 0 && onlyParams[0] === ' '))) {
      if (this.permissionsCmds[cmd] === constants.DISABLE) break
      if (_.isNil(user) || // if user is null -> we are running command through a bot
        skip || (this.permissionsCmds[cmd] === constants.VIEWERS) ||
        (this.permissionsCmds[cmd] === constants.REGULAR && (global.users.get(user.username).is.regular || user.mod || this.isOwner(user))) ||
        (this.permissionsCmds[cmd] === constants.MODS && (user.mod || this.isOwner(user))) ||
        (this.permissionsCmds[cmd] === constants.OWNER_ONLY && this.isOwner(user))) {
        var text = message.trim().replace(/^(![\S\u0500-\u052F\u0400-\u04FF]+)/, '').trim()
        if (typeof this.registeredCmds[cmd] === 'function') this.registeredCmds[cmd](this.selfCmds[cmd], _.isNil(user) ? { username: global.configuration.get().twitch.username } : user, text.trim(), message)
        else global.log.error(cmd + ' have wrong null function registered!', { fnc: 'Parser.prototype.parseCommands' })
        break // cmd is executed
      } else {
        // user doesn't have permissions for command
        user['message-type'] = 'whisper'
        global.commons.sendMessage(global.translate('permissions.without-permission').replace('$command', message), user)
      }
    }
  }
}

Parser.prototype.isRegistered = function (cmd) {
  if (!cmd.startsWith('!')) cmd = '!' + cmd
  return !_.isNil(this.registeredCmds[cmd])
}

Parser.prototype.register = function (self, cmd, fnc, permission) {
  this.registeredCmds[cmd] = fnc
  this.permissionsCmds[cmd] = permission
  this.selfCmds[cmd] = self
}

Parser.prototype.registerParser = function (self, parser, fnc, permission) {
  this.registeredParsers[parser] = fnc
  this.permissionsParsers[parser] = permission
  this.selfParsers[parser] = self
}

Parser.prototype.registerHelper = function (cmd) {
  this.registeredHelpers.push(cmd)
}

Parser.prototype.unregister = function (cmd) {
  global.permissions.removePermission(global.permissions.removePermission, cmd)
  delete this.registeredCmds[cmd]
  delete this.permissionsCmds[cmd]
  delete this.selfCmds[cmd]
}

Parser.prototype.getOwner = function () {
  return global.configuration.get().twitch.owners.split(',')[0].trim()
}

Parser.prototype.getOwners = function () {
  return global.configuration.get().twitch.owners.split(',')
}

Parser.prototype.isBroadcaster = function (user) {
  if (_.isString(user)) user = { username: user }
  return global.configuration.get().twitch.channel.toLowerCase().trim() === user.username.toLowerCase().trim()
}

Parser.prototype.isOwner = function (user) {
  try {
    if (_.isString(user)) user = { username: user }
    let owners = _.map(_.filter(global.configuration.get().twitch.owners.split(','), _.isString), function (owner) {
      return _.trim(owner.toLowerCase())
    })
    return _.includes(owners, user.username.toLowerCase())
  } catch (e) {
    return true // we can expect, if user is null -> bot or admin
  }
}

Parser.prototype.parseMessage = async function (message, attr) {
  let random = {
    '(random.online.viewer)': async function () {
      let onlineViewers = _.filter(global.users.getAll({ is: { online: true } }), function (o) { return o.username !== attr.sender.username })
      if (onlineViewers.length === 0) return 'unknown'
      return onlineViewers[_.random(0, onlineViewers.length - 1)].username
    },
    '(random.online.follower)': async function () {
      let onlineFollower = _.filter(global.users.getAll({ is: { online: true, follower: true } }), function (o) { return o.username !== attr.sender.username })
      if (onlineFollower.length === 0) return 'unknown'
      return onlineFollower[_.random(0, onlineFollower.length - 1)].username
    },
    '(random.online.subscriber)': async function () {
      let onlineSubscriber = _.filter(global.users.getAll({ is: { online: true, subscriber: true } }), function (o) { return o.username !== attr.sender.username })
      if (onlineSubscriber.length === 0) return 'unknown'
      return onlineSubscriber[_.random(0, onlineSubscriber.length - 1)].username
    },
    '(random.viewer)': async function () {
      let viewer = _.filter(global.users.getAll(), function (o) { return o.username !== attr.sender.username })
      if (viewer.length === 0) return 'unknown'
      return viewer[_.random(0, viewer.length - 1)].username
    },
    '(random.follower)': async function () {
      let follower = _.filter(global.users.getAll({ is: { follower: true } }), function (o) { return o.username !== attr.sender.username })
      if (follower.length === 0) return 'unknown'
      return follower[_.random(0, follower.length - 1)].username
    },
    '(random.subscriber)': async function () {
      let follower = _.filter(global.users.getAll({ is: { subscriber: true } }), function (o) { return o.username !== attr.sender.username })
      if (follower.length === 0) return 'unknown'
      return follower[_.random(0, follower.length - 1)].username
    },
    '(random.number-#-to-#)': async function (filter) {
      let numbers = filter.replace('(random.number-', '')
        .replace(')', '')
        .split('-to-')

      try {
        let lastParamUsed = 0
        for (let index in numbers) {
          if (!_.isFinite(parseInt(numbers[index], 10))) {
            let param = attr.param.split(' ')
            if (_.isNil(param[lastParamUsed])) return 0

            numbers[index] = param[lastParamUsed]
            lastParamUsed++
          }
        }
        return _.random(numbers[0], numbers[1])
      } catch (e) {
        return 0
      }
    },
    '(random.true-or-false)': async function () {
      return Math.random() < 0.5
    }
  }
  let custom = {
    '(get.#)': async function (filter) {
      let variable = filter.replace('(get.', '').replace(')', '')
      return global.parser.customVariables[variable]
    },
    '(set.#)': async function (filter) {
      let variable = filter.replace('(set.', '').replace(')', '')
      global.parser.customVariables[variable] = attr.param
      return ''
    },
    '(var.#)': async function (filter) {
      let variable = filter.replace('(var.', '').replace(')', '')
      if ((global.parser.isOwner(attr.sender) || attr.sender.mod) &&
        (!_.isUndefined(attr.param) && attr.param.length !== 0)) {
        global.parser.customVariables[variable] = attr.param
        global.commons.sendMessage('(sender) ' + attr.param, attr.sender)
        return ''
      }
      return _.isNil(global.parser.customVariables[variable]) ? '' : global.parser.customVariables[variable]
    }
  }
  let param = {
    '(param)': async function (filter) {
      if (!_.isUndefined(attr.param) && attr.param.length !== 0) return attr.param
      return ''
    }
  }
  let info = {
    '(game)': async function (filter) {
      return global.twitch.currentGame
    },
    '(status)': async function (filter) {
      return global.twitch.currentStatus
    },
    '(uptime)': async function (filter) {
      const time = global.twitch.getTime(global.twitch.isOnline ? global.twitch.when.online : global.twitch.when.offline, true)
      return global.configuration.getValue('uptimeFormat')
        .replace('$days', time.days)
        .replace('$hours', time.hours)
        .replace('$minutes', time.minutes)
        .replace('$seconds', time.seconds)
    }
  }
  let command = {
    '(!#)': async function (filter) {
      let cmd = filter.replace('(', '')
      .replace(')', '')
      .replace('.', ' ')
      .replace('sender', attr.sender.username)
      global.parser.parse({ username: attr.sender.username }, cmd, true)
      return ''
    }
  }
  let price = {
    '(price)': async function (filter) {
      let price = 0
      if (global.commons.isSystemEnabled('price') && global.commons.isSystemEnabled('points')) {
        price = _.find(global.systems.price.prices, function (o) { return o.command === attr.cmd.command })
        price = !_.isNil(price) ? price.price : 0
      }
      return [price, global.systems.points.getPointsName(price)].join(' ')
    }
  }
  let online = {
    '(onlineonly)': async function (filter) {
      return global.twitch.isOnline
    },
    '(offlineonly)': async function (filter) {
      return !global.twitch.isOnline
    }
  }
  let list = {
    '(list.#)': async function (filter) {
      let list
      let system = filter.replace('(list.', '').replace(')', '')
      switch (system) {
        case 'alias':
          list = _.map(_.filter(global.systems['alias'].alias, function (o) { return o.visible && o.enabled }), function (n) { return n.alias }).join(', ')
          return list.length > 0 ? list : ' '
        case '!alias':
          list = _.map(_.filter(global.systems['alias'].alias, function (o) { return o.visible && o.enabled }), function (n) { return '!' + n.alias }).join(', ')
          return list.length > 0 ? list : ' '
        case 'command':
          list = _.map(_.filter(global.systems['customCommands'].commands, function (o) { return o.visible && o.enabled }), function (n) { return n.command }).join(', ')
          return list.length > 0 ? list : ' '
        case '!command':
          list = _.map(_.filter(global.systems['customCommands'].commands, function (o) { return o.visible && o.enabled }), function (n) { return '!' + n.command }).join(', ')
          return list.length > 0 ? list : ' '
        case 'cooldown':
          list = _.map(global.systems['cooldown'].list, function (o, k) {
            const time = o.miliseconds
            return k + ': ' + (parseInt(time, 10) / 1000) + 's'
          }).join(', ')
          return list.length > 0 ? list : ' '
        case '!cooldown':
          list = _.map(global.systems['cooldown'].list, function (o, k) {
            const time = o.miliseconds
            return '!' + k + ': ' + (parseInt(time, 10) / 1000) + 's'
          }).join(', ')
          return list.length > 0 ? list : ' '
        default:
          return ''
      }
    }
  }

  let msg = await this.parseMessageOnline(online, message)
  msg = await this.parseMessageCommand(command, msg)
  msg = await this.parseMessageEach(random, msg)
  msg = await this.parseMessageEach(price, msg)
  msg = await this.parseMessageEach(custom, msg)
  msg = await this.parseMessageEach(param, msg)
  msg = await this.parseMessageEach(info, msg)
  msg = await this.parseMessageEach(list, msg)
  msg = await this.parseMessageApi(msg)
  return msg
}

Parser.prototype.parseMessageApi = async function (msg) {
  if (msg.length === 0) return msg
  let rMessage = msg.match(/\(api\|(http\S+)\)/i)
  if (!_.isNil(rMessage) && !_.isNil(rMessage[1])) {
    msg = msg.replace(rMessage[0], '').trim() // remove api command from message
    let url = rMessage[1]
    let response = await request(url)
    if (response.statusCode !== 200) {
      return global.translate('core.api.error')
    }

    // search for api datas in msg
    let rData = msg.match(/\(api\.(?!_response)(\S*?)\)/gi)
    if (_.isNil(rData)) {
      msg = msg.replace('(api._response)', response.body.replace(/^"(.*)"/, '$1'))
    } else {
      let data = JSON.parse(response.body)
      _.each(rData, function (tag) {
        let path = data
        let ids = tag.replace('(api.', '').replace(')', '').split('.')
        _.each(ids, function (id) {
          let isArray = id.match(/(\S+)\[(\d+)\]/i)
          if (isArray) {
            path = path[isArray[1]][isArray[2]]
          } else {
            path = path[id]
          }
        })
        msg = msg.replace(tag, !_.isNil(path) ? path : global.translate('core.api.not-available'))
      })
    }
  }
  return msg
}

Parser.prototype.parseMessageCommand = async function (filters, msg) {
  if (msg.length === 0) return msg
  for (var key in filters) {
    if (!filters.hasOwnProperty(key)) continue

    let fnc = filters[key]
    let regexp = _.escapeRegExp(key)

    // we want to handle # as \w - number in regexp
    regexp = regexp.replace(/#/g, '(\\S+)')
    let rMessage = msg.match((new RegExp('(' + regexp + ')', 'g')))
    if (!_.isNull(rMessage)) {
      for (var bkey in rMessage) {
        await fnc(rMessage[bkey])
        msg = msg.replace(rMessage[bkey], '').trim()
      }
    }
  }
  return msg
}

Parser.prototype.parseMessageOnline = async function (filters, msg) {
  if (msg.length === 0) return msg
  for (var key in filters) {
    if (!filters.hasOwnProperty(key)) continue

    let fnc = filters[key]
    let regexp = _.escapeRegExp(key)

    // we want to handle # as \w - number in regexp
    regexp = regexp.replace(/#/g, '(\\S+)')
    let rMessage = msg.match((new RegExp('(' + regexp + ')', 'g')))
    if (!_.isNull(rMessage)) {
      for (var bkey in rMessage) {
        if (!await fnc(rMessage[bkey])) msg = ''
        else {
          msg = msg.replace(rMessage[bkey], '').trim()
        }
      }
    }
  }
  return msg
}

Parser.prototype.parseMessageEach = async function (filters, msg) {
  if (msg.length === 0) return msg
  for (var key in filters) {
    if (!filters.hasOwnProperty(key)) continue

    let fnc = filters[key]
    let regexp = _.escapeRegExp(key)

    // we want to handle # as \w - number in regexp
    regexp = regexp.replace(/#/g, '(\\S+)')
    let rMessage = msg.match((new RegExp('(' + regexp + ')', 'g')))
    if (!_.isNull(rMessage)) {
      for (var bkey in rMessage) {
        let newString = await fnc(rMessage[bkey])
        if (_.isUndefined(newString) || newString.length === 0) msg = ''
        msg = msg.replace(rMessage[bkey], newString).trim()
      }
    }
  }
  return msg
}

Parser.prototype._update = function (self) {
  global.botDB.findOne({ _id: 'customVariables' }, function (err, item) {
    if (err) return global.log.error(err, { fnc: 'Parser.prototype._update' })
    if (_.isNull(item)) return

    self.customVariables = item.variables
  })
}

Parser.prototype._save = function (self) {
  var data = {
    variables: self.customVariables
  }
  global.botDB.update({ _id: 'customVariables' }, { $set: data }, { upsert: true })
}

// these needs to be global, will be called from called parsers
global.updateQueue = function (id, success) {
  if (success && typeof queue[id] !== 'undefined') {
    queue[id].success = parseInt(queue[id].success, 10) + 1
  } else {
    if (!_.isUndefined(queue[id]) && !_.isUndefined(queue[id].user.id)) {
      const index = _.findIndex(global.parser.timer, function (o) { return o.id === queue[id].user.id })
      if (!_.isUndefined(global.parser.timer[index])) global.parser.timer[index].sent = new Date().getTime()
    }
    global.removeFromQueue(id)
  }
}

Parser.prototype.getLocalizedName = function (number, translation) {
  let single, multi, xmulti, name
  let names = global.translate(translation).split('|').map(Function.prototype.call, String.prototype.trim)
  number = parseInt(number, 10)

  switch (names.length) {
    case 1:
      xmulti = null
      single = multi = names[0]
      break
    case 2:
      single = names[0]
      multi = names[1]
      xmulti = null
      break
    default:
      var len = names.length
      single = names[0]
      multi = names[len - 1]
      xmulti = {}

      for (var pattern in names) {
        pattern = parseInt(pattern, 10)
        if (names.hasOwnProperty(pattern) && pattern !== 0 && pattern !== len - 1) {
          var maxPts = names[pattern].split(':')[0]
          xmulti[maxPts] = names[pattern].split(':')[1]
        }
      }
      break
  }

  name = (number === 1 ? single : multi)
  if (!_.isNull(xmulti) && _.isObject(xmulti) && number > 1 && number <= 10) {
    for (var i = number; i <= 10; i++) {
      if (typeof xmulti[i] === 'string') {
        name = xmulti[i]
        break
      }
    }
  }
  return name
}

global.removeFromQueue = function (id) {
  delete queue[id]
}

module.exports = Parser
