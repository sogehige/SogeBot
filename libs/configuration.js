'use strict'

const constants = require('./constants')
const _ = require('lodash')
const config = require('../config.json')
const debug = require('debug')

function Configuration () {
  this.config = null
  this.cfgL = {}
  this.default = {}

  this.register('mute', 'core.mute', 'bool', false)
  this.register('disableWhisperListener', 'whisper.settings.disableWhisperListener', 'bool', true)
  this.register('disableSettingsWhispers', 'whisper.settings.disableSettingsWhispers', 'bool', false)
}

Configuration.prototype.commands = function () {
  return [
    { this: this, command: '!set list', fnc: this.listSets, permission: constants.OWNER_ONLY },
    { this: this, command: '!set', fnc: this.setValue, permission: constants.OWNER_ONLY },
    { this: this, command: '!_debug', fnc: this.debug, permission: constants.OWNER_ONLY }
  ]
}

Configuration.prototype.debug = async function (self, sender) {
  let [api, widgets] = await Promise.all([
    global.db.engine.find('APIStats'),
    global.db.engine.find('widgets')
  ])

  let stats = {
    'helix': {
      'total': _.size(_.filter(api, (o) => o.api === 'helix')),
      'errors': _.size(_.filter(api, (o) => o.api === 'helix' && o.code !== 200))
    },
    'kraken': {
      'total': _.size(_.filter(api, (o) => o.api === 'kraken')),
      'errors': _.size(_.filter(api, (o) => o.api === 'kraken' && o.code !== 200))
    },
    'tmi': {
      'total': _.size(_.filter(api, (o) => o.api === 'tmi')),
      'errors': _.size(_.filter(api, (o) => o.api === 'tmi' && o.code !== 200))
    }
  }

  let oauth = {
    broadcaster: _.isNil(config.settings.broadcaster_oauth) || !config.settings.broadcaster_oauth.match(/oauth:[\w]*/),
    bot: _.isNil(config.settings.bot_oauth) || !config.settings.bot_oauth.match(/oauth:[\w]*/)
  }

  global.log.debug(`======= COPY DEBUG MESSAGE FROM HERE =======`)
  global.log.debug(`GENERAL | OS: ${process.env.npm_config_user_agent} | DB: ${config.database.type} | Bot version: ${process.env.npm_package_version} | Bot uptime: ${process.uptime()} | Bot lang: ${global.configuration.getValue('lang')} | Bot mute: ${global.configuration.getValue('mute')}`)
  global.log.debug(`SYSTEMS | ${_.keys(_.pickBy(config.systems)).join(', ')}`)
  global.log.debug(`WIDGETS | ${_.map(widgets, 'widget').join(', ')}`)
  global.log.debug(`API | HELIX ${stats.helix.total}/${stats.helix.errors} | KRAKEN ${stats.kraken.total}/${stats.kraken.errors} | TMI ${stats.tmi.total}/${stats.tmi.errors}`)
  global.log.debug(`WEBHOOKS | ${_.keys(_.pickBy(global.webhooks.enabled)).join(', ')}`)
  global.log.debug(`OAUTH | BOT ${!oauth.bot} | BROADCASTER ${!oauth.broadcaster}`)
  global.log.debug('======= END OF DEBUG MESSAGE =======')
}

Configuration.prototype.get = function () {
  return this.config
}

Configuration.prototype.register = function (cfgName, success, filter, defaultValue) {
  debug('configuration:register')(`Registering ${cfgName}:${filter} with default value ${defaultValue}`)
  this.cfgL[cfgName] = {success: success, value: defaultValue, filter: filter}
  this.default[cfgName] = {value: defaultValue}
}

Configuration.prototype.setValue = async function (self, sender, text, quiet) {
  try {
    var cmd = text.split(' ')[0]
    debug('configuration:setValue')('cmd: %s', cmd)
    var value = text.replace(text.split(' ')[0], '').trim()
    var filter = self.cfgL[cmd].filter
    quiet = _.isBoolean(quiet) ? quiet : false

    if (value.length === 0) value = self.default[cmd].value
    debug('configuration:setValue')('filter: %s', filter)
    debug('configuration:setValue')('key: %s', cmd)
    debug('configuration:setValue')('value to set: %s', value)
    debug('configuration:setValue')('text: %s', text)
    debug('configuration:setValue')('isQuiet: %s', quiet)

    if (_.isString(value)) value = value.trim()
    if (filter === 'number' && Number.isInteger(parseInt(value, 10))) {
      value = parseInt(value, 10)

      await global.db.engine.update('settings', { key: cmd }, { key: cmd, value: value })
      if (!quiet) global.commons.sendToOwners(global.translate(self.cfgL[cmd].success).replace(/\$value/g, value))

      self.cfgL[cmd].value = value
    } else if (filter === 'bool' && (value === 'true' || value === 'false' || _.isBoolean(value))) {
      value = !_.isBoolean(value) ? (value.toLowerCase() === 'true') : value

      await global.db.engine.update('settings', { key: cmd }, { key: cmd, value: value })
      if (!quiet) global.commons.sendToOwners(global.translate(self.cfgL[cmd].success + '.' + value).replace(/\$value/g, value))

      self.cfgL[cmd].value = value
    } else if (filter === 'string' && !(value === 'true' || value === 'false' || _.isBoolean(value)) && !Number.isInteger(parseInt(value, 10))) {
      self.cfgL[cmd].value = value
      if (cmd === 'lang') {
        if (!quiet) global.commons.sendToOwners(global.translate('core.lang-selected'))
        global.panel.io.emit('lang', global.translate({root: 'webpanel'}))
      }
      await global.db.engine.update('settings', { key: cmd }, { key: cmd, value: value })
      if (cmd !== 'lang' && !quiet) global.commons.sendToOwners(global.translate(self.cfgL[cmd].success).replace(/\$value/g, value))
    } else global.commons.sendMessage('Sorry, $sender, cannot parse !set command.', sender)

    let emit = {}
    _.each(self.sets(self), async function (key) {
      emit[key] = await self.getValue(key)
    })
  } catch (err) {
    console.log(err)
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

Configuration.prototype.getValue = async function (cfgName) {
  let item = await global.db.engine.findOne('settings', { key: cfgName })
  if (_.isEmpty(item)) return this.cfgL[cfgName].value // return default value if not saved
  if (_.includes(['true', 'false'], item.value.toString().toLowerCase())) return item.value.toString().toLowerCase() === 'true'
  else return item.value
}

module.exports = Configuration
