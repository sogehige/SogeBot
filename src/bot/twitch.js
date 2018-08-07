'use strict'

const constants = require('./constants')
const moment = require('moment-timezone')
const _ = require('lodash')
const debug = require('debug')
const cluster = require('cluster')
require('moment-precise-range-plugin')

const config = require('@config')
config.timezone = config.timezone === 'system' || _.isNil(config.timezone) ? moment.tz.guess() : config.timezone

class Twitch {
  constructor () {
    if (require('cluster').isMaster) {
      global.panel.addWidget('twitch', 'widget-title-monitor', 'fab fa-twitch')

      global.panel.registerSockets({
        self: this,
        expose: ['sendTwitchVideo'],
        finally: null
      })
    }
  }

  commands () {
    const commands = [
      {this: this, id: '!uptime', command: '!uptime', fnc: this.uptime, permission: constants.VIEWERS},
      {this: this, id: '!time', command: '!time', fnc: this.time, permission: constants.VIEWERS},
      {this: this, id: '!lastseen', command: '!lastseen', fnc: this.lastseen, permission: constants.VIEWERS},
      {this: this, id: '!watched', command: '!watched', fnc: this.watched, permission: constants.VIEWERS},
      {this: this, id: '!followage', command: '!followage', fnc: this.followage, permission: constants.VIEWERS},
      {this: this, id: '!subage', command: '!subage', fnc: this.subage, permission: constants.VIEWERS},
      {this: this, id: '!followers', command: '!followers', fnc: this.followers, permission: constants.VIEWERS},
      {this: this, id: '!subs', command: '!subs', fnc: this.subs, permission: constants.VIEWERS},
      {this: this, id: '!age', command: '!age', fnc: this.age, permission: constants.VIEWERS},
      {this: this, id: '!me', command: '!me', fnc: this.showMe, permission: constants.VIEWERS},
      {this: this, id: '!top time', command: '!top time', fnc: this.showTopTime, permission: constants.OWNER_ONLY},
      {this: this, id: '!top tips', command: '!top tips', fnc: this.showTopTips, permission: constants.OWNER_ONLY},
      {this: this, id: '!top messages', command: '!top messages', fnc: this.showTopMessages, permission: constants.OWNER_ONLY},
      {this: this, id: '!title', command: '!title', fnc: this.setTitle, permission: constants.OWNER_ONLY},
      {this: this, id: '!game', command: '!game', fnc: this.setGame, permission: constants.OWNER_ONLY}
    ]
    if (global.commons.isSystemEnabled('points')) commands.push({this: this, id: '!top points', command: '!top points', fnc: this.showTopPoints, permission: constants.OWNER_ONLY})
    return commands
  }

  parsers () {
    return [
      {this: this, name: 'lastseen', fnc: this.lastseenUpdate, permission: constants.VIEWERS, priority: constants.LOWEST}
    ]
  }

  sendTwitchVideo (self, socket) {
    socket.emit('twitchVideo', config.settings.broadcaster_username.toLowerCase())
  }

  async uptime (opts) {
    const when = await global.cache.when()
    const time = global.commons.getTime(await global.cache.isOnline() ? when.online : when.offline, true)
    global.commons.sendMessage(global.translate(await global.cache.isOnline() ? 'uptime.online' : 'uptime.offline')
      .replace(/\$days/g, time.days)
      .replace(/\$hours/g, time.hours)
      .replace(/\$minutes/g, time.minutes)
      .replace(/\$seconds/g, time.seconds), opts.sender)
  }

  async time (opts) {
    let message = await global.commons.prepare('time', { time: moment().tz(config.timezone).format('LTS') })
    debug(message); global.commons.sendMessage(message, opts.sender)
  }

  async lastseenUpdate (opts) {
    if (!_.isNil(opts.sender) && !_.isNil(opts.sender.username)) {
      global.users.set(opts.sender.username, {
        time: { message: new Date().getTime() },
        is: { subscriber: !_.isNil(opts.sender.subscriber) ? opts.sender.subscriber : false }
      }, true)
      global.db.engine.update('users.online', { username: opts.sender.username }, { username: opts.sender.username })
    }
    return true
  }

  async followage (opts) {
    let username
    let parsed = opts.parameters.match(/([^@]\S*)/g)

    if (_.isNil(parsed)) username = opts.sender.username
    else username = parsed[0].toLowerCase()

    const user = await global.users.get(username)
    if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.follow) || _.isNil(user.is.follower) || !user.is.follower) {
      let message = await global.commons.prepare('followage.success.never', { username: username })
      debug(message); global.commons.sendMessage(message, opts.sender)
    } else {
      let diff = moment.preciseDiff(moment(user.time.follow).valueOf(), moment().valueOf(), true)
      let output = []
      if (diff.years) output.push(diff.years + ' ' + global.commons.getLocalizedName(diff.years, 'core.years'))
      if (diff.months) output.push(diff.months + ' ' + global.commons.getLocalizedName(diff.months, 'core.months'))
      if (diff.days) output.push(diff.days + ' ' + global.commons.getLocalizedName(diff.days, 'core.days'))
      if (diff.hours) output.push(diff.hours + ' ' + global.commons.getLocalizedName(diff.hours, 'core.hours'))
      if (diff.minutes) output.push(diff.minutes + ' ' + global.commons.getLocalizedName(diff.minutes, 'core.minutes'))
      if (output.length === 0) output.push(0 + ' ' + global.commons.getLocalizedName(0, 'core.minutes'))

      let message = await global.commons.prepare('followage.success.time', {
        username: username,
        diff: output.join(', ')
      })
      debug(message); global.commons.sendMessage(message, opts.sender)
    }
  }

  async followers (opts) {
    const d = debug('twitch:followers')
    let events = await global.db.engine.find('widgetsEventList')
    const onlineViewers = (await global.db.engine.find('users.online')).map((o) => o.username)
    const followers = (await global.db.engine.find('users', { is: { follower: true } })).map((o) => o.username)

    let onlineFollowers = _.intersection(onlineViewers, followers)
    events = _.filter(_.orderBy(events, 'timestamp', 'desc'), (o) => { return o.event === 'follow' })
    moment.locale(await global.configuration.getValue('lang'))

    let lastFollowAgo = ''
    let lastFollowUsername = 'n/a'
    let onlineFollowersCount = _.size(_.filter(onlineFollowers, (o) => o !== config.settings.broadcaster_username && o !== config.settings.bot_username.toLowerCase())) // except bot and user
    if (events.length > 0) {
      lastFollowUsername = events[0].username
      lastFollowAgo = moment(events[0].timestamp).fromNow()
    }

    let message = await global.commons.prepare('followers', {
      lastFollowAgo: lastFollowAgo,
      lastFollowUsername: lastFollowUsername,
      onlineFollowersCount: onlineFollowersCount
    })
    d(message); global.commons.sendMessage(message, opts.sender)
  }

  async subs (opts) {
    const d = debug('twitch:subs')
    let events = await global.db.engine.find('widgetsEventList')
    const onlineViewers = (await global.db.engine.find('users.online')).map((o) => o.username)
    const subscribers = (await global.db.engine.find('users', { is: { subscriber: true } })).map((o) => o.username)

    let onlineSubscribers = _.intersection(onlineViewers, subscribers)
    events = _.filter(_.orderBy(events, 'timestamp', 'desc'), (o) => { return o.event === 'sub' || o.event === 'resub' || o.event === 'subgift' })
    moment.locale(await global.configuration.getValue('lang'))

    let lastSubAgo = ''
    let lastSubUsername = 'n/a'
    let onlineSubCount = _.size(_.filter(onlineSubscribers, (o) => o !== config.settings.broadcaster_username && o !== config.settings.bot_username.toLowerCase())) // except bot and user
    if (events.length > 0) {
      lastSubUsername = events[0].username
      lastSubAgo = moment(events[0].timestamp).fromNow()
    }

    let message = await global.commons.prepare('subs', {
      lastSubAgo: lastSubAgo,
      lastSubUsername: lastSubUsername,
      onlineSubCount: onlineSubCount
    })
    d(message); global.commons.sendMessage(message, opts.sender)
  }

  async subage (opts) {
    let username
    let parsed = opts.parameters.match(/([^@]\S*)/g)

    if (_.isNil(parsed)) username = opts.sender.username
    else username = parsed[0].toLowerCase()

    const user = await global.users.get(username)
    if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.subscribed_at) || _.isNil(user.is.subscriber) || !user.is.subscriber) {
      let message = await global.commons.prepare('subage.success.never', { username: username })
      debug(message); global.commons.sendMessage(message, opts.sender)
    } else {
      let diff = moment.preciseDiff(moment(user.time.subscribed_at).valueOf(), moment().valueOf(), true)
      let output = []
      if (diff.years) output.push(diff.years + ' ' + global.commons.getLocalizedName(diff.years, 'core.years'))
      if (diff.months) output.push(diff.months + ' ' + global.commons.getLocalizedName(diff.months, 'core.months'))
      if (diff.days) output.push(diff.days + ' ' + global.commons.getLocalizedName(diff.days, 'core.days'))
      if (diff.hours) output.push(diff.hours + ' ' + global.commons.getLocalizedName(diff.hours, 'core.hours'))
      if (diff.minutes) output.push(diff.minutes + ' ' + global.commons.getLocalizedName(diff.minutes, 'core.minutes'))
      if (output.length === 0) output.push(0 + ' ' + global.commons.getLocalizedName(0, 'core.minutes'))

      let message = await global.commons.prepare('subage.success.time', {
        username: username,
        diff: output.join(', ')
      })
      debug(message); global.commons.sendMessage(message, opts.sender)
    }
  }

  async age (opts) {
    let username
    let parsed = opts.parameters.match(/([^@]\S*)/g)

    if (_.isNil(parsed)) username = opts.sender.username
    else username = parsed[0].toLowerCase()

    const user = await global.users.get(username)
    if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.created_at)) {
      let message = await global.commons.prepare('age.failed', { username: username })
      debug(message); global.commons.sendMessage(message, opts.sender)
    } else {
      let diff = moment.preciseDiff(moment(user.time.created_at).valueOf(), moment().valueOf(), true)
      let output = []
      if (diff.years) output.push(diff.years + ' ' + global.commons.getLocalizedName(diff.years, 'core.years'))
      if (diff.months) output.push(diff.months + ' ' + global.commons.getLocalizedName(diff.months, 'core.months'))
      if (diff.days) output.push(diff.days + ' ' + global.commons.getLocalizedName(diff.days, 'core.days'))
      if (diff.hours) output.push(diff.hours + ' ' + global.commons.getLocalizedName(diff.hours, 'core.hours'))
      let message = await global.commons.prepare(!_.isNil(parsed) ? 'age.success.withUsername' : 'age.success.withoutUsername', {
        username: username,
        diff: output.join(', ')
      })
      debug(message); global.commons.sendMessage(message, opts.sender)
    }
  }

  async lastseen (opts) {
    try {
      var parsed = opts.parameters.match(/^([\S]+)$/)
      const user = await global.users.get(parsed[0])
      if (_.isNil(user) || _.isNil(user.time) || _.isNil(user.time.message)) {
        global.commons.sendMessage(global.translate('lastseen.success.never').replace(/\$username/g, parsed[0]), opts.sender)
      } else {
        global.commons.sendMessage(global.translate('lastseen.success.time')
          .replace(/\$username/g, parsed[0])
          .replace(/\$when/g, moment.unix(user.time.message / 1000).format('DD-MM-YYYY HH:mm:ss')), opts.sender)
      }
    } catch (e) {
      global.commons.sendMessage(global.translate('lastseen.failed.parse'), opts.sender)
    }
  }

  async watched (opts) {
    try {
      let watched, parsed
      parsed = opts.parameters.match(/^([\S]+)$/)
      const user = await global.users.get(opts.parameters < 1 ? opts.sender.username : parsed[0])
      watched = parseInt(!_.isNil(user) && !_.isNil(user.time) && !_.isNil(user.time.watched) ? user.time.watched : 0) / 1000 / 60 / 60

      let m = await global.commons.prepare('watched.success.time', {
        time: watched.toFixed(1),
        username: user.username
      })
      debug(m); global.commons.sendMessage(m, opts.sender)
    } catch (e) {
      global.commons.sendMessage(global.translate('watched.failed.parse'), opts.sender)
    }
  }

  async showMe (opts) {
    try {
      const user = await global.users.get(opts.sender.username)
      var message = ['$sender']

      // rank
      var rank = await global.systems.ranks.get(user)
      if (await global.systems.ranks.isEnabled() && !_.isNull(rank)) message.push(rank)

      // watchTime
      var watched = await global.users.getWatchedOf(opts.sender.username)
      message.push((watched / 1000 / 60 / 60).toFixed(1) + 'h')

      // points
      if (await global.systems.points.isEnabled()) {
        let userPoints = await global.systems.points.getPointsOf(opts.sender.username)
        message.push(userPoints + ' ' + await global.systems.points.getPointsName(userPoints))
      }

      // message count
      var messages = await global.users.getMessagesOf(opts.sender.username)
      message.push(messages + ' ' + global.commons.getLocalizedName(messages, 'core.messages'))

      // tips
      const [tips, currency] = await Promise.all([
        global.db.engine.find('users.tips', { username: opts.sender.username }),
        global.configuration.getValue('currency')
      ])
      let tipAmount = 0
      for (let t of tips) {
        tipAmount += global.currency.exchange(t.amount, t.currency, currency)
      }
      message.push(`${Number(tipAmount).toFixed(2)} ${currency}`)

      global.commons.sendMessage(message.join(' | '), opts.sender)
    } catch (e) {
      global.log.error(e.stack)
    }
  }

  showTopMessages (opts) {
    opts.parameters = 'messages'
    this.showTop(opts)
  }

  showTopTips (opts) {
    opts.parameters = 'tips'
    this.showTop(opts)
  }

  showTopPoints (opts) {
    opts.parameters = 'points'
    this.showTop(opts)
  }

  showTopTime (opts) {
    opts.parameters = 'time'
    this.showTop(opts)
  }

  async showTop (opts) {
    let sorted, message
    let type = opts.parameters.match(/^(time|points|messages|tips)$/)
    let i = 0

    if (_.isNil(type)) type = 'time'
    else type = type[1]

    if (type === 'points' && global.commons.isSystemEnabled('points')) {
      sorted = []
      for (let user of (await global.db.engine.find('users.watched', { _sort: 'points', _sum: 'points', _total: 20, _group: 'username' }))) {
        sorted.push({ username: user._id, watched: user.points })
      }
      message = global.translate('top.listPoints').replace(/\$amount/g, 10)
    } else if (type === 'time') {
      sorted = []
      for (let user of (await global.db.engine.find('users.watched', { _sort: 'watched', _sum: 'watched', _total: 20, _group: 'username' }))) {
        sorted.push({ username: user._id, watched: user.watched })
      }
      message = global.translate('top.listWatched').replace(/\$amount/g, 10)
    } else if (type === 'tips') {
      let users = {}
      message = global.translate('top.listTips').replace(/\$amount/g, 10)
      let tips = await global.db.engine.find('users.tips')
      for (let tip of tips) {
        if (_.isNil(users[tip.username])) users[tip.username] = { username: tip.username, amount: 0 }
        users[tip.username].amount += global.currency.exchange(tip.amount, tip.currency, await global.configuration.getValue('currency'))
      }
      sorted = _.orderBy(users, 'amount', 'desc')
    } else {
      sorted = []
      for (let user of (await global.db.engine.find('users.message', { _sort: 'messages', _sum: 'messages', _total: 20, _group: 'username' }))) {
        sorted.push({ username: user._id, watched: user.watched })
      }
      message = global.translate('top.listMessages').replace(/\$amount/g, 10)
    }

    if (sorted.length > 0) {
      // remove ignored users
      let ignored = []
      for (let user of sorted) {
        let ignoredUser = await global.db.engine.findOne('users_ignorelist', { username: user.username })
        if (!_.isEmpty(ignoredUser)) ignored.push(user.username)
      }
      _.remove(sorted, (o) => _.includes(ignored, o.username))

      // remove broadcaster and bot accounts
      _.remove(sorted, o => _.includes([config.settings.broadcaster_username.toLowerCase(), config.settings.bot_username.toLowerCase()], o.username))

      sorted = _.chunk(sorted, 10)[0]

      for (let user of sorted) {
        message += (i + 1) + '. ' + (await global.configuration.getValue('atUsername') ? '@' : '') + user.username + ' - '
        if (type === 'time') message += (user.watched / 1000 / 60 / 60).toFixed(1) + 'h'
        else if (type === 'tips') message += user.amount.toFixed(2) + global.currency.symbol(await global.configuration.getValue('currency'))
        else if (type === 'points') {
          let points = user.points
          message += points + ' ' + await global.systems.points.getPointsName(user.points)
        } else message += user.messages
        if (i + 1 < 10 && !_.isNil(sorted[i + 1])) message += ', '
        i++
      }
    } else {
      message += 'no data available'
    }
    global.commons.sendMessage(message, opts.sender)
  }

  async setTitle (opts) {
    if (opts.parameters.length === 0) {
      global.commons.sendMessage(global.translate('title.current')
        .replace(/\$title/g, _.get(await global.db.engine.findOne('api.current', { key: 'status' }), 'value', 'n/a')), opts.sender)
      return
    }
    if (cluster.isMaster) global.api.setTitleAndGame(opts.sender, { title: opts.parameters })
    else process.send({ type: 'call', ns: 'api', fnc: 'setTitleAndGame', args: [opts.sender, { title: opts.parameters }] })
  }

  async setGame (opts) {
    if (opts.parameters.length === 0) {
      global.commons.sendMessage(global.translate('game.current')
        .replace(/\$game/g, _.get(await global.db.engine.findOne('api.current', { key: 'game' }), 'value', 'n/a')), opts.sender)
      return
    }
    if (cluster.isMaster) global.api.setTitleAndGame(opts.sender, { game: opts.parameters })
    else process.send({ type: 'call', ns: 'api', fnc: 'setTitleAndGame', args: [opts.sender, { game: opts.parameters }] })
  }
}

module.exports = Twitch
