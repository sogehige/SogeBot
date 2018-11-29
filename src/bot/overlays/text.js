// @flow
'use strict'

const _ = require('lodash')
const Message = require('../message')

const Overlay = require('./_interface')

class Text extends Overlay {
  constructor () {
    // define special property name as readonly
    const ui = {
      links: {
        overlay: {
          type: 'link',
          href: '/overlays/text',
          class: 'btn btn-primary btn-block',
          rawText: '/overlays/text',
          target: '_blank'
        }
      }
    }

    super({ ui })
    this.addMenu({ category: 'registry', name: 'textoverlay', id: 'registry.textOverlay/list' })
  }

  sockets () {
    global.panel.io.of('/overlays/text').on('connection', (socket) => {
      const regexp = new RegExp('\\$_[a-zA-Z0-9_]+', 'g')
      socket.on('get', async (_id, callback) => {
        const item = await global.db.engine.findOne(this.collection.data, { _id })
        if (item.text) {
          let match = item.text.match(regexp)
          if (!_.isNil(match)) {
            for (let variable of item.text.match(regexp)) {
              let isVariable = await global.customvariables.isVariableSet(variable)
              let value = `<strong><i class="fas fa-dollar-sign">_${variable.replace('$_', '')}</i></strong>`
              if (isVariable) value = await global.customvariables.getValueOf(variable)
              item.text = item.text.replace(new RegExp(`\\${variable}`, 'g'), value)
            }
          }
          item.text = await new Message(item.text).parse()
        }
        callback({ html: item.text, css: item.css, js: item.js })
      })
    })
  }
}

module.exports = new Text()
