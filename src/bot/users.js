// @flow

'use strict'

var _ = require('lodash')
var constants = require('./constants')
const {
  isMainThread
} = require('worker_threads');
const axios = require('axios')

const Expects = require('./expects')
import Core from './_interface'

const __DEBUG__ = {
  WATCHED: (process.env.DEBUG && process.env.DEBUG.includes('users.watched')),
}

class Users extends Core {
  uiSortCache: String | null = null
  uiSortCacheViewers: Array<Object> = []
  newChattersList: Array<string> = []

  constructor () {
    const settings = {
      users: {
        ignorelist: [],
        showWithAt: true,
      },
      commands: [
        { name: '!regular add', fnc: 'addRegular', permission: constants.OWNER_ONLY },
        { name: '!regular remove', fnc: 'rmRegular', permission: constants.OWNER_ONLY },
        { name: '!ignore add', fnc: 'ignoreAdd', permission: constants.OWNER_ONLY },
        { name: '!ignore rm', fnc: 'ignoreRm', permission: constants.OWNER_ONLY },
        { name: '!ignore check', fnc: 'ignoreCheck', permission: constants.OWNER_ONLY },
      ]
    }

    super({ settings })

    this.addMenu({ category: 'manage', name: 'viewers', id: 'viewers/list' })
    this.addMenu({ category: 'settings', name: 'core', id: 'core' })

    if (isMainThread) {
      this.updateWatchTime(true);
    }
  }

  async ignoreAdd (opts: Object) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase()
      global.users.settings.users.ignorelist = [
        ...new Set([
          ...global.users.settings.users.ignorelist,
          username,
        ]
      )];
      // update ignore list
      global.commons.sendMessage(global.commons.prepare('ignore.user.is.added', { username }), opts.sender)
    } catch (e) {
      global.log.error(e.message)
    }
  }

  async ignoreRm (opts: Object) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase()
      global.users.settings.users.ignorelist = global.users.settings.users.ignorelist.filter(o => o !== username)
      // update ignore list
      global.commons.sendMessage(global.commons.prepare('ignore.user.is.removed', { username }), opts.sender)
    } catch (e) {
      global.log.error(e.message)
    }
  }

  async ignoreCheck (opts: Object) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase()
      const isIgnored = await global.commons.isIgnored(username)
      global.commons.sendMessage(global.commons.prepare(isIgnored ? 'ignore.user.is.ignored' : 'ignore.user.is.not.ignored', { username }), opts.sender)
      return isIgnored
    } catch (e) {}
  }

  async get (username: string) {
    console.warn('Deprecated: users.get, use getById or getByName')
    console.warn(new Error().stack)
    return this.getByName(username)
  }

  async getByName (username: string) {
    username = username.toLowerCase()

    let user = await global.db.engine.findOne('users', { username })

    user.username = _.get(user, 'username', username).toLowerCase()
    user.time = _.get(user, 'time', {})
    user.is = _.get(user, 'is', {})
    user.stats = _.get(user, 'stats', {})
    user.custom = _.get(user, 'custom', {})

    try {
      if (!_.isNil(user._id)) user._id = user._id.toString() // force retype _id
      if (_.isNil(user.time.created_at) && !_.isNil(user.id)) { // this is accessing master (in points) and worker
        if (isMainThread) global.api.fetchAccountAge(username, user.id)
        else global.workers.sendToMaster({ type: 'api', fnc: 'fetchAccountAge', username: username, id: user.id })
      }
    } catch (e) {
      global.log.error(e.stack)
    }
    return user
  }

  async getById (id: string) {
    const user = await global.db.engine.findOne('users', { id })
    user.id = _.get(user, 'id', id)
    user.time = _.get(user, 'time', {})
    user.is = _.get(user, 'is', {})
    user.stats = _.get(user, 'stats', {})
    user.custom = _.get(user, 'custom', {})

    try {
      if (!_.isNil(user._id)) user._id = user._id.toString() // force retype _id
      if (_.isNil(user.time.created_at) && !_.isNil(user.username)) { // this is accessing master (in points) and worker
        if (isMainThread) global.api.fetchAccountAge(user.username, user.id)
        else global.workers.sendToMaster({ type: 'api', fnc: 'fetchAccountAge', username: user.username, id: user.id })
      }
    } catch (e) {
      global.log.error(e.stack)
    }
    return user
  }

  async getAll (where: Object) {
    where = where || {}
    return global.db.engine.find('users', where)
  }

  async addRegular (opts: Object) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase()

      const udb = await global.db.engine.findOne('users', { username })
      if (_.isEmpty(udb)) global.commons.sendMessage(global.commons.prepare('regulars.add.undefined', { username }), opts.sender)
      else {
        global.commons.sendMessage(global.commons.prepare('regulars.add.success', { username }), opts.sender)
        await global.db.engine.update('users', { _id: String(udb._id) }, { is: { regular: true } })
      }
    } catch (e) {
      global.commons.sendMessage(global.commons.prepare('regulars.add.empty'), opts.sender)
    }
  }

  async rmRegular (opts: Object) {
    try {
      const username = new Expects(opts.parameters).username().toArray()[0].toLowerCase()

      const udb = await global.db.engine.findOne('users', { username })
      if (_.isEmpty(udb)) global.commons.sendMessage(global.commons.prepare('regulars.rm.undefined', { username }), opts.sender)
      else {
        global.commons.sendMessage(global.commons.prepare('regulars.rm.success', { username }), opts.sender)
        await global.db.engine.update('users', { _id: String(udb._id) }, { is: { regular: false } })
      }
    } catch (e) {
      global.commons.sendMessage(global.commons.prepare('regulars.rm.empty'), opts.sender)
    }
  }

  async set (username: string, object: Object) {
    if (_.isNil(username)) return global.log.error('username is NULL!\n' + new Error().stack)

    username = username.toLowerCase()
    if (username === global.oauth.settings.bot.username.toLowerCase() || _.isNil(username)) return // it shouldn't happen, but there can be more than one instance of a bot

    const user = await global.db.engine.findOne('users', { username })
    object.username = username
    if (_.isEmpty(user)) {
      const id = await global.api.getIdFromTwitch(username)
      if (id !== null) {
        return global.db.engine.update('users', { id }, object)
      } else return null
    } else return global.db.engine.update('users', { id: user.id }, object)
  }

  async checkNewChatter (id: string, username: string) {
    let watched = await this.getWatchedOf(id)
    // add user as a new chatter in a stream
    if (watched === 0 && !this.newChattersList.includes(username)) {
      await global.db.engine.increment('api.new', { key: 'chatters' }, { value: 1 })
      this.newChattersList.push(username.toLowerCase())
    }
  }

  async getAllOnlineUsernames() {
    return [
      ...new Set([
        ...((await global.db.engine.find('users.online')).map(o => o.username))
      ])
    ]
  }

  async updateWatchTime (isInit) {
    if (isInit) {
      // set all users offline on start
      await global.db.engine.remove('users.online', {})
    }

    if (__DEBUG__.WATCHED) {
      const message = 'Watched time update ' + new Date()
      global.log.debug(Array(message.length + 1).join('='))
      global.log.debug(message)
      global.log.debug(Array(message.length + 1).join('='))

    }

    clearTimeout(this.timeouts['updateWatchTime'])
    let timeout = constants.MINUTE * 5
    try {
      // count watching time when stream is online
      if (await global.cache.isOnline()) {
        let users = await this.getAllOnlineUsernames()
        if (users.length === 0) {
          throw Error('No online users.')
        }
        let updated = []
        for (let username of users) {
          const isIgnored = global.commons.isIgnored(username)
          const isBot = global.commons.isBot(username)
          const isOwner = global.commons.isOwner(username)
          const isNewUser = typeof this.watchedList[username] === 'undefined'

          if (isIgnored || isBot) continue

          const watched = isNewUser ? 0 : Date.now() - this.watchedList[username]
          const id = await global.users.getIdByName(username)
          if (!id) {
            if (__DEBUG__.WATCHED) {
              global.log.debug('error: cannot get id of ' + username)
            }
            continue
          }

          if (isNewUser) this.checkNewChatter(id, username)
          if (!isOwner) global.api._stream.watchedTime += watched
          await global.db.engine.increment('users.watched', { id }, { watched })

          if (__DEBUG__.WATCHED) {
            global.log.debug(username + ': ' + (watched / 1000 / 60) + ' minutes added')
          }
          updated.push(username)
          this.watchedList[username] = Date.now()
        }

        // remove offline users from watched list
        for (let u of Object.entries(this.watchedList)) {
          if (!updated.includes(u[0])) {
            if (__DEBUG__.WATCHED) {
              global.log.debug(u[0] + ': removed from online list')
            }
            delete this.watchedList[u[0]]
          }
        }
      } else {
        throw Error('Stream offline, watch time is not counting, retrying')
      }
    } catch (e) {
      if (__DEBUG__.WATCHED) {
        global.log.debug(e.message)
      }
      this.watchedList = {}
      global.users.newChattersList = []
      timeout = 1000
    }
    this.timeouts['updateWatchTime'] = setTimeout(() => this.updateWatchTime(), timeout)
  }

  async getWatchedOf (id: string) {
    let watched = 0
    for (let item of await global.db.engine.find('users.watched', { id })) {
      let itemPoints = !_.isNaN(parseInt(_.get(item, 'watched', 0))) ? _.get(item, 'watched', 0) : 0
      watched = watched + Number(itemPoints)
    }
    if (Number(watched) < 0) watched = 0

    return parseInt(
      Number(watched) <= Number.MAX_SAFE_INTEGER
        ? watched
        : Number.MAX_SAFE_INTEGER, 10)
  }

  async getMessagesOf (id: string) {
    let messages = 0
    for (let item of await global.db.engine.find('users.messages', { id })) {
      let itemPoints = !_.isNaN(parseInt(_.get(item, 'messages', 0))) ? _.get(item, 'messages', 0) : 0
      messages = messages + Number(itemPoints)
    }
    if (Number(messages) < 0) messages = 0

    return parseInt(
      Number(messages) <= Number.MAX_SAFE_INTEGER
        ? messages
        : Number.MAX_SAFE_INTEGER, 10)
  }

  async getUsernamesFromIds (IdsList: Array<string>) {
    let IdsToUsername = {}
    for (let id of IdsList) {
      if (!_.isNil(IdsToUsername[id])) continue // skip if already had map
      IdsToUsername[id] = (await global.db.engine.findOne('users', { id })).username
    }
    return IdsToUsername
  }

  async getNameById (id: string) {
    let username = (await global.db.engine.findOne('users', { id })).username

    if (typeof username === 'undefined' || username === null) {
      username = await global.api.getUsernameFromTwitch(id)
      if (username) {
        global.db.engine.update('users', { id }, { username })
      }
    }
    return username || null
  }

  async getIdByName (username: string, fetch: boolean = true) {
    let id = (await global.db.engine.findOne('users', { username })).id
    if ((typeof id === 'undefined' || id === 'null') && fetch) {
      id = await global.api.getIdFromTwitch(username)
      if (id !== null) await global.db.engine.update('users', { username }, { id })
    }
    return id
  }

  async sockets () {
    this.socket.on('connection', (socket) => {
      socket.on('find.viewers', async (opts, cb) => {
        opts = _.defaults(opts, { filter: null, show: { subscribers: null, followers: null, active: null, regulars: null } })
        opts.page-- // we are counting index from 0

        let viewers = await global.db.engine.find('users', { }, [
          { from: 'users.tips', as: 'tips', foreignField: 'id', localField: 'id' },
          { from: 'users.bits', as: 'bits', foreignField: 'id', localField: 'id' },
          { from: 'users.points', as: 'points', foreignField: 'id', localField: 'id' },
          { from: 'users.messages', as: 'messages', foreignField: 'id', localField: 'id' },
          { from: 'users.online', as: 'online', foreignField: 'username', localField: 'username' },
          { from: 'users.watched', as: 'watched', foreignField: 'id', localField: 'id' },
        ])

        for (const v of viewers) {
          _.set(v, 'stats.tips', v.tips.map((o) => global.currency.exchange(o.amount, o.currency, global.currency.settings.currency.mainCurrency)).reduce((a, b) => a + b, 0));
          _.set(v, 'stats.bits', v.bits.map((o) => o.amount).reduce((a, b) => a + b, 0));
          _.set(v, 'custom.currency', global.currency.settings.currency.mainCurrency);
          _.set(v, 'points', (v.points[0] || { points: 0 }).points);
          _.set(v, 'messages', (v.messages[0] || { messages: 0 }).messages);
          _.set(v, 'time.watched', (v.watched[0] || { watched: 0 }).watched);
        }

        // filter users
        if (!_.isNil(opts.filter)) viewers = _.filter(viewers, (o) => o.username && o.username.toLowerCase().startsWith(opts.filter.toLowerCase().trim()))
        if (!_.isNil(opts.show.subscribers)) viewers = _.filter(viewers, (o) => _.get(o, 'is.subscriber', false) === opts.show.subscribers)
        if (!_.isNil(opts.show.followers)) viewers = _.filter(viewers, (o) => _.get(o, 'is.follower', false) === opts.show.followers)
        if (!_.isNil(opts.show.regulars)) viewers = _.filter(viewers, (o) => _.get(o, 'is.regular', false) === opts.show.regulars)
        if (!_.isNil(opts.show.active)) viewers = _.filter(viewers, (o) => o.online.length > 0)
        cb(viewers)
      })
      socket.on('followedAt.viewer', async (id, cb) => {
        try {
          const cid = global.oauth.channelId
          const url = `https://api.twitch.tv/helix/users/follows?from_id=${id}&to_id=${cid}`

          const token = global.oauth.settings.bot.accessToken
          if (token === '') cb(new Error('no token available'), null)

          const request = await axios.get(url, {
            headers: {
              'Accept': 'application/vnd.twitchtv.v5+json',
              'Authorization': 'Bearer ' + token
            }
          })
          if (request.data.total === 0) throw new Error('Not a follower')
          else cb(null, new Date(request.data.data[0].followed_at).getTime())
        } catch (e) {
          cb(e.stack, null)
        }
      })
      socket.on('findOne.viewer', async (opts, cb) => {
        let [viewer, tips, bits, points, messages, watched] = await Promise.all([
          global.db.engine.findOne('users', { id: opts.where.id }),
          global.db.engine.find('users.tips', { id: opts.where.id }),
          global.db.engine.find('users.bits', { id: opts.where.id }),
          global.systems.points.getPointsOf(opts.where.id),
          global.users.getMessagesOf(opts.where.id),
          global.users.getWatchedOf(opts.where.id)
        ])
        let online = await global.db.engine.findOne('users.online', { username: viewer.username })

        _.set(viewer, 'stats.tips', tips)
        _.set(viewer, 'stats.bits', bits)
        _.set(viewer, 'stats.messages', messages)
        _.set(viewer, 'points', points)
        _.set(viewer, 'time.watched', watched)

        if (!viewer.lock) {
          viewer.lock = {
            follower: false,
            subscriber: false,
            followed_at: false,
            subscribed_at: false
          }
        } else {
          if (typeof viewer.lock.follower === 'undefined' || viewer.lock.follower === null) viewer.lock.follower = false
          if (typeof viewer.lock.subscriber === 'undefined' || viewer.lock.subscriber === null) viewer.lock.subscriber = false
          if (typeof viewer.lock.followed_at === 'undefined' || viewer.lock.followed_at === null) viewer.lock.followed_at = false
          if (typeof viewer.lock.subscribed_at === 'undefined' || viewer.lock.subscribed_at === null) viewer.lock.subscribed_at = false
        }

        if (!viewer.is) {
          viewer.is = {
            follower: false,
            subscriber: false,
            regular: false
          }
        } else {
          if (typeof viewer.is.follower === 'undefined' || viewer.is.follower === null) viewer.is.follower = false
          if (typeof viewer.is.subscriber === 'undefined' || viewer.is.subscriber === null) viewer.is.subscriber = false
          if (typeof viewer.is.regular === 'undefined' || viewer.is.regular === null) viewer.is.regular = false
        }

        // ONLINE
        let isOnline = !_.isEmpty(_.filter(online, (o) => o.username === viewer.username))
        _.set(viewer, 'is.online', isOnline)

        cb(null, viewer)
      })
      socket.on('delete.viewer', async (opts, cb) => {
        const id = opts._id
        await global.db.engine.remove('users.points', { id })
        await global.db.engine.remove('users.messages', { id })
        await global.db.engine.remove('users.watched', { id })
        await global.db.engine.remove('users.bits', { id })
        await global.db.engine.remove('users.tips', { id })
        await global.db.engine.remove('users', { id })
        cb(null)
      })
      socket.on('update.viewer', async (opts, cb) => {
        const id = opts.items[0]._id
        const viewer = opts.items[0].viewer; delete viewer._id

        // update user points
        await global.db.engine.update('users.points', { id }, { points: isNaN(Number(viewer.points)) ? 0 : Number(viewer.points) })
        delete viewer.points

        // update messages
        await global.db.engine.update('users.messages', { id }, { messages: isNaN(Number(viewer.stats.messages)) ? 0 : Number(viewer.stats.messages) })
        delete viewer.stats.messages

        // update watch time
        await global.db.engine.update('users.watched', { id }, { watched: isNaN(Number(viewer.time.watched)) ? 0 : Number(viewer.time.watched) })
        delete viewer.time.watched

        const bits = viewer.stats.bits; delete viewer.stats.bits
        for (let b of bits) {
          delete b.editation
          if (b.new) {
            delete b.new; delete b._id
            await global.db.engine.insert('users.bits', b)
          } else {
            delete b.new
            const _id = String(b._id); delete b._id
            await global.db.engine.update('users.bits', { _id }, b)
          }
        }

        const tips = viewer.stats.tips; delete viewer.stats.tips
        for (let b of tips) {
          delete b.editation
          if (b.new) {
            delete b.new
            await global.db.engine.insert('users.tips', b)
          } else {
            delete b.new
            const _id = String(b._id); delete b._id
            await global.db.engine.update('users.tips', { _id }, b)
          }
        }

        await global.db.engine.update('users', { id }, viewer)
        cb(null, id)
      })
    })
  }

  async setById (id: string, object: Object) {
    if (_.isNil(id)) return global.log.error('id is NULL!\n' + new Error().stack)
    return global.db.engine.update('users', { id }, object)
  }
}

module.exports = Users
