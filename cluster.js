'use strict'

const util = require('util')
const _ = require('lodash')
const debug = require('debug')
const crypto = require('crypto')

const Parser = require('./libs/parser')

var workerIsFree = {
  message: true,
  db: true
}

cluster()

function cluster () {
  if (!global.db.engine.connected) {
    setTimeout(() => cluster(), 10)
    return
  }

  global.configuration = new (require('./libs/configuration.js'))()
  global.currency = new (require('./libs/currency.js'))()
  global.users = new (require('./libs/users.js'))()
  global.events = new (require('./libs/events.js'))()
  global.twitch = new (require('./libs/twitch'))()
  global.permissions = new (require('./libs/permissions'))()

  global.lib = {}
  global.lib.translate = new (require('./libs/translate'))()
  global.translate = global.lib.translate.translate

  global.lib.translate._load().then(function () {
    global.systems = require('auto-load')('./libs/systems/')
    global.overlays = require('auto-load')('./libs/overlays/')
    global.games = require('auto-load')('./libs/games/')
    global.integrations = require('auto-load')('./libs/integrations/')

    debug('cluster:worker')(`Worker ${process.pid} has started.`)

    process.on('message', async (data) => {
      switch (data.type) {
        case 'lang':
          await global.lib.translate._load()
          break
        case 'shutdown':
          gracefullyExit()
          break
        case 'message':
          workerIsFree.message = false
          await message(data)
          workerIsFree.message = true
          break
        case 'db':
          workerIsFree.db = false
          switch (data.fnc) {
            case 'find':
              data.items = await global.db.engine.find(data.table, data.where)
              break
            case 'findOne':
              data.items = await global.db.engine.findOne(data.table, data.where)
              break
            case 'increment':
              data.items = await global.db.engine.increment(data.table, data.where, data.object)
              break
            case 'incrementOne':
              data.items = await global.db.engine.incrementOne(data.table, data.where, data.object)
              break
            case 'insert':
              data.items = await global.db.engine.insert(data.table, data.object)
              break
            case 'remove':
              data.items = await global.db.engine.remove(data.table, data.where)
              break
            case 'update':
              data.items = await global.db.engine.update(data.table, data.where, data.object)
              break
            default:
              global.log.error('This db call is not correct\n%j', data)
          }
          process.send(data)
          workerIsFree.db = true
      }
    })
  })

  async function message (data) {
    const id = crypto.randomBytes(64).toString('hex').slice(0, 5)
    debug(`cluster:worker:onMessage:${id}`)(data)
    let sender = data.sender
    let message = data.message
    let skip = data.skip

    debug(`cluster:worker:onMessage:${id}`)('Init of parser')
    const parse = new Parser({ sender: sender, message: message, skip: skip })

    debug(`cluster:worker:onMessage:${id}`)('Checking msg type')
    if (!skip && sender['message-type'] === 'whisper' && (!(await global.configuration.getValue('disableWhisperListener')) || global.commons.isOwner(sender))) {
      global.log.whisperIn(message, {username: sender.username})
    } else if (!skip && !global.commons.isBot(sender.username)) global.log.chatIn(message, {username: sender.username})

    debug(`cluster:worker:onMessage:${id}`)('IsModerated, isIgnored')
    const isModerated = await parse.isModerated()
    const isIgnored = await global.commons.isIgnored(sender)

    if (!isModerated && !isIgnored) {
      if (!skip && !_.isNil(sender.username)) {
        let data = { id: sender['user-id'], is: { online: true, subscriber: _.get(sender, 'subscriber', false), mod: _.get(sender, 'mod', false) } }

        if (!_.get(sender, 'subscriber', false)) _.set(data, 'stats.tier', 0) // unset tier if sender is not subscriber
        await global.db.engine.update('users', { username: sender.username }, data)
        process.send({ type: 'api', fnc: 'isFollower', username: sender.username })

        if (message.startsWith('!')) {
          global.events.fire('command-send-x-times', { username: sender.username, message: message })
        } else if (!message.startsWith('!') && await global.cache.isOnline()) global.db.engine.increment('users', { username: sender.username }, { stats: { messages: 1 } })
      }

      debug(`cluster:worker:onMessage:${id}`)('Process parser')
      await parse.process()
    }
    debug(`cluster:worker:onMessage:${id}`)('Stats sending')
    process.send({ type: 'stats', of: 'parser', value: parse.time() })
  }
}

process.on('unhandledRejection', function (reason, p) {
  global.log.error(`Possibly Unhandled Rejection at: ${util.inspect(p)} reason: ${reason}`)
})

process.on('uncaughtException', (error) => {
  if (_.isNil(global.log)) return console.log(error)
  global.log.error(util.inspect(error))
  global.log.error('+------------------------------------------------------------------------------+')
  global.log.error('| WORKER HAS UNEXPECTEDLY CRASHED                                              |')
  global.log.error('| PLEASE CHECK https://github.com/sogehige/SogeBot/wiki/How-to-report-an-issue |')
  global.log.error('| AND ADD logs/exceptions.log file to your report                              |')
  global.log.error('+------------------------------------------------------------------------------+')
  process.exit(1)
})

function gracefullyExit () {
  if (_.every(workerIsFree)) {
    debug('cluster:worker')(`Exiting gracefully worker ${process.pid}`)
    process.exit()
  } else setTimeout(() => gracefullyExit(), 10)
}
