'use strict'

// 3rdparty libraries
const _ = require('lodash')
const debug = require('debug')
const crypto = require('crypto')

// bot libraries
var constants = require('../constants')

/*
 * !timers                                                                                                                      - gets an info about timers usage
 * !timers set -name [name-of-timer] -messages [num-of-msgs-to-trigger|default:0] -seconds [trigger-every-x-seconds|default:60] - add new timer
 * !timers unset -name [name-of-timer]                                                                                          - remove timer
 * !timers add -name [name-of-timer] -response '[response]'                                                                     - add new response to timer
 * !timers rm -id [response-id]                                                                                                 - remove response by id
 * !timers toggle -name [name-of-timer]                                                                                         - enable/disable timer by name
 * !timers toggle -id [id-of-response]                                                                                          - enable/disable response by id
 * !timers list                                                                                                                 - get timers list
 * !timers list -name [name-of-timer]                                                                                           - get list of responses on timer
 */

class Timers {
  constructor () {
    if (global.commons.isSystemEnabled(this) && require('cluster').isMaster) {
      this.init()
      global.panel.addMenu({category: 'manage', name: 'timers', id: 'timers'})
      this.sockets()
    }
  }

  commands () {
    return !global.commons.isSystemEnabled('timers')
      ? []
      : [
        {this: this, command: '!timers set', fnc: this.set, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers unset', fnc: this.unset, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers add', fnc: this.add, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers rm', fnc: this.rm, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers list', fnc: this.list, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers toggle', fnc: this.toggle, permission: constants.OWNER_ONLY},
        {this: this, command: '!timers', fnc: this.help, permission: constants.OWNER_ONLY}
      ]
  }

  async sockets () {
    const d = debug('timers:sockets')
    const io = global.panel.io.of('/timers')

    io.on('connection', (socket) => {
      d('Socket /events connected, registering sockets')
      socket.on('list.timers', async (callback) => {
        let [timers, responses] = await Promise.all([
          global.db.engine.find('timers'),
          global.db.engine.find('timers.responses')
        ])
        callback(null, { timers: timers, responses: responses }); d('list.timers => %j', { timers: timers, responses: responses })
      })
      socket.on('toggle.timer', async (timerName, callback) => {
        let fromDb = await global.db.engine.findOne('timers', { name: timerName })
        if (_.isEmpty(fromDb)) return callback(new Error('Timer not found'), null)

        let updated = await global.db.engine.update('timers', { name: timerName }, { enabled: !fromDb.enabled })
        callback(null, updated)
      })
      socket.on('delete.timer', async (timerName, callback) => {
        let timerId
        try {
          timerId = (await global.db.engine.findOne('timers', { name: timerName }))._id.toString()
        } catch (e) {
          return callback(new Error('Timer not found'), null)
        }
        await Promise.all([
          global.db.engine.remove('timers', { name: timerName }),
          global.db.engine.remove('timers.responses', { timerId: timerId })
        ])
        callback(null, timerName)
      })
      socket.on('save-changes', async (data, callback) => {
        d('save-changes - %j', data)
        var timerId = data._id
        var errors = {}
        try {
          const name = data.name.trim().length ? data.name.replace(/ /g, '_') : crypto.createHash('md5').update(new Date().getTime().toString()).digest('hex').slice(0, 5)

          // check if name is compliant
          if (!name.match(/^[a-zA-Z0-9_]+$/)) _.set(errors, 'name', global.translate('webpanel.timers.errors.timer_name_must_be_compliant'))

          if (_.isNil(data.messages) || data.messages.toString().trim().length === 0) _.set(errors, 'messages', global.translate('webpanel.timers.errors.value_cannot_be_empty'))
          else if (!data.messages.match(/^[0-9]+$/)) _.set(errors, 'messages', global.translate('webpanel.timers.errors.this_value_must_be_a_positive_number_or_0'))

          if (_.isNil(data.seconds) || data.seconds.toString().trim().length === 0) _.set(errors, 'seconds', global.translate('webpanel.timers.errors.value_cannot_be_empty'))
          else if (!data.seconds.match(/^[0-9]+$/)) _.set(errors, 'seconds', global.translate('webpanel.timers.errors.this_value_must_be_a_positive_number_or_0'))

          // remove empty operations
          _.remove(data.responses, (o) => o.response.trim().length === 0)

          if (_.size(errors) > 0) throw Error(JSON.stringify(errors))

          // load _proper_ timerId
          var enabled = true
          if (!_.isNil(timerId)) {
            let _timer = await global.db.engine.findOne('timers', { 'name': timerId })
            timerId = _.get(_timer, '_id', null)
            enabled = _.get(_timer, 'enabled', true)
            timerId = timerId ? timerId.toString() : null
          }

          const timer = {
            name: name,
            messages: _.toNumber(data.messages),
            seconds: _.toNumber(data.seconds),
            enabled: enabled,
            trigger: {
              messages: 0,
              timestamp: new Date().getTime()
            }
          }

          if (_.isNil(timerId)) timerId = (await global.db.engine.insert('timers', timer))._id.toString()
          else {
            await Promise.all([
              global.db.engine.remove('timers', { _id: timerId }),
              global.db.engine.remove('timers.responses', { timerId: timerId })
            ])
            timerId = (await global.db.engine.insert('timers', timer))._id.toString()
          }
          var insertArray = []
          for (let response of data.responses) {
            insertArray.push(global.db.engine.insert('timers.responses', {
              timerId: timerId,
              response: response.response,
              enabled: response.enabled,
              timestamp: 0
            }))
          }
          await Promise.all(insertArray)

          callback(null, true)
        } catch (e) {
          global.log.warning(e.message); d(e)

          if (!_.isNil(timerId) && _.isNil(data._id)) { // timerId is __newly__ created, rollback all changes
            await Promise.all([
              global.db.engine.remove('timers', { _id: timerId }),
              global.db.engine.remove('timers.responses', { timerId: timerId })
            ])
          }
          callback(e, e.message)
        }
      })
    })
  }

  async send (self, socket) {
    socket.emit('timers', { timers: await global.db.engine.find('timers'), responses: await global.db.engine.find('timers.responses') })
  }

  help (self, sender) {
    global.commons.sendMessage('╔ ' + global.translate('core.usage') + ' - !timers', sender)
    global.commons.sendMessage(`║ !timers - gets an info about timers usage`, sender)
    global.commons.sendMessage(`║ !timers set -name [name-of-timer] -messages [num-of-msgs-to-trigger|default:0] -seconds [trigger-every-x-seconds|default:60] - add new timer`, sender)
    global.commons.sendMessage(`║ !timers unset -name [name-of-timer] - remove timer`, sender)
    global.commons.sendMessage(`║ !timers add -name [name-of-timer] -response '[response]' - add new response to timer`, sender)
    global.commons.sendMessage(`║ !timers rm -id [response-id] - remove response by id`, sender)
    global.commons.sendMessage(`║ !timers toggle -name [name-of-timer] - enable/disable timer by name`, sender)
    global.commons.sendMessage(`║ !timers toggle -id [id-of-response] - enable/disable response by id`, sender)
    global.commons.sendMessage(`║ !timers list - get timers list`, sender)
    global.commons.sendMessage(`╚ !timers list -name [name-of-timer] - get list of responses on timer`, sender)
  }

  async init () {
    let timers = await global.db.engine.find('timers')
    for (let timer of timers) await global.db.engine.update('timers', { _id: timer._id.toString() }, { trigger: { messages: 0, timestamp: new Date().getTime() } })
    this.check()
  }

  async check () {
    const d = debug('timers:check')
    d('checking timers')
    let timers = await global.db.engine.find('timers', { enabled: true })
    for (let timer of timers) {
      if (timer.messages > 0 && timer.trigger.messages - global.linesParsed + timer.messages > 0) continue // not ready to trigger with messages
      if (timer.seconds > 0 && new Date().getTime() - timer.trigger.timestamp < timer.seconds * 1000) continue // not ready to trigger with seconds

      d('ready to fire - %j', timer)
      let responses = await global.db.engine.find('timers.responses', { timerId: timer._id.toString(), enabled: true })
      let response = _.orderBy(responses, 'timestamp', 'asc')[0]

      if (!_.isNil(response)) {
        d(response.response, global.commons.getOwner())
        global.commons.sendMessage(response.response, global.commons.getOwner())
        await global.db.engine.update('timers.responses', { _id: response._id }, { timestamp: new Date().getTime() })
      }
      await global.db.engine.update('timers', { _id: timer._id.toString() }, { trigger: { messages: global.linesParsed, timestamp: new Date().getTime() } })
    }
    setTimeout(() => this.check(), 1000) // this will run check 1s after full check is correctly done
  }

  async editName (self, socket, data) {
    if (data.value.length === 0) await self.unset(self, null, `-name ${data.id}`)
    else {
      let name = data.value.match(/([a-zA-Z0-9_]+)/)
      if (_.isNil(name)) return
      await global.db.engine.update('timers', { name: data.id.toString() }, { name: name[0] })
    }
  }

  async editResponse (self, socket, data) {
    if (data.value.length === 0) await self.rm(self, null, `-id ${data.id}`)
    else global.db.engine.update('timers.responses', { _id: data.id }, { response: data.value })
  }

  async set (self, sender, text) {
    // -name [name-of-timer] -messages [num-of-msgs-to-trigger|default:0] -seconds [trigger-every-x-seconds|default:60]
    const d = debug('timers:set')
    d('set(%j, %j, %j)', self, sender, text)

    let name = text.match(/-name ([a-zA-Z0-9_]+)/)
    let messages = text.match(/-messages ([0-9]+)/)
    let seconds = text.match(/-seconds ([0-9]+)/)

    if (_.isNil(name)) {
      global.commons.sendMessage(global.translate('timers.name-must-be-defined'), sender)
      return false
    } else {
      name = name[1]
    }

    messages = _.isNil(messages) ? 0 : parseInt(messages[1], 10)
    seconds = _.isNil(seconds) ? 60 : parseInt(seconds[1], 10)

    if (messages === 0 && seconds === 0) {
      global.commons.sendMessage(global.translate('timers.cannot-set-messages-and-seconds-0'), sender)
      return false
    }
    d(name, messages, seconds)

    await global.db.engine.update('timers', { name: name }, { name: name, messages: messages, seconds: seconds, enabled: true, trigger: { messages: global.linesParsed, timestamp: new Date().getTime() } })
    global.commons.sendMessage(global.translate('timers.timer-was-set')
      .replace(/\$name/g, name)
      .replace(/\$messages/g, messages)
      .replace(/\$seconds/g, seconds), sender)
  }

  async unset (self, sender, text) {
    // -name [name-of-timer]
    const d = debug('timers:unset')
    d('unset(%j, %j, %j)', self, sender, text)

    let name = text.match(/-name ([\S]+)/)

    if (_.isNil(name)) {
      global.commons.sendMessage(global.translate('timers.name-must-be-defined'), sender)
      return false
    } else {
      name = name[1]
    }

    let timer = await global.db.engine.findOne('timers', { name: name })
    if (_.isEmpty(timer)) {
      d(global.translate('timers.timer-not-found').replace(/\$name/g, name))
      global.commons.sendMessage(global.translate('timers.timer-not-found').replace(/\$name/g, name), sender)
      return false
    }

    await global.db.engine.remove('timers', { name: name })
    await global.db.engine.remove('timers.responses', { timerId: timer._id.toString() })
    d(global.translate('timers.timer-deleted').replace(/\$name/g, name))
    global.commons.sendMessage(global.translate('timers.timer-deleted')
      .replace(/\$name/g, name), sender)
  }

  async rm (self, sender, text) {
    // -id [id-of-response]
    const d = debug('timers:rm')
    d('rm(%j, %j, %j)', self, sender, text)

    let id = text.match(/-id ([a-zA-Z0-9]+)/)

    if (_.isNil(id)) {
      global.commons.sendMessage(global.translate('timers.id-must-be-defined'), sender)
      return false
    } else {
      id = id[1]
    }

    await global.db.engine.remove('timers.responses', { _id: id })
    global.commons.sendMessage(global.translate('timers.response-deleted')
      .replace(/\$id/g, id), sender)
  }

  async add (self, sender, text) {
    // -name [name-of-timer] -response '[response]'
    const d = debug('timers:add')
    d('add(%j, %j, %j)', self, sender, text)

    let name = text.match(/-name ([\S]+)/)
    let response = text.match(/-response ['"](.+)['"]/)

    if (_.isNil(name)) {
      global.commons.sendMessage(global.translate('timers.name-must-be-defined'), sender)
      return false
    } else {
      name = name[1]
    }

    if (_.isNil(response)) {
      global.commons.sendMessage(global.translate('timers.response-must-be-defined'), sender)
      return false
    } else {
      response = response[1]
    }
    d(name, response)

    let timer = await global.db.engine.findOne('timers', { name: name })
    if (_.isEmpty(timer)) {
      global.commons.sendMessage(global.translate('timers.timer-not-found')
        .replace(/\$name/g, name), sender)
      return false
    }

    let item = await global.db.engine.insert('timers.responses', { response: response, timestamp: new Date().getTime(), enabled: true, timerId: timer._id.toString() })
    d(item)
    global.commons.sendMessage(global.translate('timers.response-was-added')
      .replace(/\$id/g, item._id)
      .replace(/\$name/g, name)
      .replace(/\$response/g, response), sender)
  }

  async list (self, sender, text) {
    // !timers list -name [name-of-timer]
    const d = debug('timers:list')
    d('list(%j, %j, %j)', self, sender, text)

    let name = text.match(/-name ([\S]+)/)

    if (_.isNil(name)) {
      let timers = await global.db.engine.find('timers')
      global.commons.sendMessage(global.translate('timers.timers-list').replace(/\$list/g, _.map(_.orderBy(timers, 'name'), (o) => (o.enabled ? `⚫` : `⚪`) + ' ' + o.name).join(', ')), sender)
      return true
    } else { name = name[1] }

    let timer = await global.db.engine.findOne('timers', { name: name })
    if (_.isEmpty(timer)) {
      global.commons.sendMessage(global.translate('timers.timer-not-found')
        .replace(/\$name/g, name), sender)
      return false
    }

    let responses = await global.db.engine.find('timers.responses', { timerId: timer._id.toString() })
    d(responses)
    await global.commons.sendMessage(global.translate('timers.responses-list').replace(/\$name/g, name), sender)
    for (let response of responses) await global.commons.sendMessage((response.enabled ? `⚫ ` : `⚪ `) + `${response._id} - ${response.response}`, sender)
    return true
  }

  async toggle (self, sender, text) {
    // -name [name-of-timer] or -id [id-of-response]
    const d = debug('timers:toggle')
    d('toggle(%j, %j, %j)', self, sender, text)

    let id = text.match(/-id ([a-zA-Z0-9]+)/)
    let name = text.match(/-name ([\S]+)/)

    if ((_.isNil(id) && _.isNil(name)) || (!_.isNil(id) && !_.isNil(name))) {
      global.commons.sendMessage(global.translate('timers.id-or-name-must-be-defined'), sender)
      return false
    }

    if (!_.isNil(id)) {
      id = id[1]
      d('toggle response - %s', id)
      let response = await global.db.engine.findOne('timers.responses', { _id: id })
      if (_.isEmpty(response)) {
        d(global.translate('timers.response-not-found').replace(/\$id/g, id))
        global.commons.sendMessage(global.translate('timers.response-not-found').replace(/\$id/g, id), sender)
        return false
      }

      await global.db.engine.update('timers.responses', { _id: id }, { enabled: !response.enabled })
      d(global.translate(!response.enabled ? 'timers.response-enabled' : 'timers.response-disabled').replace(/\$id/g, id))
      global.commons.sendMessage(global.translate(!response.enabled ? 'timers.response-enabled' : 'timers.response-disabled')
        .replace(/\$id/g, id), sender)
      return true
    }

    if (!_.isNil(name)) {
      name = name[1]
      let timer = await global.db.engine.findOne('timers', { name: name })
      if (_.isEmpty(timer)) {
        global.commons.sendMessage(global.translate('timers.timer-not-found').replace(/\$name/g, name), sender)
        return false
      }

      await global.db.engine.update('timers', { name: name }, { enabled: !timer.enabled })
      global.commons.sendMessage(global.translate(!timer.enabled ? 'timers.timer-enabled' : 'timers.timer-disabled')
        .replace(/\$name/g, name), sender)
      return true
    }
  }
}

module.exports = new Timers()
