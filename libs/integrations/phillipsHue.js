'use strict'

// 3rdparty libraries
const _ = require('lodash')
const HueApi = require('node-hue-api').HueApi
const lightState = require('node-hue-api').lightState

// bot libraries
const config = require('../../config.json')
const constants = require('../constants')

/*
 * NOTE: For this integration to be working, you need bot running on same network, as your lights
 *
 * !hue rgb=<0-255>,<0-255>,<0-255> light=<0-x;default:1> loop=<0-x;default:3> time=<100-x;default:500> - start hue alert
 * !hue list                                                                                            - get lights list
 */

function PhillipsHue () {
  if (global.commons.isIntegrationEnabled(this)) {
    global.parser.register(this, '!hue list', this.getLights, constants.OWNER_ONLY)
    global.parser.register(this, '!hue', this.hue, constants.OWNER_ONLY)

    var host = config.integrations.phillipshue.host
    var user = config.integrations.phillipshue.user
    var timeout = config.integrations.phillipshue.timeout
    var port = config.integrations.phillipshue.port

    this.api = new HueApi(host, user, timeout, port)

    this.states = []

    var self = this
    setInterval(function () {
      _.each(self.states, function (state, index) {
        if (_.isNil(state) || state.status.blocked) return true

        if (new Date().getTime() - state.status.time >= state.time) {
          state.status.time = new Date().getTime()

          if (state.status.state === 0) {
            state.status.blocked = true
            state.status.state = 1
            self.api.setLightState(state.light, {'on': true}).done(function () {
              self.api.setLightState(state.light, lightState.create().rgb(state.rgb)).done(function () {
                state.status.blocked = false
                state.status.loop++
              })
            })
          } else {
            state.status.blocked = true
            state.status.state = 0
            self.api.setLightState(state.light, {'on': false}).fail(function () { return true }).done(function () {
              state.status.blocked = false
              state.status.loop++
            })
          }
        }

        if (state.status.loop === state.loop * 2) {
          setTimeout(function () {
            self.api.setLightState(state.light, {'on': false}).fail(function () { return true })
          }, state.time + 100)

          self.states.splice(index, 1) // remove from list
        }
      })
    }, 20)
  }
}

PhillipsHue.prototype.getLights = function (self, sender, text) {
  self.api.lights()
    .then(function (lights) {
      var output = []
      _.each(lights.lights, function (light) {
        output.push('id: ' + light.id + ', name: \'' + light.name + '\'')
      })
      global.commons.sendMessage(global.translate('phillipsHue.list') + output.join(' | '), sender)
    })
    .fail(function (err) { global.log.error(err, 'PhillipsHue.prototype.getLights#1') })
}

PhillipsHue.prototype.hue = function (self, sender, text) {
  var rgb = self.parseText(text, 'rgb', '255,255,255').split(',')
  if (rgb.length < 3) rgb = [255, 255, 255]

  self.states.push({
    'rgb': rgb,
    'light': self.parseText(text, 'light', 1),
    'time': self.parseText(text, 'time', 100),
    'loop': self.parseText(text, 'loop', 3),
    'status': {
      'loop': 0,
      'state': 0,
      'time': new Date().getTime(),
      'blocked': false
    }
  })
}

PhillipsHue.prototype.parseText = function (text, value, ifNull) {
  ifNull = ifNull || 0
  for (let part of text.trim().split(' ')) {
    if (part.startsWith(value + '=')) {
      ifNull = part.replace(value + '=', '')
      break
    }
  }
  return ifNull
}

module.exports = new PhillipsHue()
