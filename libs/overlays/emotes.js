'use strict'

// 3rdparty libraries
const _ = require('lodash')
const emoticons = require('twitch-emoticons')

// bot libraries
const constants = require('../constants')

function Emotes () {
  this.simpleEmotes = {
    ':)': 'https://static-cdn.jtvnw.net/emoticons/v1/1/',
    ':(': 'https://static-cdn.jtvnw.net/emoticons/v1/2/',
    ':o': 'https://static-cdn.jtvnw.net/emoticons/v1/8/',
    ':z': 'https://static-cdn.jtvnw.net/emoticons/v1/5/',
    'B)': 'https://static-cdn.jtvnw.net/emoticons/v1/7/',
    ':\\': 'https://static-cdn.jtvnw.net/emoticons/v1/10/',
    ';)': 'https://static-cdn.jtvnw.net/emoticons/v1/11/',
    ';p': 'https://static-cdn.jtvnw.net/emoticons/v1/13/',
    ':p': 'https://static-cdn.jtvnw.net/emoticons/v1/12/',
    'R)': 'https://static-cdn.jtvnw.net/emoticons/v1/14/',
    'o_O': 'https://static-cdn.jtvnw.net/emoticons/v1/6/',
    ':D': 'https://static-cdn.jtvnw.net/emoticons/v1/3/',
    '>(': 'https://static-cdn.jtvnw.net/emoticons/v1/4/',
    '<3': 'https://static-cdn.jtvnw.net/emoticons/v1/9/'
  }

  emoticons.loadBTTVChannel(global.configuration.get().twitch.channel)

  global.parser.registerParser(this, 'emotes', this.containsEmotes, constants.VIEWERS)

  global.configuration.register('OEmotesSize', 'overlay.emotes.settings.OEmotesSize', 'number', 0)
  global.configuration.register('OEmotesMax', 'overlay.emotes.settings.OEmotesMax', 'number', 5)
  global.configuration.register('OEmotesAnimation', 'overlay.emotes.settings.OEmotesAnimation', 'string', 'fadeup')
  global.configuration.register('OEmotesAnimationTime', 'overlay.emotes.settings.OEmotesAnimationTime', 'number', 4000)

  global.panel.addMenu({category: 'settings', name: 'overlays', id: 'overlays'})
  global.panel.socketListening(this, 'emote.testExplosion', this._testExplosion)
  global.panel.socketListening(this, 'emote.test', this._test)
}

Emotes.prototype._testExplosion = async function (self, socket) {
  self.explode(self, socket, ['Kappa', 'GivePLZ', 'PogChamp'])
}

Emotes.prototype._test = async function (self, socket) {
  let OEmotesSize = global.configuration.getValue('OEmotesSize')
  socket.emit('emote', 'https://static-cdn.jtvnw.net/emoticons/v1/9/' + (OEmotesSize + 1) + '.0')
}

Emotes.prototype.explode = async function (self, socket, data) {
  const emotes = await self.parseEmotes(self, data)
  socket.emit('emote.explode', emotes)
}

Emotes.prototype.containsEmotes = async function (self, id, sender, text) {
  global.updateQueue(id, true)

  let OEmotesMax = global.configuration.getValue('OEmotesMax')
  let OEmotesSize = global.configuration.getValue('OEmotesSize')

  _.each(sender.emotes, function (v, emote) {
    let limit = 0
    _.each(v, function () {
      if (limit === OEmotesMax) return false
      global.panel.io.emit('emote', 'https://static-cdn.jtvnw.net/emoticons/v1/' + emote + '/' + (OEmotesSize + 1) + '.0')
      limit++
    })
  })

  // parse BTTV emoticons
  for (let emote of emoticons.cache().bttvEmotes.keys()) {
    for (let i in _.range((text.match(new RegExp(emote, 'g')) || []).length)) {
      if (i === OEmotesMax) break
      let parsed = await emoticons.emote(emote)
      global.panel.io.emit('emote', parsed.toLink(OEmotesSize))
    }
  }
}

Emotes.prototype.parseEmotes = async function (self, emotes) {
  let OEmotesSize = global.configuration.getValue('OEmotesSize')
  let emotesArray = []

  for (var i = 0; i < emotes.length; i++) {
    if (_.includes(Object.keys(self.simpleEmotes), emotes[i])) {
      emotesArray.push(self.simpleEmotes[emotes[i]] + (OEmotesSize + 1) + '.0')
    } else {
      try {
        let parsed = await emoticons.emote(emotes[i])
        emotesArray.push(parsed.toLink(OEmotesSize))
      } catch (e) {
        continue
      }
    }
  }
  return emotesArray
}

module.exports = new Emotes()
