var winston = require('winston')
var fs = require('fs')
var _ = require('lodash')
var logDir = './logs'

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir)

global.log = new (winston.Logger)({
  levels: {
    error: 0,
    chatIn: 1,
    chatOut: 2,
    whisperIn: 3,
    whisperOut: 4,
    follow: 6,
    unfollow: 7,
    timeout: 8,
    ban: 9,
    warning: 10,
    info: 11

  },
  transports: [
    new (winston.transports.Console)({
      handleExceptions: true,
      timestamp: function () {
        return new Date().toISOString()
      },
      formatter: function (options) {
        // Return string will be passed to logger.
        let level = options.level
        if (level === 'error') level = '!!! ERROR !!!'
        if (level === 'chatIn') level = '<<<'
        if (level === 'chatOut') level = '>>>'
        if (level === 'whisperIn') level = '<w<'
        if (level === 'whisperOut') level = '>w>'
        if (level === 'info') level = '|'
        if (level === 'warning') level = '|!'
        if (level === 'timeout') level = '+timeout'
        if (level === 'ban') level = '+ban'
        if (level === 'follow') level = '+follow'
        if (level === 'unfollow') level = '-follow'
        let username = !_.isUndefined(options.meta.username) ? options.meta.username : ''
        let fnc = !_.isUndefined(options.meta.fnc) ? options.meta.fnc : ''
        return options.timestamp() + (level ? ' ' + level + ' ' : ' ') + (options.message ? options.message : '') + (username ? ' [' + username + ']' : '') + (fnc ? ' [function: ' + fnc + ']' : '')
      }
    }),
    new winston.transports.File({
      level: 'info',
      timestamp: function () {
        return new Date().toISOString()
      },
      formatter: function (options) {
        // Return string will be passed to logger.
        let level = options.level
        if (level === 'error') level = '!!! ERROR !!!'
        if (level === 'chatIn') level = '<<<'
        if (level === 'chatOut') level = '>>>'
        if (level === 'whisperIn') level = '<w<'
        if (level === 'whisperOut') level = '>w>'
        if (level === 'info') level = '|'
        if (level === 'warning') level = '|!'
        if (level === 'join') level = 'JOIN:'
        if (level === 'part') level = 'PART:'
        let username = !_.isUndefined(options.meta.username) ? options.meta.username : ''
        if (level === '!!! ERROR !!!') console.error(options.timestamp() + ' !!! ' + JSON.stringify(options.meta))
        return options.timestamp() +
          (level ? ' ' + level + ' ' : ' ') +
          (options.message ? options.message : '') +
          (username ? ' [' + username + ']' : '')
      },
      filename: logDir + '/sogebot.log',
      handleExceptions: false,
      json: false,
      maxsize: 5242880,
      maxFiles: 5,
      colorize: false })
  ],
  exceptionHandlers: [
    new winston.transports.File({
      exitOnError: true,
      filename: logDir + '/exceptions.log',
      json: false,
      formatter: function (options) {
        global.log.error('+------------------------------------------------------------------------------+')
        global.log.error('| BOT HAS UNEXPECTEDLY CRASHED                                                 |')
        global.log.error('| PLEASE CHECK https://github.com/sogehige/SogeBot/wiki/How-to-report-an-issue |')
        global.log.error('| AND ADD logs/exceptions.log file to your report                              |')
        global.log.error('+------------------------------------------------------------------------------+')
        return JSON.stringify(options.meta)
      }
    })
  ]
})
