'use strict'

// 3rdparty libraries
const _ = require('lodash')
const debug = require('debug')('game:fightme')

// bot libraries
const Game = require('./_interface')

/*
 * !fightme [user] - challenge [user] to fight
 */

class FightMe extends Game {
  constructor () {
    const collection = {
      settings: 'games.fightme.settings',
      users: 'games.fightme.users'
    }
    const settings = {
      cooldown: String(new Date()),
      commands: [
        '!fightme'
      ]
    }

    super({ collection, settings })

    global.configuration.register('fightmeTimeout', 'gambling.fightme.timeout', 'number', 10)
    global.configuration.register('fightmeCooldown', 'gambling.cooldown.fightme', 'number', 0)
  }

  async main (opts) {
    opts.sender['message-type'] = 'chat' // force responses to chat
    var username

    try {
      username = opts.parameters.trim().match(/^@?([\S]+)$/)[1].toLowerCase()
      opts.sender.username = opts.sender.username.toLowerCase()
    } catch (e) {
      global.commons.sendMessage(global.translate('gambling.fightme.notEnoughOptions'), opts.sender)
      return
    }

    if (opts.sender.username === username) {
      global.commons.sendMessage(global.translate('gambling.fightme.cannotFightWithYourself'), opts.sender)
      return
    }

    // check if you are challenged by user
    const challenge = await global.db.engine.findOne(this.collection.users, { key: '_users', user: username, challenging: opts.sender.username })
    const isChallenged = !_.isEmpty(challenge)
    if (isChallenged) {
      let winner = _.random(0, 1, false)
      let isMod = {
        user: await global.commons.isMod(username),
        sender: await global.commons.isMod(opts.sender)
      }

      // vs broadcaster
      if (global.commons.isBroadcaster(opts.sender) || global.commons.isBroadcaster(username)) {
        debug('vs broadcaster')
        global.commons.sendMessage(global.translate('gambling.fightme.broadcaster')
          .replace(/\$winner/g, global.commons.isBroadcaster(opts.sender) ? opts.sender.username : username), opts.sender)
        isMod = global.commons.isBroadcaster(opts.sender) ? isMod.user : isMod.opts.sender
        if (!isMod) global.commons.timeout(global.commons.isBroadcaster(opts.sender) ? username : opts.sender.username, null, await global.configuration.getValue('fightmeTimeout'))
        global.db.engine.remove(this.collection.users, { _id: challenge._id.toString() })
        return
      }

      // mod vs mod
      if (isMod.user && isMod.opts.sender) {
        debug('mod vs mod')
        global.commons.sendMessage(global.translate('gambling.fightme.bothModerators')
          .replace(/\$challenger/g, username), opts.sender)
        global.db.engine.remove(this.collection.users, { _id: challenge._id.toString() })
        return
      }

      // vs mod
      if (isMod.user || isMod.opts.sender) {
        debug('vs mod')
        global.commons.sendMessage(global.translate('gambling.fightme.oneModerator')
          .replace(/\$winner/g, isMod.opts.sender ? opts.sender.username : username), opts.sender)
        global.commons.timeout(isMod.opts.sender ? username : opts.sender.username, null, await global.configuration.getValue('fightmeTimeout'))
        global.db.engine.remove(this.collection.users, { _id: challenge._id.toString() })
        return
      }

      debug('user vs user')
      global.commons.timeout(winner ? opts.sender.username : username, null, await global.configuration.getValue('fightmeTimeout'))
      global.commons.sendMessage(global.translate('gambling.fightme.winner')
        .replace(/\$winner/g, winner ? username : opts.sender.username), opts.sender)
      global.db.engine.remove(this.collection.users, { _id: challenge._id.toString() })
    } else {
      // check if under gambling cooldown
      const cooldown = await global.configuration.getValue('fightmeCooldown')
      const isMod = await global.commons.isMod(opts.sender)
      if (new Date().getTime() - new Date(await this.settings.cooldown).getTime() < cooldown * 1000 &&
        !(await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(opts.sender)))) {
        global.commons.sendMessage(global.translate('gambling.fightme.cooldown')
          .replace(/\$cooldown/g, Math.round(((cooldown * 1000) - (new Date().getTime() - new Date(await this.settings.cooldown).getTime())) / 1000 / 60))
          .replace(/\$minutesName/g, global.commons.getLocalizedName(Math.round(((cooldown * 1000) - (new Date().getTime() - new Date(await this.settings.cooldown).getTime())) / 1000 / 60), 'core.minutes')), opts.sender)
        return
      }

      // save new timestamp if not bypassed
      if (!(await global.configuration.getValue('gamblingCooldownBypass') && (isMod || global.commons.isBroadcaster(opts.sender)))) this.settings.cooldown = new Date()

      const isAlreadyChallenged = !_.isEmpty(await global.db.engine.findOne(this.collection.users, { key: '_users', user: opts.sender.username, challenging: username }))
      if (!isAlreadyChallenged) await global.db.engine.insert(this.collection.users, { key: '_users', user: opts.sender.username, challenging: username })
      global.commons.sendMessage(await global.commons.prepare('gambling.fightme.challenge', { username: username }), opts.sender)
    }
  }
}

module.exports = new FightMe()
