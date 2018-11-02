// @flow
'use strict'

const _ = require('lodash')

const Overlay = require('./_interface')

class Credits extends Overlay {
  constructor () {
    const settings = {
      credits: {
        speed: 'medium'
      },
      show: {
        followers: true,
        hosts: true,
        raids: true,
        subscribers: true,
        subgifts: true,
        subcommunitygifts: true,
        resubs: true,
        cheers: true,
        clips: true,
        tips: true
      },
      text: {
        lastMessage: 'Thanks for watching',
        lastSubMessage: '~ see you on the next stream ~',
        streamBy: 'Stream by',
        follow: 'Followed by',
        host: 'Hosted by',
        raid: 'Raided by',
        cheer: 'Cheered by',
        sub: 'Subscribed by',
        resub: 'Resubscribed by',
        subgift: 'Subgitfs by',
        subcommunitygift: 'Sub community gifts by',
        tips: 'Tips by'
      },
      clips: {
        period: 'custom',
        customPeriodInDays: 31,
        numOfClips: 3,
        shouldPlay: true,
        volume: 20
      }
    }

    const ui = {
      credits: {
        speed: {
          type: 'selector',
          values: ['very slow', 'slow', 'medium', 'fast', 'very fast'],
          title: 'filter.select'
        }
      },
      clips: {
        period: {
          type: 'selector',
          values: ['stream', 'custom'],
          title: 'filter.select'
        }
      },
      links: {
        overlay: {
          type: 'link',
          href: '/overlays/credits',
          class: 'btn btn-primary btn-block',
          rawText: '/overlays/credits (1920x1080)',
          target: '_blank'
        }
      }
    }
    super({ settings, ui })
  }

  sockets () {
    global.panel.io.of('/overlays/credits').on('connection', (socket) => {
      socket.on('load', async (cb) => {
        const when = await global.cache.when()

        if (typeof when.online === 'undefined' || when.online === null) when.online = _.now() - 5000000000 // 5000000

        let timestamp = new Date(when.online).getTime()
        let events = await global.db.engine.find('widgetsEventList')

        // change tips if neccessary for aggregated events (need same currency)
        events = events.filter((o) => o.timestamp >= timestamp)
        for (let event of events) {
          if (!_.isNil(event.amount) && !_.isNil(event.currency)) {
            event.amount = await global.configuration.getValue('creditsAggregate')
              ? global.currency.exchange(event.amount, event.currency, await global.configuration.getValue('currency'))
              : event.amount
            event.currency = global.currency.symbol(await global.configuration.getValue('creditsAggregate') ? await global.configuration.getValue('currency') : event.currency)
          }
        }

        cb(null, {
          settings: {
            clips: {
              shouldPlay: this.settings.clips.shouldPlay,
              volume: this.settings.clips.volume
            },
            speed: this.settings.credits.speed,
            text: {
              lastMessage: this.settings.text.lastMessage,
              lastSubMessage: this.settings.text.lastSubMessage,
              streamBy: this.settings.text.streamBy,
              follow: this.settings.text.follow,
              host: this.settings.text.host,
              raid: this.settings.text.raid,
              cheer: this.settings.text.cheer,
              sub: this.settings.text.sub,
              resub: this.settings.text.resub,
              subgift: this.settings.text.subgift,
              subcommunitygift: this.settings.text.subcommunitygift,
              tips: this.settings.text.tips
            },
            show: {
              follow: this.settings.show.followers,
              host: this.settings.show.hosts,
              raid: this.settings.show.raids,
              sub: this.settings.show.subscribers,
              subgift: this.settings.show.subgifts,
              subcommunitygift: this.settings.show.subcommunitygifts,
              resub: this.settings.show.resubs,
              cheer: this.settings.show.cheers,
              clips: this.settings.show.clips,
              tip: this.settings.show.tips
            }
          },
          streamer: global.oauth.settings.broadcaster.username,
          game: await global.db.engine.findOne('api.current', { key: 'game' }),
          title: await global.db.engine.findOne('api.current', { key: 'title' }),
          clips: this.settings.show.clips ? await global.api.getTopClips({ period: this.settings.clips.period, days: this.settings.clips.customPeriodInDays, first: this.settings.clips.numOfClips }) : [],
          events: events.filter((o) => o.timestamp >= timestamp)
        })
      })
    })
  }
  /*
    if (require('cluster').isMaster) this.sockets()

    global.configuration.register('creditsAggregate', 'core.no-response-bool', 'bool', false)

    global.configuration.register('creditsFollowers', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsHosts', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsRaids', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsSubscribers', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsSubgifts', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsSubcommunitygifts', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsResubs', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsCheers', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsClips', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsTips', 'core.no-response-bool', 'bool', true)

    global.configuration.register('creditsSpeed', 'core.no-response', 'number', 35)
    global.configuration.register('creditsMaxFontSize', 'core.no-response', 'number', 200)

    global.configuration.register('creditsLastMessage', 'core.no-response', 'string', 'Thanks for watching!')
    global.configuration.register('creditsLastSubMessage', 'core.no-response', 'string', '~ see you on the next stream ~')

    global.configuration.register('creditsStreamBy', 'core.no-response', 'string', 'Stream by')
    global.configuration.register('creditsFollowedBy', 'core.no-response', 'string', 'Followed by')
    global.configuration.register('creditsHostedBy', 'core.no-response', 'string', 'Hosted by')
    global.configuration.register('creditsRaidedBy', 'core.no-response', 'string', 'Raided by')
    global.configuration.register('creditsCheerBy', 'core.no-response', 'string', 'Cheer <strong>$bits bits</strong> by')
    global.configuration.register('creditsSubscribedBy', 'core.no-response', 'string', 'Subscribed by')
    global.configuration.register('creditsResubscribedBy', 'core.no-response', 'string', 'Resubscribed <strong>$months months</strong> by')
    global.configuration.register('creditsSubgiftBy', 'core.no-response', 'string', '<strong>$from</strong> gifted subscribe to')
    global.configuration.register('creditsSubcommunitygiftBy', 'core.no-response', 'string', '<strong>$from</strong> gifted subscribe to')
    global.configuration.register('creditsClippedBy', 'core.no-response', 'string', 'Clipped by')
    global.configuration.register('creditsTipsBy', 'core.no-response', 'string', 'tip <strong>$currency$amount</strong>')
    global.configuration.register('creditsTopClips', 'core.no-response', 'string', 'Top clips')

    global.configuration.register('creditsTopClipsPeriod', 'core.no-response', 'string', 'week') // possibilities day, week, month, all
    global.configuration.register('creditsTopClipsPlay', 'core.no-response-bool', 'bool', true)
    global.configuration.register('creditsTopClipsCount', 'core.no-response', 'number', 3)
  }

  sockets () {
    global.panel.io.of('/overlays/credits').on('connection', (socket) => {
      socket.on('load', async (callback) => {
        let [events, when, hosts, raids, socials] = await Promise.all([
          global.db.engine.find('widgetsEventList'),
          global.cache.when(),
          global.db.engine.find('cache.hosts'),
          global.db.engine.find('cache.raids'),
          global.db.engine.find('overlay.credits.socials')
        ])

        if (_.isNil(when.online)) when.online = _.now() - 5000000
        let timestamp = new Date(when.online).getTime() // 2018-02-16T18:02:50Z
        let messages = {
          lastMessage: await global.configuration.getValue('creditsLastMessage'),
          lastSubMessge: await global.configuration.getValue('creditsLastSubMessage')
        }
        let speed = await global.configuration.getValue('creditsSpeed')
        let custom = {
          'stream-by': await global.configuration.getValue('creditsStreamBy'),
          'followed-by': await global.configuration.getValue('creditsFollowedBy'),
          'hosted-by': await global.configuration.getValue('creditsHostedBy'),
          'raided-by': await global.configuration.getValue('creditsRaidedBy'),
          'cheer-by': await global.configuration.getValue('creditsCheerBy'),
          'subscribed-by': await global.configuration.getValue('creditsSubscribedBy'),
          'resubscribed by': await global.configuration.getValue('creditsResubscribedBy'),
          'subgift-by': await global.configuration.getValue('creditsSubgiftBy'),
          'subcommunitygift-by': await global.configuration.getValue('creditsSubcommunitygiftBy'),
          'clipped-by': await global.configuration.getValue('creditsClippedBy'),
          'top-clips': await global.configuration.getValue('creditsTopClips'),
          'tip-by': await global.configuration.getValue('creditsTipsBy')
        }
        let show = {
          followers: await global.configuration.getValue('creditsFollowers'),
          hosts: await global.configuration.getValue('creditsHosts'),
          raids: await global.configuration.getValue('creditsRaids'),
          subscribers: await global.configuration.getValue('creditsSubscribers'),
          subgifts: await global.configuration.getValue('creditsSubgifts'),
          subcommunitygifts: await global.configuration.getValue('creditsSubcommunitygifts'),
          resubs: await global.configuration.getValue('creditsResubs'),
          cheers: await global.configuration.getValue('creditsCheers'),
          tips: await global.configuration.getValue('creditsTips')
        }

        let clips = { play: await global.configuration.getValue('creditsTopClipsPlay'), list: [] }
        if (await global.configuration.getValue('creditsClips')) {
          clips.list = await this.getTopClips()
        }

        // change tips if neccessary for aggregated events (need same currency)
        events = events.filter((o) => o.timestamp >= timestamp)
        for (let event of events) {
          if (!_.isNil(event.amount) && !_.isNil(event.currency)) {
            event.amount = await global.configuration.getValue('creditsAggregate')
              ? global.currency.exchange(event.amount, event.currency, await global.configuration.getValue('currency'))
              : event.amount
            event.currency = global.currency.symbol(await global.configuration.getValue('creditsAggregate') ? await global.configuration.getValue('currency') : event.currency)
          }
        }

        callback(null,
          events.filter((o) => o.timestamp >= timestamp),
          await global.oauth.settings.broadcaster.username,
          _.get(await global.db.engine.findOne('api.current', { key: 'game' }), 'value', 'n/a'),
          _.get(await global.db.engine.findOne('api.current', { key: 'title' }), 'value', 'n/a'),
          hosts.map((o) => o.username),
          raids.map((o) => o.username),
          socials,
          messages,
          custom,
          speed,
          show,
          clips,
          await global.configuration.getValue('creditsMaxFontSize'),
          await global.configuration.getValue('creditsAggregate')
        )
      })
      socket.on('socials.save', async (data, cb) => {
        // remove all data
        await global.db.engine.remove('overlay.credits.socials', {})

        let toAwait = []
        for (let [i, v] of Object.entries(data)) {
          toAwait.push(global.db.engine.update('overlay.credits.socials', { order: i }, { order: i, type: v.type, text: v.text }))
        }
        await Promise.all(toAwait)
        cb(null, true)
      })
      socket.on('socials.load', async (cb) => {
        cb(null, await global.db.engine.find('overlay.credits.socials'))
      })
      socket.on('custom.text.save', async (data, cb) => {
        // remove all data
        await global.db.engine.remove('overlay.credits.customTexts', {})

        let toAwait = []
        for (let [i, v] of Object.entries(data)) {
          toAwait.push(global.db.engine.update('overlay.credits.customTexts', { order: i }, { order: i, type: v.type, text: v.text }))
        }
        await Promise.all(toAwait)
        cb(null, true)
      })
      socket.on('custom.text.load', async (cb) => {
        cb(null, await global.db.engine.find('overlay.credits.customTexts'))
      })
    })
  }
  */
}

module.exports = new Credits()
