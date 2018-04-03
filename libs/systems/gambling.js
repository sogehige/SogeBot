'use strict'

// 3rdparty libraries
const _ = require('lodash')

// bot libraries
const constants = require('../constants')
const config = require('../../config.json')
const debug = require('debug')('systems:gambling')

const ERROR_NOT_ENOUGH_OPTIONS = '0'
const ERROR_ZERO_BET = '1'
const ERROR_NOT_ENOUGH_POINTS = '2'

/*
 * !gamble [amount] - gamble [amount] points with `chanceToWin` chance
 * !seppuku         - timeout yourself
 * !roulette        - 50/50 chance to timeout yourself
 * !duel [points]   - start or participate in duel
 */

class Gambling {
  constructor () {
    this.collection = 'gambling'

    global.configuration.register('seppukuTimeout', 'gambling.seppuku.timeout', 'number', 10)
    global.configuration.register('rouletteTimeout', 'gambling.roulette.timeout', 'number', 10)
    global.configuration.register('fightmeTimeout', 'gambling.fightme.timeout', 'number', 10)

    global.configuration.register('gamblingCooldownBypass', 'gambling.cooldown.bypass', 'bool', false)
    global.configuration.register('duelCooldown', 'gambling.cooldown.duel', 'number', 0)
    global.configuration.register('fightmeCooldown', 'gambling.cooldown.fightme', 'number', 0)

    global.configuration.register('gamblingChanceToWin', 'gambling.gamble.chanceToWin', 'number', 50)

    if (require('cluster').isMaster) this.pickDuelWinner()
  }

  commands () {
    const isGamblingEnabled = global.commons.isSystemEnabled('gambling')
    const isPointsEnabled = global.commons.isSystemEnabled('points')
    let commands = []

    if (isGamblingEnabled) {
      commands.push(
        {this: this, command: '!seppuku', fnc: this.seppuku, permission: constants.VIEWERS},
        {this: this, command: '!roulette', fnc: this.roulette, permission: constants.VIEWERS},
        {this: this, command: '!fightme', fnc: this.fightme, permission: constants.VIEWERS}
      )

      if (isPointsEnabled) {
        commands.push(
          {this: this, command: '!gamble', fnc: this.gamble, permission: constants.VIEWERS},
          {this: this, command: '!duel', fnc: this.duel, permission: constants.VIEWERS}
        )
      }
    }
    return commands
  }

  get duelTimestamp () {
    return new Promise(async (resolve, reject) => resolve(_.get(await global.db.engine.findOne(`${this.collection}.duel`, { key: '_timestamp' }), 'value', 0)))
  }
  set duelTimestamp (v) {
    if (v === 0) global.db.engine.remove(`${this.collection}.duel`, { key: '_timestamp' })
    else global.db.engine.update(`${this.collection}.duel`, { key: '_timestamp' }, { value: v })
  }

  get duelCooldown () {
    return new Promise(async (resolve, reject) => resolve(_.get(await global.db.engine.findOne(`${this.collection}.duel`, { key: '_cooldown' }), 'value', 0)))
  }
  set duelCooldown (v) {
    if (v === 0) global.db.engine.remove(`${this.collection}.duel`, { key: '_cooldown' })
    else global.db.engine.update(`${this.collection}.duel`, { key: '_cooldown' }, { value: v })
  }

  get fightmeCooldown () {
    return new Promise(async (resolve, reject) => resolve(_.get(await global.db.engine.findOne(`${this.collection}.fightme`, { key: '_cooldown' }), 'value', 0)))
  }
  set fightmeCooldown (v) {
    if (v === 0) global.db.engine.remove(`${this.collection}.fightme`, { key: '_cooldown' })
    else global.db.engine.update(`${this.collection}.fightme`, { key: '_cooldown' }, { value: v })
  }

  get duelUsers () {
    return new Promise(async (resolve, reject) => {
      let users = await global.db.engine.find(`${this.collection}.duel`, { key: '_users' })
      let toResolve = {}
      for (let user of users) {
        toResolve[user.user] = user.tickets
      }
      resolve(toResolve)
    })
  }
  set duelUsers (v) {
    if (_.isNil(v)) global.db.engine.remove(`${this.collection}.duel`, { key: '_users' })
    else {
      for (let [user, tickets] of Object.entries(v)) global.db.engine.update(`${this.collection}.duel`, { key: '_users' }, { user: user, tickets: tickets })
    }
  }

  async pickDuelWinner () {
    const [users, timestamp] = await Promise.all([
      this.duelUsers,
      this.duelTimestamp
    ])
    if (timestamp === 0 || new Date().getTime() - timestamp < 1000 * 60 * 5) return setTimeout(() => this.pickDuelWinner(), 30000)

    let total = 0
    for (let user of Object.entries(users)) total += parseInt(user[1], 10)

    let winner = _.random(0, total, false)
    let winnerUsername
    for (let [user, tickets] of Object.entries(users)) {
      winner = winner - tickets
      if (winner <= 0) { // winner tickets are <= 0 , we have winner
        winnerUsername = user
        break
      }
    }

    const username = winnerUsername
    const tickets = users[username]
    const probability = tickets / (total / 100)

    let m = global.commons.prepare(_.size(users) === 1 ? 'gambling.duel.noContestant' : 'gambling.duel.winner', {
      pointsName: await global.systems.points.getPointsName(total),
      points: total,
      probability: _.round(probability, 2),
      ticketsName: await global.systems.points.getPointsName(tickets),
      tickets: tickets.toString(),
      winner: username
    })
    debug(m); global.commons.sendMessage(m, { username: username }, { force: true })

    // give user his points
    global.db.engine.incrementOne('users', { username: username }, { points: parseInt(total, 10) })

    // reset duel
    this.duelUsers = null
    this.duelTimestamp = 0

    setTimeout(() => this.pickDuelWinner(), 30000)
  }

  async duel (self, sender, text) {
    let points, message

    sender['message-type'] = 'chat' // force responses to chat
    try {
      let parsed = text.trim().match(/^([\d]+|all)$/)
      if (_.isNil(parsed)) throw Error(ERROR_NOT_ENOUGH_OPTIONS)

      const user = await global.users.get(sender.username)
      points = parsed[1] === 'all' && !_.isNil(user.points) ? user.points : parsed[1]

      if (parseInt(points, 10) === 0) throw Error(ERROR_ZERO_BET)
      if (_.isNil(user.points) || user.points < points) throw Error(ERROR_NOT_ENOUGH_POINTS)
      global.db.engine.incrementOne('users', { username: sender.username }, { points: parseInt(points, 10) * -1 })

      // check if user is already in duel and add points
      let newDuelist = true
      let users = await self.duelUsers
      _.each(users, function (value, key) {
        if (key.toLowerCase() === sender.username.toLowerCase()) {
          let userToUpdate = {}
          userToUpdate[key] = parseInt(users[key], 10) + parseInt(points, 10)
          self.duelUsers = userToUpdate
          newDuelist = false
          return false
        }
      })
      if (newDuelist) {
        // check if under gambling cooldown
        const cooldown = await global.configuration.getValue('duelCooldown')
        const isMod = await global.commons.isMod(sender)
        if (new Date().getTime() - (await self.duelCooldown) > cooldown * 1000 ||
          (await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(sender)))) {
          // save new cooldown if not bypassed
          if (!(await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(sender)))) self.duelCooldown = new Date().getTime()
          let newUser = {}
          newUser[sender.username.toLowerCase()] = parseInt(points, 10)
          self.duelUsers = newUser
        } else {
          message = global.commons.prepare('gambling.fightme.cooldown', {
            minutesName: global.parser.getLocalizedName(Math.round(((cooldown * 1000) - (new Date().getTime() - (await self.duelCooldown))) / 1000 / 60), 'core.minutes'),
            cooldown: Math.round(((cooldown * 1000) - (new Date().getTime() - (await self.duelCooldown))) / 1000 / 60) })
          debug(message); global.commons.sendMessage(message, sender)
          return true
        }
      }

      // if new duel, we want to save timestamp
      if ((await self.duelTimestamp) === 0) {
        self.duelTimestamp = new Date().getTime()
        message = global.commons.prepare('gambling.duel.new', {
          minutesName: global.commons.getLocalizedName(5, 'core.minutes'),
          minutes: 5 })
        debug(message); global.commons.sendMessage(message, sender)
      }

      message = global.commons.prepare(newDuelist ? 'gambling.duel.joined' : 'gambling.duel.added', {
        pointsName: await global.systems.points.getPointsName((await self.duelUsers)[sender.username.toLowerCase()]),
        points: (await self.duelUsers)[sender.username.toLowerCase()]
      })
      debug(message); global.commons.sendMessage(message, sender)
    } catch (e) {
      switch (e.message) {
        case ERROR_NOT_ENOUGH_OPTIONS:
          global.commons.sendMessage(global.translate('gambling.duel.notEnoughOptions'), sender)
          break
        case ERROR_ZERO_BET:
          message = global.commons.prepare('gambling.duel.zeroBet', {
            pointsName: await global.systems.points.getPointsName(0)
          })
          debug(message); global.commons.sendMessage(message, sender)
          break
        case ERROR_NOT_ENOUGH_POINTS:
          message = global.commons.prepare('gambling.duel.notEnoughPoints', {
            pointsName: await global.systems.points.getPointsName(points),
            points: points
          })
          debug(message); global.commons.sendMessage(message, sender)
          break
        default:
          global.log.error(e.stack)
          global.commons.sendMessage(global.translate('core.error'), sender)
      }
    }
  }

  async roulette (self, sender) {
    sender['message-type'] = 'chat' // force responses to chat

    let isAlive = _.random(0, 1, false)
    const isMod = await global.commons.isMod(sender)

    global.commons.sendMessage(global.translate('gambling.roulette.trigger'), sender)
    if (global.commons.isBroadcaster(sender)) {
      setTimeout(() => global.commons.sendMessage(global.translate('gambling.roulette.broadcaster'), sender), 2000)
      return
    }

    if (isMod) {
      setTimeout(() => global.commons.sendMessage(global.translate('gambling.roulette.mod'), sender), 2000)
      return
    }

    setTimeout(async () => {
      if (!isAlive) global.client.timeout(config.settings.broadcaster_username, sender.username, await global.configuration.getValue('rouletteTimeout'))
      global.commons.sendMessage(isAlive ? global.translate('gambling.roulette.alive') : global.translate('gambling.roulette.dead'), sender)
    }, 2000)
  }

  async seppuku (self, sender) {
    if (global.commons.isBroadcaster(sender)) {
      global.commons.sendMessage(global.translate('gambling.seppuku.broadcaster'), sender)
      return
    }

    const isMod = await global.commons.isMod(sender)
    if (isMod) {
      global.commons.sendMessage(global.translate('gambling.seppuku.mod'), sender)
      return
    }

    global.commons.sendMessage(global.translate('gambling.seppuku.text'), sender)
    global.client.timeout(config.settings.broadcaster_username, sender.username, await global.configuration.getValue('seppukuTimeout'))
  }

  async fightme (self, sender, text) {
    sender['message-type'] = 'chat' // force responses to chat
    var username

    try {
      username = text.trim().match(/^@?([\S]+)$/)[1].toLowerCase()
      sender.username = sender.username.toLowerCase()
    } catch (e) {
      global.commons.sendMessage(global.translate('gambling.fightme.notEnoughOptions'), sender)
      return
    }

    if (sender.username === username) {
      global.commons.sendMessage(global.translate('gambling.fightme.cannotFightWithYourself'), sender)
      return
    }

    // check if you are challenged by user
    const challenge = await global.db.engine.findOne(`${self.collection}.fightme`, { key: '_users', user: username, challenging: sender.username })
    const isChallenged = !_.isEmpty(challenge)
    if (isChallenged) {
      let winner = _.random(0, 1, false)
      let isMod = {
        user: await global.commons.isMod(username),
        sender: await global.commons.isMod(sender)
      }

      // vs broadcaster
      if (global.commons.isBroadcaster(sender) || global.commons.isBroadcaster(username)) {
        debug('vs broadcaster')
        global.commons.sendMessage(global.translate('gambling.fightme.broadcaster')
          .replace(/\$winner/g, global.commons.isBroadcaster(sender) ? sender.username : username), sender)
        isMod = global.commons.isBroadcaster(sender) ? isMod.user : isMod.sender
        if (!isMod) global.client.timeout(config.settings.broadcaster_username, global.commons.isBroadcaster(sender) ? username : sender.username, await global.configuration.getValue('fightmeTimeout'))
        global.db.engine.remove(`${self.collection}.fightme`, { _id: challenge._id.toString() })
        return
      }

      // mod vs mod
      if (isMod.user && isMod.sender) {
        debug('mod vs mod')
        global.commons.sendMessage(global.translate('gambling.fightme.bothModerators')
          .replace(/\$challenger/g, username), sender)
        global.db.engine.remove(`${self.collection}.fightme`, { _id: challenge._id.toString() })
        return
      }

      // vs mod
      if (isMod.user || isMod.sender) {
        debug('vs mod')
        global.commons.sendMessage(global.translate('gambling.fightme.oneModerator')
          .replace(/\$winner/g, isMod.sender ? sender.username : username), sender)
        global.client.timeout(config.settings.broadcaster_username, isMod.sender ? username : sender.username, await global.configuration.getValue('fightmeTimeout'))
        global.db.engine.remove(`${self.collection}.fightme`, { _id: challenge._id.toString() })
        return
      }

      debug('user vs user')
      global.client.timeout(config.settings.broadcaster_username, winner ? sender.username : username, await global.configuration.getValue('fightmeTimeout'))
      global.commons.sendMessage(global.translate('gambling.fightme.winner')
        .replace(/\$winner/g, winner ? username : sender.username), sender)
      global.db.engine.remove(`${self.collection}.fightme`, { _id: challenge._id.toString() })
    } else {
      // check if under gambling cooldown
      const cooldown = await global.configuration.getValue('fightmeCooldown')
      const isMod = await global.commons.isMod(sender)
      if (new Date().getTime() - (await self.fightmeCooldown) < cooldown * 1000 &&
        !(await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(sender)))) {
        global.commons.sendMessage(global.translate('gambling.fightme.cooldown')
          .replace(/\$cooldown/g, Math.round(((cooldown * 1000) - (new Date().getTime() - (await self.fightmeCooldown))) / 1000 / 60))
          .replace(/\$minutesName/g, global.parser.getLocalizedName(Math.round(((cooldown * 1000) - (new Date().getTime() - (await self.fightmeCooldown))) / 1000 / 60), 'core.minutes')), sender)
        return
      }

      // save new timestamp if not bypassed
      if (!(await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(sender)))) self.fightmeCooldown = new Date().getTime()

      const isAlreadyChallenged = !_.isEmpty(await global.db.engine.findOne(`${self.collection}.fightme`, { key: '_users', user: sender.username, challenging: username }))
      if (!isAlreadyChallenged) await global.db.engine.insert(`${self.collection}.fightme`, { key: '_users', user: sender.username, challenging: username })
      global.commons.sendMessage(global.commons.prepare('gambling.fightme.challenge', { username: username }), sender)
    }
  }

  async gamble (self, sender, text) {
    let points, message

    sender['message-type'] = 'chat' // force responses to chat
    try {
      let parsed = text.trim().match(/^([\d]+|all)$/)
      if (_.isNil(parsed)) throw Error(ERROR_NOT_ENOUGH_OPTIONS)

      const user = await global.users.get(sender.username)
      points = parsed[1] === 'all' && !_.isNil(user.points) ? user.points : parsed[1]

      if (parseInt(points, 10) === 0) throw Error(ERROR_ZERO_BET)
      if (_.isNil(user.points) || user.points < points) throw Error(ERROR_NOT_ENOUGH_POINTS)

      await global.db.engine.incrementOne('users', { username: sender.username }, { points: parseInt(points, 10) * -1 })
      if (_.random(0, 100, false) <= await global.configuration.getValue('gamblingChanceToWin')) {
        let updatedUser = await global.db.engine.incrementOne('users', { username: sender.username }, { points: parseInt(points, 10) * 2 })
        message = global.commons.prepare('gambling.gamble.win', {
          pointsName: await global.systems.points.getPointsName(updatedUser.points),
          points: updatedUser.points
        })
        debug(message); global.commons.sendMessage(message, sender)
      } else {
        message = global.commons.prepare('gambling.gamble.lose', {
          pointsName: await global.systems.points.getPointsName(user.points),
          points: parseInt(user.points, 10) - parseInt(points, 10)
        })
        debug(message); global.commons.sendMessage(message, sender)
      }
    } catch (e) {
      switch (e.message) {
        case ERROR_ZERO_BET:
          message = global.commons.prepare('gambling.gamble.zeroBet', {
            pointsName: await global.systems.points.getPointsName(0)
          })
          debug(message); global.commons.sendMessage(message, sender)
          break
        case ERROR_NOT_ENOUGH_OPTIONS:
          global.commons.sendMessage(global.translate('gambling.gamble.notEnoughOptions'), sender)
          break
        case ERROR_NOT_ENOUGH_POINTS:
          message = global.commons.prepare('gambling.gamble.notEnoughPoints', {
            pointsName: await global.systems.points.getPointsName(points),
            points: points
          })
          debug(message); global.commons.sendMessage(message, sender)
          break
        default:
          global.log.error(e.stack)
          global.commons.sendMessage(global.translate('core.error'), sender)
      }
    }
  }
}

module.exports = new Gambling()
