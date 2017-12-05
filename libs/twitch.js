'use strict'

var constants = require('./constants')
var moment = require('moment')
var request = require('request-promise')
var _ = require('lodash')
const debug = require('debug')('twitch')
require('moment-precise-range-plugin')

const config = require('../config.json')

function Twitch () {
  this.isOnline = false

  this.maxViewers = 0
  this.chatMessagesAtStart = global.parser.linesParsed
  this.maxRetries = 5
  this.curRetries = 0
  this.newChatters = 0
  this.streamType = 'live'

  this.current = {
    viewers: 0,
    views: 0,
    followers: 0,
    hosts: 0,
    subscribers: 0,
    bits: 0,
    status: '',
    game: ''
  }

  this.cached = {
    followers: [],
    subscribers: [],
    hosts: []
  }

  this.when = {
    online: null,
    offline: null
  }

  this.cGamesTitles = {} // cached Games and Titles
  global.watcher.watch(this, 'cGamesTitles', this._save)
  global.watcher.watch(this, 'when', this._save)
  global.watcher.watch(this, 'cached', this._save)
  this._load(this)

  var self = this
  setInterval(function () {
    let options = {
      url: 'https://api.twitch.tv/kraken/streams/' + global.channelId,
      headers: {
        Accept: 'application/vnd.twitchtv.v5+json',
        'Client-ID': config.settings.client_id
      }
    }

    if (config.debug.all) {
      global.log.debug('Get current stream data from twitch', options)
    }
    global.client.api(options, function (err, res, body) {
      if (err) {
        if (err.code !== 'ETIMEDOUT' && err.code !== 'ECONNRESET') global.log.error(err, { fnc: 'Twitch#1' })
        return
      }

      if (config.debug.all) {
        global.log.debug('Response: Get current stream data from twitch', body)
      }

      if (res.statusCode === 200 && !_.isNull(body.stream)) {
        self.curRetries = 0
        if (!self.isOnline || self.streamType !== body.stream.stream_type) { // if we are switching from offline or vodcast<->live we want refresh to correct data for start as well
          self.when.online = null
          self.chatMessagesAtStart = global.parser.linesParsed
          self.current.viewers = 0
          self.current.bits = 0
          self.maxViewers = 0
          self.newChatters = 0
          self.chatMessagesAtStart = global.parser.linesParsed
          global.events.fire('stream-started')
          global.events.fire('every-x-seconds', { reset: true })
        }
        self.saveStream(body.stream)
        self.streamType = body.stream.stream_type
        self.isOnline = true
        self.when.offline = null
        global.events.fire('number-of-viewers-is-at-least-x')
        global.events.fire('stream-is-running-x-minutes')
        global.events.fire('every-x-seconds')
      } else {
        if (self.isOnline && self.curRetries < self.maxRetries) { self.curRetries = self.curRetries + 1; return } // we want to check if stream is _REALLY_ offline
        // reset everything
        self.curRetries = 0
        self.isOnline = false
        if (_.isNil(self.when.offline)) {
          self.when.offline = new Date().getTime()
          global.events.fire('stream-stopped')
          global.events.fire('stream-is-running-x-minutes', { reset: true })
          global.events.fire('number-of-viewers-is-at-least-x', { reset: true })
        }
        self.when.online = null
      }
    })

    options = {
      url: 'https://api.twitch.tv/kraken/channels/' + global.channelId + '/follows?limit=100',
      headers: {
        Accept: 'application/vnd.twitchtv.v5+json',
        'Client-ID': config.settings.client_id
      }
    }

    if (config.debug.all) {
      global.log.debug('Get last 100 followers from twitch', options)
    }
    global.client.api(options, function (err, res, body) {
      if (err) {
        if (err.code !== 'ETIMEDOUT' && err.code !== 'ECONNRESET') global.log.error(err, { fnc: 'Twitch#2' })
        return
      }
      if (config.debug.all) {
        global.log.debug('Response: Get last 100 followers from twitch', body)
      }
      if (res.statusCode === 200 && !_.isNull(body)) {
        self.current.followers = body._total

        self.cached.followers = []
        _.each(body.follows, async function (follower) {
          let user = await global.users.get(follower.user.name)
          if (!user.is.follower) {
            if (new Date().getTime() - moment(follower.created_at).format('X') * 1000 < 60000 * 60) global.events.fire('follow', { username: follower.user.name })
          }
          global.users.set(follower.user.name, { id: follower.user._id, is: { follower: true }, time: { followCheck: new Date().getTime(), follow: moment(follower.created_at).format('X') * 1000 } })
          self.cached.followers.push(follower.user.name)
        })
      }
    })

    // count watching time when stream is online
    if (self.isOnline) {
      global.users.getAll({ is: { online: true } }).then(function (users) {
        _.each(users, function (user) {
          // add user as a new chatter in a stream
          if (_.isNil(user.time)) user.time = {}
          if (_.isNil(user.time.watched) || user.time.watched === 0) self.newChatters = self.newChatters + 1
          global.db.engine.increment('users', { username: user.username }, { time: { watched: 60000 } })
        })
      })
    }
  }, 60000)

  setInterval(function () {
    let options = {
      url: 'https://api.twitch.tv/kraken/channels/' + global.channelId + '?timestamp=' + new Date().getTime(),
      headers: {
        Accept: 'application/vnd.twitchtv.v5+json',
        'Client-ID': config.settings.client_id
      }
    }
    if (config.debug.all) {
      global.log.debug('Get current channel data from twitch', options)
    }
    global.client.api(options, function (err, res, body) {
      if (err) {
        if (err.code !== 'ETIMEDOUT' && err.code !== 'ECONNRESET') global.log.error(err, { fnc: 'Twitch#3' })
        return
      }
      if (config.debug.all) {
        global.log.debug('Response: Get current channel data from twitch', body)
      }
      if (res.statusCode === 200 && !_.isNull(body)) {
        self.current.game = body.game
        self.current.status = body.status
        self.current.views = body.views
      }
    })

    if (!_.isNull(global.channelId)) {
      options = {
        url: 'http://tmi.twitch.tv/hosts?include_logins=1&target=' + global.channelId
      }
      if (config.debug.all) {
        global.log.debug('Get current hosts', options)
      }
      global.client.api(options, function (err, res, body) {
        if (err) {
          if (err.code !== 'ETIMEDOUT' && err.code !== 'ECONNRESET') global.log.error(err, { fnc: 'Twitch#4' })
          return
        }
        if (config.debug.all) {
          global.log.debug('Response: Get current hosts', body)
        }
        if (res.statusCode === 200 && !_.isNull(body)) {
          self.current.hosts = body.hosts.length
          if (self.current.hosts > 0) {
            _.each(body.hosts, function (host) {
              if (!_.includes(self.cached.hosts, host.host_login)) {
                global.events.fire('hosted', { username: host.host_login })
              }
            })

            // re-cache hosts
            self.cached.hosts = []
            _.each(body.hosts, function (host) { self.cached.hosts.push(host.host_login) })
          } else {
            self.cached.hosts = []
          }
        }
      })
    }

    options = {
      url: 'https://api.twitch.tv/kraken',
      headers: {
        'Client-ID': config.settings.client_id
      }
    }
    if (config.debug.all) {
      global.log.debug('Get API connection status', options)
    }
    global.client.api(options, function (err, res, body) {
      if (err) {
        global.status.API = constants.DISCONNECTED
        return
      }
      if (config.debug.all) {
        global.log.debug('Response: Get API connection status', body)
      }
      global.status.API = res.statusCode === 200 ? constants.CONNECTED : constants.DISCONNECTED
    })
  }, 10000)

  global.parser.register(this, '!uptime', this.uptime, constants.VIEWERS)
  global.parser.register(this, '!lastseen', this.lastseen, constants.VIEWERS)
  global.parser.register(this, '!watched', this.watched, constants.VIEWERS)
  global.parser.register(this, '!followage', this.followage, constants.VIEWERS)
  global.parser.register(this, '!age', this.age, constants.VIEWERS)
  global.parser.register(this, '!me', this.showMe, constants.VIEWERS)
  global.parser.register(this, '!top', this.showTop, constants.OWNER_ONLY)
  global.parser.register(this, '!title', this.setTitle, constants.OWNER_ONLY)
  global.parser.register(this, '!game', this.setGame, constants.OWNER_ONLY)

  global.parser.registerParser(this, 'lastseen', this.lastseenUpdate, constants.VIEWERS)

  global.configuration.register('sendWithMe', 'core.settings.sendWithMe', 'bool', false)

  this.webPanel()
}

Twitch.prototype._load = async function (self) {
  let cache = await global.db.engine.findOne('cache')

  self.cGamesTitles = !_.isNil(cache.cachedGamesTitles) ? cache.cachedGamesTitles : {}
  self.when = !_.isNil(cache.when) ? cache.when : {}
  self.cached = !_.isNil(cache.cached) ? cache.cached : {}
}

Twitch.prototype._save = async function (self) {
  let caches = await global.db.engine.find('cache')
  _.each(caches, function (cache) {
    global.db.engine.remove('cache', { _id: cache._id })
  })

  global.db.engine.insert('cache', {
    cachedGamesTitles: self.cGamesTitles,
    when: self.when,
    cached: self.cached
  })
  self.timestamp = new Date().getTime()
}

Twitch.prototype.saveStream = function (stream) {
  this.current.viewers = stream.viewers
  if (_.isNil(this.when.online)) this.when.online = stream.created_at
  this.maxViewers = this.maxViewers < this.current.viewers ? this.current.viewers : this.maxViewers

  var messages = global.parser.linesParsed - this.chatMessagesAtStart
  global.stats.save({
    timestamp: new Date().getTime(),
    whenOnline: this.when.online,
    currentViewers: this.current.viewers,
    currentSubscribers: this.current.subscribers,
    currentBits: this.current.bits,
    chatMessages: messages,
    currentFollowers: this.current.followers,
    currentViews: this.current.views,
    maxViewers: this.maxViewers,
    newChatters: this.newChatters,
    currentHosts: this.current.hosts
  })
}

Twitch.prototype.webPanel = function () {
  global.panel.addWidget('twitch', 'widget-title-monitor', 'television')
  global.panel.socketListening(this, 'getTwitchVideo', this.sendTwitchVideo)
  global.panel.socketListening(this, 'getStats', this.sendStats)
}

Twitch.prototype.sendStats = function (self, socket) {
  var messages = self.isOnline ? global.parser.linesParsed - self.chatMessagesAtStart : 0
  var data = {
    uptime: self.getTime(self.when.online, false),
    currentViewers: self.current.viewers,
    currentSubscribers: self.current.subscribers,
    currentBits: self.current.bits,
    chatMessages: messages,
    currentFollowers: self.current.followers,
    currentViews: self.current.views,
    maxViewers: self.maxViewers,
    newChatters: self.newChatters,
    game: self.current.game,
    status: self.current.status,
    currentHosts: self.current.hosts
  }
  socket.emit('stats', data)
}

Twitch.prototype.sendTwitchVideo = function (self, socket) {
  socket.emit('twitchVideo', config.settings.broadcaster_username.toLowerCase())
}

Twitch.prototype.isOnline = function () {
  return this.isOnline
}

Twitch.prototype.getTime = function (time, isChat) {
  var now, days, hours, minutes, seconds
  now = _.isNull(time) || !time ? {days: 0, hours: 0, minutes: 0, seconds: 0} : moment().preciseDiff(time, true)
  if (isChat) {
    days = now.days > 0 ? now.days : ''
    hours = now.hours > 0 ? now.hours : ''
    minutes = now.minutes > 0 ? now.minutes : ''
    seconds = now.seconds > 0 ? now.seconds : ''
    return { days: days,
      hours: hours,
      minutes: minutes,
      seconds: seconds }
  } else {
    days = now.days > 0 ? now.days + 'd' : ''
    hours = now.hours >= 0 && now.hours < 10 ? '0' + now.hours + ':' : now.hours + ':'
    minutes = now.minutes >= 0 && now.minutes < 10 ? '0' + now.minutes + ':' : now.minutes + ':'
    seconds = now.seconds >= 0 && now.seconds < 10 ? '0' + now.seconds : now.seconds
    return days + hours + minutes + seconds
  }
}

Twitch.prototype.uptime = function (self, sender) {
  const time = self.getTime(self.isOnline ? self.when.online : self.when.offline, true)
  global.commons.sendMessage(global.translate(self.isOnline ? 'uptime.online' : 'uptime.offline')
    .replace(/\$days/g, time.days)
    .replace(/\$hours/g, time.hours)
    .replace(/\$minutes/g, time.minutes)
    .replace(/\$seconds/g, time.seconds), sender)
}

Twitch.prototype.lastseenUpdate = async function (self, id, sender, text) {
  if (_.isNull(sender)) {
    global.updateQueue(id, true)
    return
  }
  global.users.set(sender.username, {
    time: { message: new Date().getTime() },
    is: { online: true, subscriber: !_.isNil(sender.subscriber) ? sender.subscriber : false }
  }, true)
  global.updateQueue(id, true)
}

Twitch.prototype.followage = async function (self, sender, text) {
  let username
  let parsed = text.match(/([^@]\S*)/g)

  if (_.isNil(parsed)) username = sender.username
  else username = parsed[0].toLowerCase()

  global.users.isFollower(username)

  const user = await global.users.get(username)
  if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.follow) || _.isNil(user.is.follower) || !user.is.follower) {
    let message = global.commons.prepare('followage.success.never', { username: username })
    debug(message); global.commons.sendMessage(message, sender)
  } else {
    let diff = moment.preciseDiff(user.time.follow, moment(), true)
    let output = []
    if (diff.years) output.push(diff.years + ' ' + global.parser.getLocalizedName(diff.years, 'core.years'))
    if (diff.months) output.push(diff.months + ' ' + global.parser.getLocalizedName(diff.months, 'core.months'))
    if (diff.days) output.push(diff.days + ' ' + global.parser.getLocalizedName(diff.days, 'core.days'))
    if (diff.hours) output.push(diff.hours + ' ' + global.parser.getLocalizedName(diff.hours, 'core.hours'))
    if (diff.minutes) output.push(diff.minutes + ' ' + global.parser.getLocalizedName(diff.minutes, 'core.minutes'))
    if (output.length === 0) output.push(0 + ' ' + global.parser.getLocalizedName(0, 'core.minutes'))

    let message = global.commons.prepare('followage.success.time', {
      username: username,
      diff: output.join(', ')
    })
    debug(message); global.commons.sendMessage(message, sender)
  }
}

Twitch.prototype.age = async function (self, sender, text) {
  let username
  let parsed = text.match(/([^@]\S*)/g)

  if (_.isNil(parsed)) username = sender.username
  else username = parsed[0].toLowerCase()

  const user = await global.users.get(username)
  if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.created_at)) {
    let message = global.commons.prepare('age.failed', { username: username })
    debug(message); global.commons.sendMessage(message, sender)
  } else {
    let diff = moment.preciseDiff(user.time.created_at, moment(), true)
    let output = []
    if (diff.years) output.push(diff.years + ' ' + global.parser.getLocalizedName(diff.years, 'core.years'))
    if (diff.months) output.push(diff.months + ' ' + global.parser.getLocalizedName(diff.months, 'core.months'))
    if (diff.days) output.push(diff.days + ' ' + global.parser.getLocalizedName(diff.days, 'core.days'))
    if (diff.hours) output.push(diff.hours + ' ' + global.parser.getLocalizedName(diff.hours, 'core.hours'))
    let message = global.commons.prepare(!_.isNil(parsed) ? 'age.success.withUsername' : 'age.success.withoutUsername', {
      username: username,
      diff: output.join(', ')
    })
    debug(message); global.commons.sendMessage(message, sender)
  }
}

Twitch.prototype.lastseen = async function (self, sender, text) {
  try {
    var parsed = text.match(/^([\u0500-\u052F\u0400-\u04FF\w]+)$/)
    const user = await global.users.get(parsed[0])
    if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.message)) {
      global.commons.sendMessage(global.translate('lastseen.success.never').replace(/\$username/g, parsed[0]), sender)
    } else {
      global.commons.sendMessage(global.translate('lastseen.success.time')
        .replace(/\$username/g, parsed[0])
        .replace(/\$when/g, moment.unix(user.time.message / 1000).format('DD-MM-YYYY HH:mm:ss')), sender)
    }
  } catch (e) {
    global.commons.sendMessage(global.translate('lastseen.failed.parse'), sender)
  }
}

Twitch.prototype.watched = async function (self, sender, text) {
  try {
    let watched, parsed
    parsed = text.match(/^([\u0500-\u052F\u0400-\u04FF\w]+)$/)
    const user = await global.users.get(text.trim() < 1 ? sender.username : parsed[0])
    watched = parseInt(!_.isNil(user) && !_.isNil(user.time) && !_.isNil(user.time.watched) ? user.time.watched : 0) / 1000 / 60 / 60

    let m = global.commons.prepare('watched.success.time', {
      time: watched.toFixed(1),
      username: user.username
    })
    debug(m); global.commons.sendMessage(m, sender)
  } catch (e) {
    global.commons.sendMessage(global.translate('watched.failed.parse'), sender)
  }
}

Twitch.prototype.showMe = async function (self, sender, text) {
  try {
    const user = await global.users.get(sender.username)
    var message = ['$sender']
    // rank
    var rank = await global.systems.ranks.get(user)
    if (global.commons.isSystemEnabled('ranks') && !_.isNull(rank)) message.push(rank)

    // watchTime
    var watchTime = _.isFinite(parseInt(user.time.watched, 10)) && _.isNumber(parseInt(user.time.watched, 10)) ? user.time.watched : 0
    message.push((watchTime / 1000 / 60 / 60).toFixed(1) + 'h')

    // points
    var points = !_.isUndefined(user.points) ? user.points : 0
    if (global.commons.isSystemEnabled('points')) message.push(points + ' ' + global.systems.points.getPointsName(points))

    // message count
    var messages = !_.isUndefined(user.stats.messages) ? user.stats.messages : 0
    if (!_.isNil(global.users.increment[user.username])) messages = messages + global.users.increment[user.username]
    message.push(messages + ' ' + global.parser.getLocalizedName(messages, 'core.messages'))

    global.commons.sendMessage(message.join(' | '), sender)
  } catch (e) {
    global.log.error(e, { fnc: 'Twitch.prototype.showMe' })
  }
}

Twitch.prototype.showTop = async function (self, sender, text) {
  let sorted, message
  let type = text.trim().match(/^(time|points|messages)$/)
  let i = 0

  if (_.isNil(type)) type = 'time'
  else type = type[1]

  let users = await global.users.getAll()
  if (type === 'points' && global.commons.isSystemEnabled('points')) {
    message = global.translate('top.listPoints').replace(/\$amount/g, 10)
    sorted = _.orderBy(_.filter(users, function (o) { return !_.isNil(o.points) && !global.parser.isOwner(o.username) && o.username !== config.settings.bot_username }), 'points', 'desc')
  } else if (type === 'time') {
    message = global.translate('top.listWatched').replace(/\$amount/g, 10)
    sorted = _.orderBy(_.filter(users, function (o) { return !_.isNil(o.time) && !_.isNil(o.time.watched) && !global.parser.isOwner(o.username) && o.username !== config.settings.bot_username }), 'time.watched', 'desc')
  } else {
    message = global.translate('top.listMessages').replace(/\$amount/g, 10)
    sorted = _.orderBy(_.filter(users, function (o) { return !_.isNil(o.stats) && !_.isNil(o.stats.messages) && !global.parser.isOwner(o.username) && o.username !== config.settings.bot_username }), 'stats.messages', 'desc')
  }

  sorted = _.chunk(sorted, 10)[0]
  for (let user of sorted) {
    message += (i + 1) + '. ' + (global.configuration.getValue('atUsername') ? '@' : '') + user.username + ' - '
    if (type === 'time') message += (user.time.watched / 1000 / 60 / 60).toFixed(1) + 'h'
    else if (type === 'points') message += user.points + ' ' + global.systems.points.getPointsName(user.points)
    else message += user.stats.messages
    if (i + 1 < 10 && !_.isNil(sorted[i + 1])) message += ', '
    i++
  }
  global.commons.sendMessage(message, sender)
}

Twitch.prototype.setTitleAndGame = async function (self, sender, args) {
  args = _.defaults(args, { title: null }, { game: null })

  const options = {
    url: 'https://api.twitch.tv/kraken/channels/' + global.channelId,
    json: true,
    method: 'PUT',
    body: {
      channel: {
        game: !_.isNull(args.game) ? args.game : self.current.game,
        status: !_.isNull(args.title) ? args.title : self.current.status
      }
    },
    headers: {
      Accept: 'application/vnd.twitchtv.v5+json',
      Authorization: 'OAuth ' + config.settings.bot_oauth.split(':')[1]
    }
  }
  if (config.debug.all) {
    global.log.debug('Updating game and title ', options)
  }

  try {
    const response = await request(options)
    if (config.debug.all) {
      global.log.debug('Response: Updating game and title ', response)
    }

    if (!_.isNull(args.game)) {
      if (response.game === args.game.trim()) {
        global.commons.sendMessage(global.translate('game.change.success')
          .replace(/\$game/g, response.game), sender)
        self.current.game = response.game
      } else {
        global.commons.sendMessage(global.translate('game.change.failed')
          .replace(/\$game/g, self.current.game), sender)
      }
    }

    if (!_.isNull(args.title)) {
      if (response.status === args.title.trim()) {
        global.commons.sendMessage(global.translate('title.change.success')
          .replace(/\$title/g, response.status), sender)
        self.current.status = response.status
      } else {
        global.commons.sendMessage(global.translate('title.change.failed')
          .replace(/\$title/g, self.current.status), sender)
      }
    }
  } catch (e) {
    if (config.debug.all) {
      global.log.debug('Response: Updating game and title ', e.message)
    }
  }
}

Twitch.prototype.setTitle = function (self, sender, text) {
  if (text.trim().length === 0) {
    global.commons.sendMessage(global.translate('title.current')
      .replace(/\$title/g, self.current.status), sender)
    return
  }
  self.setTitleAndGame(self, sender, { title: text })
}

Twitch.prototype.setGame = function (self, sender, text) {
  if (text.trim().length === 0) {
    global.commons.sendMessage(global.translate('game.current')
      .replace(/\$game/g, self.current.game), sender)
    return
  }
  self.setTitleAndGame(self, sender, { game: text })
}

Twitch.prototype.sendGameFromTwitch = function (self, socket, game) {
  const options = {
    url: 'https://api.twitch.tv/kraken/search/games?query=' + encodeURIComponent(game) + '&type=suggest',
    json: true,
    headers: {
      Accept: 'application/vnd.twitchtv.v5+json',
      'Client-ID': config.settings.client_id
    }
  }

  if (config.debug.all) {
    global.log.debug('Search game on twitch ', options)
  }

  global.client.api(options, function (err, res, body) {
    if (err) { return global.log.error(err, { fnc: 'Twitch.prototype.sendGameFromTwitch' }) }

    if (config.debug.all) {
      global.log.debug('Response: Search game on twitch ', body)
    }

    if (_.isNull(body.games)) {
      socket.emit('sendGameFromTwitch', false)
    } else {
      socket.emit('sendGameFromTwitch', _.map(body.games, 'name'))
    }
  })
}

Twitch.prototype.deleteUserTwitchGame = function (self, socket, game) {
  delete self.cGamesTitles[game]
  self.sendUserTwitchGamesAndTitles(self, socket)
}

Twitch.prototype.deleteUserTwitchTitle = function (self, socket, data) {
  _.remove(self.cGamesTitles[data.game], function (aTitle) {
    return aTitle === data.title
  })
  self.sendUserTwitchGamesAndTitles(self, socket)
}

Twitch.prototype.editUserTwitchTitle = function (self, socket, data) {
  if (data.new.length === 0) {
    self.deleteUserTwitchTitle(self, socket, data)
    return
  }

  if (_.isUndefined(self.cGamesTitles[data.game])) { // create key if doesnt exists
    self.cGamesTitles[data.game] = []
  }

  if (self.cGamesTitles[data.game].indexOf(data.title) === -1) { // if unique
    self.cGamesTitles[data.game].push(data.new) // also, we need to add game and title to cached property
  } else {
    self.cGamesTitles[data.game][self.cGamesTitles[data.game].indexOf(data.title)] = data.new
  }
  self._save(self) // force save
}

Twitch.prototype.sendUserTwitchGamesAndTitles = function (self, socket) {
  socket.emit('sendUserTwitchGamesAndTitles', self.cGamesTitles)
}

Twitch.prototype.updateGameAndTitle = function (self, socket, data) {
  self.setTitleAndGame(self, null, data)

  if (_.isUndefined(self.cGamesTitles[data.game])) { // create key if doesnt exists
    self.cGamesTitles[data.game] = []
  }

  if (self.cGamesTitles[data.game].indexOf(data.title) === -1) { // if unique
    self.cGamesTitles[data.game].push(data.title) // also, we need to add game and title to cached property
  }
  self.sendStats(self, global.panel.io) // force dashboard update
}

module.exports = Twitch
