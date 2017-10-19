'use strict'

var express = require('express')
var http = require('http')
var path = require('path')
var basicAuth = require('basic-auth')
const flatten = require('flat')
var _ = require('lodash')

const config = require('../config.json')

const NOT_AUTHORIZED = '0'

function Panel () {
  // setup static server
  var app = express()
  var server = http.createServer(app)
  var port = process.env.PORT || config.panel.port

  // static routing
  app.get('/auth/token.js', function (req, res) {
    const origin = req.headers.referer ? req.headers.referer.substring(0, req.headers.referer.length - 1) : undefined
    const domain = config.panel.domain.trim()
    if (_.isNil(origin)) {
      // file CANNOT be accessed directly
      res.status(401).send('401 Access Denied - This is not a file you are looking for.')
      return
    }

    if (origin.match(new RegExp('https?://' + domain))) {
      res.set('Content-Type', 'application/javascript')
      res.send('const token="' + config.panel.token.trim() + '"')
    } else {
      // file CANNOT be accessed from different domain
      res.status(403).send('403 Forbidden - You are looking at wrong castle.')
    }
  })
  app.get('/playlist', function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', 'playlist', 'index.html'))
  })
  app.get('/overlays/:overlay', function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', 'overlays', req.params.overlay + '.html'))
  })
  app.get('/favicon.ico', function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', 'favicon.ico'))
  })
  app.get('/', this.authUser, function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
  })
  app.get('/:type/:page', this.authUser, function (req, res) {
    res.sendFile(path.join(__dirname, '..', 'public', req.params.type, req.params.page))
  })
  app.use('/dist', express.static(path.join(__dirname, '..', 'public', 'dist')))

  server.listen(port, function () {
    global.log.info('WebPanel is available at http://localhost:%s', port)
  })

  this.io = require('socket.io')(server)
  this.menu = [{category: 'main', name: 'dashboard', id: 'dashboard'}]
  this.widgets = []
  this.socketListeners = []

  global.configuration.register('theme', 'core.theme', 'string', 'light')
  global.configuration.register('percentage', 'core.percentage', 'bool', true)

  this.io.use(function (socket, next) {
    if (config.panel.token.trim() === socket.request._query['token']) next()
    return false
  })

  var self = this
  this.io.on('connection', function (socket) {
    // check auth
    socket.emit('authenticated')

    self.sendMenu(socket)
    self.sendWidget(socket)

    // twitch game and title change
    socket.on('getGameFromTwitch', function (game) { global.twitch.sendGameFromTwitch(global.twitch, socket, game) })
    socket.on('getUserTwitchGames', function () { global.twitch.sendUserTwitchGamesAndTitles(global.twitch, socket) })
    socket.on('deleteUserTwitchGame', function (game) { global.twitch.deleteUserTwitchGame(global.twitch, socket, game) })
    socket.on('deleteUserTwitchTitle', function (data) { global.twitch.deleteUserTwitchTitle(global.twitch, socket, data) })
    socket.on('editUserTwitchTitle', function (data) { global.twitch.editUserTwitchTitle(global.twitch, socket, data) })
    socket.on('updateGameAndTitle', function (data) { global.twitch.updateGameAndTitle(global.twitch, socket, data) })

    socket.on('responses.get', function (at, callback) {
      var responses = flatten(global.translations[global.configuration.getValue('lang')][at])
      _.each(responses, function (value, key) {
        responses[key] = global.translate(at + '.' + key) // needed for nested translations
      })
      callback(responses)
    })
    socket.on('responses.set', function (data) {
      _.remove(global.customTranslations, function (o) { return o.key === data.key })
      global.customTranslations.push(data)
    })
    socket.on('responses.revert', function (data, callback) {
      _.remove(global.customTranslations, function (o) { return o.key === data.key })
      global.db.engine.remove('customTranslations', { key: data.key })
      callback()
    })

    socket.on('getWidgetList', function () { self.sendWidgetList(self, socket) })
    socket.on('addWidget', function (widget, row) { self.addWidgetToDb(self, widget, row, socket) })
    socket.on('deleteWidget', function (widget) { self.deleteWidgetFromDb(self, widget) })
    socket.on('getConnectionStatus', function () { socket.emit('connectionStatus', global.status) })
    socket.on('saveConfiguration', function (data) {
      _.each(data, function (index, value) {
        if (value.startsWith('_')) return true
        global.configuration.setValue(global.configuration, { username: global.parser.getOwner() }, value + ' ' + index, data._quiet)
      })
    })
    socket.on('getConfiguration', function () {
      var data = {}
      _.each(global.configuration.sets(global.configuration), function (key) {
        data[key] = global.configuration.getValue(key)
      })
      socket.emit('configuration', data)
    })

    // send enabled systems
    socket.on('getSystems', function () { socket.emit('systems', config.systems) })
    socket.on('getVersion', function () { socket.emit('version', process.env.npm_package_version) })

    socket.on('parser.isRegistered', function (data) {
      socket.emit(data.emit, { isRegistered: global.parser.isRegistered(data.command) })
    })

    _.each(self.socketListeners, function (listener) {
      socket.on(listener.on, async function (data) {
        if (typeof listener.fnc !== 'function') {
          throw new Error('Function for this listener is undefined' +
            ' widget=' + listener.self.constructor.name + ' on=' + listener.on)
        }
        await listener.fnc(listener.self, self.io, data)
        if (listener.finally && listener.finally !== listener.fnc) listener.finally(listener.self, self.io)
      })
    })

    // send webpanel translations
    socket.emit('lang', global.translate({root: 'webpanel'}))
  })
}

Panel.prototype.authUser = function (req, res, next) {
  var user = basicAuth(req)
  try {
    if (user.name === config.panel.username &&
        user.pass === config.panel.password) {
      return next()
    } else {
      throw new Error(NOT_AUTHORIZED)
    }
  } catch (e) {
    res.set('WWW-Authenticate', 'Basic realm="Authorize to SogeBot WebPanel"')
    return res.sendStatus(401)
  }
}

Panel.prototype.addMenu = function (menu) { this.menu.push(menu) }

Panel.prototype.sendMenu = function (socket) { socket.emit('menu', this.menu) }

Panel.prototype.addWidget = function (id, name, icon) { this.widgets.push({id: id, name: name, icon: icon}) }

Panel.prototype.sendWidget = async function (socket) {
  socket.emit('widgets', await global.db.engine.find('widgets'))
}

Panel.prototype.sendWidgetList = async function (self, socket) {
  let widgets = await global.db.engine.find('widgets')
  if (_.isEmpty(widgets)) socket.emit('widgetList', self.widgets)
  else {
    var sendWidgets = []
    _.each(self.widgets, function (widget) {
      if (!_.includes(_.map(widgets, 'widget'), widget.id)) {
        sendWidgets.push(widget)
      }
    })
    socket.emit('widgetList', sendWidgets)
  }
}

Panel.prototype.addWidgetToDb = async function (self, widget, row, socket) {
  await global.db.engine.update('widgets', { widget: widget }, { widget: widget, column: row })
  self.sendWidget(socket)
}

Panel.prototype.deleteWidgetFromDb = function (self, widget) {
  global.db.engine.remove('widgets', { widget: widget })
}

Panel.prototype.socketListening = function (self, on, fnc) {
  this.socketListeners.push({self: self, on: on, fnc: fnc})
}

Panel.prototype.registerSockets = function (options) {
  const name = options.self.constructor.name.toLowerCase()
  for (let fnc of options.expose) {
    if (!_.isFunction(options.self[fnc])) global.log.error(`Function ${options.self[fnc]} of ${options.self.constructor.name} is undefined`)
    else this.socketListeners.push({self: options.self, on: `${name}.${fnc}`, fnc: options.self[fnc], finally: options.finally})
  }
}

module.exports = Panel
