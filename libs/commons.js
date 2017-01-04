'use strict'

var _ = require('lodash')
var chalk = require('chalk')
var log = global.log

function Commons () {
}

Commons.prototype.isSystemEnabled = function (fn) {
  var name = (typeof fn === 'object') ? fn.constructor.name : fn
  var enabled = global.configuration.get().systems[name.toLowerCase()]
  if (typeof fn === 'object') global.log.info(name + ' system ' + global.translate('core.loaded') + ' ' + (enabled ? chalk.green(global.translate('core.enabled')) : chalk.red(global.translate('core.disabled'))))
  return enabled
}

Commons.prototype.insertIfNotExists = function (data) {
  var callbacks = this.getCallbacks(data)
  var toInsert = this.stripUnderscores(data)
  var self = this

  global.botDB.insert(toInsert, function (err, newItem) {
    if (err) self.runCallback(callbacks.error, data)
    else self.runCallback(callbacks.success, data)
  })
}

Commons.prototype.updateOrInsert = function (data) {
  var callbacks = this.getCallbacks(data)
  var toFind = this.getObjectToFind(data)
  var toUpdate = this.getObjectToUpdate(data)
  var toInsert = this.stripUnderscores(data)
  var self = this
  global.botDB.update(toFind, {$set: toUpdate}, {}, function (err, numReplaced) {
    if (err) log.error(err)
    if (numReplaced === 0) global.botDB.insert(toInsert)
    self.runCallback(callbacks.success, data)
  })
}

Commons.prototype.remove = function (data) {
  var callbacks = this.getCallbacks(data)
  var toRemove = this.getObjectToFind(data)
  var self = this
  global.botDB.remove(toRemove, {}, function (err, numRemoved) {
    if (err) { log.error(err) }
    numRemoved === 0 ? self.runCallback(callbacks.error, data) : self.runCallback(callbacks.success, data)
  })
}

Commons.prototype.getObjectToFind = function (data) {
  var Object = {}
  for (var index in data) {
    if (data.hasOwnProperty(index) && index.startsWith('_')) {
      Object[index] = data[index]
    }
  }
  return this.stripUnderscores(Object)
}

Commons.prototype.getObjectToUpdate = function (data) {
  var Object = {}
  for (var index in data) {
    if (data.hasOwnProperty(index) && !index.startsWith('_') && !(index === 'success' || index === 'error')) {
      Object[index] = data[index]
    }
  }
  return Object
}

Commons.prototype.stripUnderscores = function (data) {
  var Object = {}
  for (var index in data) {
    if (data.hasOwnProperty(index) && !(index === 'success' || index === 'error')) {
      var i = (index.startsWith('_') ? index.slice(1) : index)
      Object[i] = data[index]
    }
  }
  return Object
}

Commons.prototype.getCallbacks = function (data) {
  var Callbacks = {}
  for (var index in data) {
    if (data.hasOwnProperty(index) && (index === 'success' || index === 'error')) {
      Callbacks[index] = data[index]
    }
  }
  return Callbacks
}

Commons.prototype.runCallback = function (cb, data) {
  var value = this.stripUnderscores(data)
  delete value.type
  if (_.isUndefined(cb)) return
  typeof cb === 'function' ? cb(data) : this.sendMessage(global.translate(cb).replace('(value)', value[Object.keys(value)[0]]), {username: global.configuration.get().twitch.owner})
}

Commons.prototype.sendMessage = function (message, sender) {
  if (global.configuration.get().bot.debug) {
    console.log('TO: ' + (_.isNull(sender) ? 'null' : sender.username) + ': ' + message)
    return
  }
  // if sender is null/undefined, we can assume, that username is from dashboard -> bot
  if (_.isUndefined(sender) || _.isNull(sender) || (!_.isUndefined(sender) && sender.username === global.configuration.get().twitch.username)) return // we don't want to reply on bot commands
  message = !_.isUndefined(sender) && !_.isUndefined(sender.username) ? message.replace('(sender)', '@' + sender.username) : message
  sender['message-type'] === 'whisper' ? global.client.whisper(sender.username, message) : global.client.say(global.configuration.get().twitch.owner, message)
}

Commons.prototype.timeout = function (username, reason, timeout) {
  global.client.timeout(global.configuration.get().twitch.owner, username, timeout, reason)
}

module.exports = Commons
