'use strict'

var Database = require('nedb')
var dbPromise = require('nedb-promise')
var constants = require('./constants')
var _ = require('lodash')

global.botDB = new Database({
  filename: 'sogeBot.db',
  autoload: true
})
global.botDB.persistence.setAutocompactionInterval(60000)
global.asyncBotDB = dbPromise.fromInstance(global.botDB)

function Configuration () {
  this.config = null
  this.cfgL = {}
  this.default = {}

  global.parser.register(this, '!set list', this.listSets, constants.OWNER_ONLY)
  global.parser.register(this, '!set', this.setValue, constants.OWNER_ONLY)

  this.register('lang', '', 'string', 'en')
  this.register('mute', 'core.mute', 'bool', false)

  this.register('disableWhisperListener', 'whisper.settings.disableWhisperListener', 'bool', true)
  this.register('disableSettingsWhispers', 'whisper.settings.disableSettingsWhispers', 'bool', false)

  const self = this
  setTimeout(function () { global.log.info('Bot is loading configuration data'); self.loadValues() }, 2000)
}

Configuration.prototype.get = function () {
  return this.config
}

Configuration.prototype.register = function (cfgName, success, filter, defaultValue) {
  this.cfgL[cfgName] = {success: success, value: defaultValue, filter: filter}
  this.default[cfgName] = {value: defaultValue}
}

Configuration.prototype.setValue = function (self, sender, text, quiet) {
  try {
    if (_.isNil(quiet)) { quiet = false }
    var cmd = text.split(' ')[0]
    var value = text.replace(text.split(' ')[0], '').trim()
    if (value.length === 0) value = self.default[cmd].value

    var filter = self.cfgL[cmd].filter
    var data = {_type: 'settings', success: self.cfgL[cmd].success, _quiet: quiet}
    data['_' + cmd] = {$exists: true}
    if (filter === 'number' && Number.isInteger(parseInt(value.trim(), 10))) {
      data[cmd] = parseInt(value.trim(), 10)
      global.commons.updateOrInsert(data)
      self.cfgL[cmd].value = data[cmd]
    } else if (filter === 'bool' && (value === 'true' || value === 'false')) {
      data[cmd] = (value.toLowerCase() === 'true')
      data.success = data.success + '.' + value
      if (cmd === 'mute') data.force = true
      global.commons.updateOrInsert(data)
      self.cfgL[cmd].value = data[cmd]
    } else if (filter === 'string') {
      if (cmd === 'lang') {
        self.cfgL[cmd].value = value.trim()
        global.commons.sendToOwners(global.translate('core.lang-selected'))
        global.panel.io.emit('lang', global.translate({root: 'webpanel'}))
        data.success = function () { return true }
      }
      data[cmd] = value.trim()
      global.commons.updateOrInsert(data)
      self.cfgL[cmd].value = data[cmd]
    } else global.commons.sendMessage('Sorry, $sender, cannot parse !set command.', sender)

    let emit = {}
    _.each(self.sets(self), function (key) {
      emit[key] = self.getValue(key)
    })
    global.panel.io.emit('configuration', emit)
  } catch (err) {
    global.commons.sendMessage('Sorry, $sender, cannot parse !set command.', sender)
  }
}

Configuration.prototype.sets = function (self) {
  return Object.keys(self.cfgL).map(function (item) { return item })
}

Configuration.prototype.listSets = function (self, sender, text) {
  var setL = self.sets(self).join(', ')
  global.commons.sendMessage(setL.length === 0 ? 'Sorry, $sender, you cannot configure anything' : 'List of possible settings: ' + setL, sender)
}

Configuration.prototype.getValue = function (cfgName) {
  return this.cfgL[cfgName].value
}

Configuration.prototype.loadValues = function () {
  var self = this
  global.botDB.find({type: 'settings'}, function (err, items) {
    if (err) console.log(err)
    self._loaded = true
    items.map(function (item) {
      delete item.type
      delete item._id
      if (!_.isUndefined(self.cfgL[Object.keys(item)[0]])) self.cfgL[Object.keys(item)[0]].value = item[Object.keys(item)[0]]
    })
  })
}

module.exports = Configuration
