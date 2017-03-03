'use strict'

var constants = require('./constants')
var crypto = require('crypto')
var _ = require('lodash')

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

  this.customVariables = {}
  global.watcher.watch(this, 'customVariables', this._save)

  this._update(this)
}

Parser.prototype.parse = function (user, message) {
  this.linesParsed++
  // if we dont have registeredParsers, just parseCommands
  this.registeredParsers === {} ? this.parseCommands(user, message) : this.addToQueue(user, message)
}

Parser.prototype.addToQueue = async function (user, message) {
  var id = crypto.createHash('md5').update(Math.random().toString()).digest('hex')

  var data = {
    started: 0,
    success: 0,
    user: user,
    message: message
  }
  queue[id] = data

  for (var parser in _(this.registeredParsers).toPairs().sortBy(0).fromPairs().value()) {
    if (typeof queue[id] === 'undefined') break
    if (this.permissionsParsers[parser] === constants.VIEWERS ||
        (this.permissionsParsers[parser] === constants.OWNER_ONLY && this.isOwner(user)) ||
        (this.permissionsParsers[parser] === constants.MODS && user.mod)) {
      queue[id].started = parseInt(queue[id].started, 10) + 1
      this.registeredParsers[parser](this.selfParsers[parser], id, user, message)
    }
  }

  this.processQueue(id)
}

Parser.prototype.processQueue = async function (id) {
  while (!_.isUndefined(queue[id])) {
    if (new Date().getTime() - queue[id].user['tmi-sent-ts'] < 1000) {
      global.removeFromQueue(id)
      break
    }

    if (queue.hasOwnProperty(id) && queue[id].success === queue[id].started) {
      this.parseCommands(queue[id].user, queue[id].message)
      global.removeFromQueue(id)
    }
  }
}

Parser.prototype.parseCommands = async function (user, message) {
  message = message.trim()
  for (var cmd in this.registeredCmds) {
    if (message.startsWith(cmd)) {
      if (this.permissionsCmds[cmd] === constants.DISABLE) break
      if (this.permissionsCmds[cmd] === constants.VIEWERS ||
        (this.permissionsCmds[cmd] === constants.OWNER_ONLY && this.isOwner(user)) ||
        (this.permissionsCmds[cmd] === constants.MODS && (user.mod || this.isOwner(user)))) {
        var text = message.replace(cmd, '')
        if (typeof this.registeredCmds[cmd] === 'function') this.registeredCmds[cmd](this.selfCmds[cmd], user, text.trim(), message)
        else global.log.error(cmd + ' have wrong null function registered!')
        break // cmd is executed
      }
    }
  }
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
  delete this.registeredCmds[cmd]
  delete this.permissionsCmds[cmd]
  delete this.selfCmds[cmd]
}

Parser.prototype.isOwner = function (user) {
  try {
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
      let onlineViewers = await global.asyncBotDB.find({
        $where: function () {
          return this._id.startsWith('user_') && this.isOnline && this.username.toLowerCase() !== global.configuration.get().twitch.username
        }
      })
      if (onlineViewers.length === 0) return 'unknown'
      return onlineViewers[_.random(0, onlineViewers.length - 1)].username
    },
    '(random.online.follower)': async function () {
      let onlineFollower = await global.asyncBotDB.find({
        $where: function () {
          return this._id.startsWith('user_') && this.isOnline && (!_.isUndefined(this.isFollower) && this.isFollower) && this.username.toLowerCase() !== global.configuration.get().twitch.username
        }
      })
      if (onlineFollower.length === 0) return 'unknown'
      return onlineFollower[_.random(0, onlineFollower.length - 1)].username
    },
    '(random.viewer)': async function () {
      let viewer = await global.asyncBotDB.find({
        $where: function () {
          return this._id.startsWith('user_') && this.username.toLowerCase() !== global.configuration.get().twitch.username
        }
      })
      if (viewer.length === 0) return 'unknown'
      return viewer[_.random(0, viewer.length - 1)].username
    },
    '(random.follower)': async function () {
      let follower = await global.asyncBotDB.find({
        $where: function () {
          return this._id.startsWith('user_') && (!_.isUndefined(this.isFollower) && this.isFollower) && this.username.toLowerCase() !== global.configuration.get().twitch.username
        }
      })
      if (follower.length === 0) return 'unknown'
      return follower[_.random(0, follower.length - 1)].username
    },
    '(random.number-#-to-#)': async function (filter) {
      let numbers = filter.replace('(random.number-', '')
        .replace(')', '')
        .split('-to-')
      try {
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
      global.parser.customVariables[variable] = attr.set
      return ''
    },
    '(var.#)': async function (filter) {
      let variable = filter.replace('(var.', '').replace(')', '')
      if (!_.isUndefined(attr.set) && attr.set.length === 0) return global.parser.customVariables[variable]
      if (global.parser.isOwner(attr.sender) || attr.sender.mod) global.parser.customVariables[variable] = attr.set
      return ''
    }
  }

  let msg = await this.parseMessageEach(random, message)
  msg = await this.parseMessageEach(custom, msg)
  return msg
}

Parser.prototype.parseMessageEach = async function (filters, msg) {
  for (var key in filters) {
    if (!filters.hasOwnProperty(key)) continue

    let fnc = filters[key]
    let regexp = _.escapeRegExp(key)

    // we want to handle # as \w - number in regexp
    regexp = regexp.replace(/#/g, '(\\w+)')
    let rMessage = msg.match((new RegExp('(' + regexp + ')', 'g')))
    if (!_.isNull(rMessage)) {
      for (var bkey in rMessage) {
        let newString = await fnc(rMessage[bkey])
        if (newString.length === 0) msg = ''
        msg = msg.replace(rMessage[bkey], newString)
      }
    }
  }
  return msg
}

Parser.prototype._update = function (self) {
  global.botDB.findOne({ _id: 'customVariables' }, function (err, item) {
    if (err) return global.log.error(err)
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
    global.removeFromQueue(id)
  }
}

global.removeFromQueue = function (id) {
  delete queue[id]
}

module.exports = Parser
