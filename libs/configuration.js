'use strict'

var ini = require('ini')
var fs = require('fs')
var Database = require('nedb')
var constants = require('./constants')
var _ = require('lodash')

global.botDB = new Database({
  filename: 'sogeBot.db',
  autoload: true
})
global.botDB.persistence.setAutocompactionInterval(60000)

function Configuration () {
  this.config = null
  this.cfgL = {}
  this.loadFile()

  global.parser.register(this, '!set list', this.listSets, constants.OWNER_ONLY)
  global.parser.register(this, '!set', this.setValue, constants.OWNER_ONLY)

  this.loadValues()
}

Configuration.prototype.loadFile = function () {
  console.log('Loading configuration file')
  this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
}

Configuration.prototype.get = function () {
  return this.config
}

Configuration.prototype.register = function (cfgName, success, filter, defaultValue) {
  this.cfgL[cfgName] = {success: success, value: defaultValue, filter: filter}
}

Configuration.prototype.setValue = function (self, sender, text) {
  var cmd = text.split(' ')[0]
  var value = text.replace(text.split(' ')[0], '').trim()
  var filter = self.cfgL[cmd].filter
  var data = {_type: 'settings', success: self.cfgL[cmd].success}
  data['_' + cmd] = {$exists: true}
  if (filter === 'number' && Number.isInteger(parseInt(value.trim(), 10))) {
    data[cmd] = parseInt(value.trim(), 10)
    global.commons.updateOrInsert(data)
    self.cfgL[cmd].value = data[cmd]
  } else if (filter === 'bool' && (value === 'true' || value === 'false')) {
    data[cmd] = (value.toLowerCase() === 'true')
    global.commons.updateOrInsert(data)
    self.cfgL[cmd].value = data[cmd]
  } else if (filter === 'string' && value.trim().length > 0) {
    data[cmd] = value.trim()
    global.commons.updateOrInsert(data)
    self.cfgL[cmd].value = data[cmd]
  } else global.commons.sendMessage('Sorry, ' + sender.username + ', cannot parse !set command.')
}

Configuration.prototype.listSets = function (self, sender, text) {
  var setL = Object.keys(self.cfgL).map(function (item) { return item }).join(', ')
  global.commons.sendMessage(setL.length === 0 ? 'Sorry, ' + sender.username + ', you cannot configure anything' : 'List of possible settings: ' + setL)
}

Configuration.prototype.getValue = function (cfgName) {
  return this.cfgL[cfgName].value
}

Configuration.prototype.loadValues = function () {
  var self = this
  global.botDB.find({type: 'settings'}, function (err, items) {
    if (err) console.log(err)
    items.map(function (item) {
      delete item.type
      delete item._id
      if (!_.isUndefined(self.cfgL[Object.keys(item)[0]])) self.cfgL[Object.keys(item)[0]].value = item[Object.keys(item)[0]]
    })
  })
}

module.exports = Configuration
