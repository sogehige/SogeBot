const _ = require('lodash')
const snekfetch = require('snekfetch')
const moment = require('moment')
const config = require('../config.json')
const debug = require('debug')('webhooks')

class Webhooks {
  constructor () {
    this.enabled = {
      follows: false,
      streams: false
    }

    this.subscribe('follows')
    this.subscribe('streams')
  }

  async subscribe (type) {
    if (_.isNil(global.channelId)) {
      setTimeout(() => this.subscribe(type), 1000)
      return
    }

    const leaseSeconds = 864000
    const mode = 'subscribe'
    const callback = `http://${config.panel.domain}/webhooks/hub`

    const request = [
      `https://api.twitch.tv/helix/webhooks/hub?`,
      `hub.mode=${mode}`,
      `hub.callback=${callback}/${type}`,
      `hub.lease_seconds=${leaseSeconds}`
    ]
    debug('Subscribe request: %s', request.join('$'))

    var res
    switch (type) {
      case 'follows':
        request.push(`hub.topic=https://api.twitch.tv/helix/users/follows?to_id=${global.channelId}`)
        res = await snekfetch.post(request.join('&')).set('Client-ID', config.settings.client_id)
        debug('Subscribe response: %o', res)
        if (res.status === 202 && res.statusText === 'Accepted') global.log.info('WEBHOOK: follows waiting for challenge')
        else global.log.error('WEBHOOK: follows NOT subscribed')
        break
      case 'streams':
        request.push(`hub.topic=https://api.twitch.tv/helix/streams?user_id=${global.channelId}`)
        res = await snekfetch.post(request.join('&')).set('Client-ID', config.settings.client_id)
        debug('Subscribe response: %o', res)
        if (res.status === 202 && res.statusText === 'Accepted') global.log.info('WEBHOOK: streams waiting for challenge')
        else global.log.error('WEBHOOK: streams NOT subscribed')
        break
      default:
        return // don't resubcribe if subscription is not correct
    }

    // resubscribe after while
    setTimeout(() => this.subscribe(type), leaseSeconds * 1000)
  }

  async event (aEvent, res) {
    debug('Event received: %j', aEvent)

    // somehow stream doesn't have a topic
    if (_.get(aEvent, 'topic', null) === `https://api.twitch.tv/helix/users/follows?to_id=${global.channelId}`) this.follower(aEvent) // follow
    else if (_.get(!_.isNil(aEvent.data[0]) ? aEvent.data[0] : {}, 'type', null) === 'live') this.stream(aEvent) // streams

    res.sendStatus(200)
  }

  async challenge (req, res) {
    // set webhooks enabled
    switch (req.query['hub.topic']) {
      case `https://api.twitch.tv/helix/users/follows?to_id=${global.channelId}`:
        global.log.info('WEBHOOK: follows subscribed')
        this.enabled.follows = true
        break
      case `https://api.twitch.tv/helix/streams?user_id=${global.channelId}`:
        global.log.info('WEBHOOK: streams subscribed')
        this.enabled.streams = true
        break
    }
    debug('Sending hub.challenge %s to topic %s', req.query['hub.challenge'], req.query['hub.topic'])
    res.send(req.query['hub.challenge'])
  }

  async follower (aEvent) {
    debug('Follow event received: %j', aEvent)
    const fid = aEvent.data.from_id
    // check if user exists in db
    let user = await global.db.engine.findOne('users', { id: fid })
    if (_.isEmpty(user)) {
      debug('user not in db')
      // user doesn't exist - get username from api GET https://api.twitch.tv/helix/users?id=<user ID>
      let userGetFromApi = await snekfetch.get(`https://api.twitch.tv/helix/users?id=${fid}`)
        .set('Client-ID', config.settings.client_id)
        .set('Authorization', 'OAuth ' + config.settings.bot_oauth.split(':')[1])
      debug('user API data" %o', userGetFromApi.body)
      global.events.fire('follow', { username: userGetFromApi.body.data[0].login }) // we can safely fire event as user doesn't exist in db
      await global.db.engine.insert('users', { id: fid, username: userGetFromApi.body.data[0].login, is: { follower: true }, time: { followCheck: new Date().getTime(), follow: moment().format('X') * 1000 } })
    } else {
      debug('user in db')
      debug('username: %s, is follower: %s, current time: %s, user time follow: %s', user.username, user.is.follower, moment().format('X') * 1000, user.time.follow)
      if (!user.is.follower && moment().format('X') * 1000 - user.time.follow > 60000 * 60) global.events.fire('follow', { username: user.username })

      if (user.is.follower) global.users.set(user.username, {id: fid, time: { followCheck: new Date().getTime() }})
      else global.users.set(user.username, { id: fid, is: { follower: true }, time: { followCheck: new Date().getTime(), follow: moment().format('X') * 1000 } })
    }
  }

  /*
    Example aEvent payload
    {
      "data":
        [{
          "id":"0123456789",
          "user_id":"5678",
          "game_id":"21779",
          "community_ids":[],
          "type":"live",
          "title":"Best Stream Ever",
          "viewer_count":417,
          "started_at":"2017-12-01T10:09:45Z",
          "language":"en",
          "thumbnail_url":"https://link/to/thumbnail.jpg"
        }]
    }
  */
  async stream (aEvent) {
    debug('Stream event received: %j', aEvent)
    // stream is online
    if (aEvent.data.length > 0) {
      let stream = aEvent.data[0]
      global.twitch.current.status = stream.title
      global.twitch.current.game = await global.twitch.getGameFromId(stream.game_id)

      if (!global.twitch.isOnline || global.twitch.streamType !== stream.type) {
        global.twitch.when({ online: stream.started_at })
        global.twitch.chatMessagesAtStart = global.parser.linesParsed
        global.twitch.current.viewers = 0
        global.twitch.current.bits = 0
        global.twitch.maxViewers = 0
        global.twitch.newChatters = 0
        global.twitch.chatMessagesAtStart = global.parser.linesParsed

        let cached = await global.twitch.cached()
        global.twitch.cached({ followers: cached.followers, subscribers: cached.subscribers }) // we dont want to have cached hosts on stream off

        global.events.fire('stream-started')
        global.events.fire('every-x-seconds', { reset: true })
      }

      global.twitch.curRetries = 0
      global.twitch.saveStreamData(stream)
      global.twitch.streamType = stream.type
      global.twitch.isOnline = true
    } else {
      // stream is offline - add curRetry + 1 and call getCurrentStreamData to do retries
      global.twitch.curRetries = global.twitch.curRetries + 1
      global.twitch.getCurrentStreamData()
    }
  }
}

module.exports = Webhooks
