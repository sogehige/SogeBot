'use strict'

// 3rdparty libraries
const Client = require('twitter')

const config = require('../../config.json')

function Twitter () {
  if (global.commons.isIntegrationEnabled(this)) {
    this.client = new Client({
      consumer_key: config.integrations.twitter.consumerKey,
      consumer_secret: config.integrations.twitter.consumerSecret,
      access_token_key: config.integrations.twitter.accessToken,
      access_token_secret: config.integrations.twitter.secretToken
    })

    this.addEvent(this)
    global.panel.addWidget('twitter', 'widget-title-twitter', 'pencil')
    global.panel.socketListening(this, 'twitter.send', this.send)
  }
}

Twitter.prototype.addEvent = function (self) {
  global.events.operations['send-twitter-message'] = async function (attr) {
    self.send(self, null, attr.send)
  }
}

Twitter.prototype.send = function (self, socket, text) {
  self.client.post('statuses/update', {status: text}, function (error, tweet, response) {
    if (error) global.log.error(error, 'Twitch#send')
  })
}

module.exports = new Twitter()
