'use strict'

// 3rdparty libraries
var _ = require('lodash')
// bot libraries
var constants = require('../constants')
var User = require('../user')
var Points = require('./points')
var log = global.log

function Price () {
  if (global.commons.isSystemEnabled('points') && global.commons.isSystemEnabled(this)) {
    global.parser.register(this, '!price set', this.set, constants.OWNER_ONLY)
    global.parser.register(this, '!price list', this.list, constants.OWNER_ONLY)
    global.parser.register(this, '!price unset', this.unset, constants.OWNER_ONLY)
    global.parser.register(this, '!price', this.help, constants.OWNER_ONLY)

    global.parser.registerHelper('!price')

    global.parser.registerParser(this, 'price', this.checkPrice, constants.VIEWERS)

    this.webPanel()
  }
}

Price.prototype.webPanel = function () {
  global.panel.addMenu({category: 'manage', name: 'Price', id: 'price'})
  global.panel.socketListening(this, 'getPrices', this.sendPrices)
  global.panel.socketListening(this, 'deletePrice', this.deletePrice)
  global.panel.socketListening(this, 'createPrice', this.createPrice)
}

Price.prototype.sendPrices = function (self, socket) {
  global.botDB.find({$where: function () { return this._id.startsWith('price') }}, function (err, items) {
    if (err) { log.error(err) }
    socket.emit('Prices', items)
  })
}

Price.prototype.deletePrice = function (self, socket, data) {
  self.unset(self, null, data)
  self.sendPrices(self, socket)
}

Price.prototype.createPrice = function (self, socket, data) {
  self.set(self, null, data.command + ' ' + data.price)
  self.sendPrices(self, socket)
}

Price.prototype.help = function (self, sender) {
  global.commons.sendMessage(global.translate('core.usage') + ': !price set <cmd> <price> | !price unset <cmd> | !price list', sender)
}

Price.prototype.set = function (self, sender, text) {
  try {
    var parsed = text.match(/^([\u0500-\u052F\u0400-\u04FF\w]+) ([0-9]+)$/)
    global.botDB.update({_id: 'price_' + parsed[1]}, {$set: {command: parsed[1], price: parsed[2]}}, {upsert: true})
    global.commons.sendMessage(global.translate('price.success.set')
      .replace('(command)', parsed[1])
      .replace('(amount)', parsed[2])
      .replace('(pointsName)', Points.getPointsName(parsed[2])), sender)
  } catch (e) {
    global.commons.sendMessage(global.translate('price.failed.parse'), sender)
  }
}

Price.prototype.unset = function (self, sender, text) {
  try {
    var parsed = text.match(/^([\u0500-\u052F\u0400-\u04FF\w]+)$/)
    global.botDB.remove({_id: 'price_' + parsed[1], command: parsed[1]}, {}, function (err, numRemoved) {
      if (err) log.error(err)
      var message = (numRemoved === 0 ? global.translate('price.failed.remove') : global.translate('price.success.remove'))
      global.commons.sendMessage(message.replace('(command)', parsed[1]), sender)
    })
  } catch (e) {
    global.commons.sendMessage(global.translate('price.failed.parse'), sender)
  }
}

Price.prototype.list = function (self, sender, text) {
  var parsed = text.match(/^([\u0500-\u052F\u0400-\u04FF\w]+)$/)
  if (_.isNull(parsed)) {
    global.botDB.find({$where: function () { return this._id.startsWith('price') }}, function (err, docs) {
      if (err) { log.error(err) }
      var commands = []
      docs.forEach(function (e, i, ar) { commands.push(e.command) })
      var output = (docs.length === 0 ? global.translate('price.failed.list') : global.translate('price.success.list') + ': ' + commands.join(', '))
      global.commons.sendMessage(output, sender)
    })
  } else {
    global.commons.sendMessage(global.translate('price.failed.parse', sender))
  }
}

Price.prototype.checkPrice = function (self, id, sender, text) {
  if (global.parser.registeredHelpers.includes(text.trim()) || global.parser.isOwner(sender)) {
    global.updateQueue(id, true)
    return
  }
  try {
    var parsed = text.match(/^!([\u0500-\u052F\u0400-\u04FF\w]+)/)
    global.botDB.findOne({_id: 'price_' + parsed[1]}, function (err, item) {
      if (err) log.error(err)
      if (!_.isNull(item)) {
        var user = new User(sender.username)
        user.isLoaded().then(function () {
          var availablePts = parseInt(user.get('points'), 10)
          var removePts = parseInt(item.price, 10)
          var command = item.command
          if (!_.isFinite(availablePts) || !_.isNumber(availablePts) || availablePts < removePts) {
            global.updateQueue(id, false)
            global.commons.sendMessage(global.translate('price.failed.notEnough')
              .replace('(amount)', removePts)
              .replace('(command)', command)
              .replace('(pointsName)', Points.getPointsName(removePts)), sender)
          } else {
            user.set('points', availablePts - removePts)
            global.updateQueue(id, true)
          }
        })
      } else {
        global.updateQueue(id, true)
      }
    })
  } catch (err) {
    global.updateQueue(id, true) // it's not a command -> no price
  }
}

module.exports = new Price()
