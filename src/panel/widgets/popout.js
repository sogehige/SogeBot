/* globals  commons _ translations configuration socket page */
import Vue from 'vue';
import Popout from './popout.vue';
import { getSocket } from 'src/panel/helpers/socket';

function initPopout () {
  const isTranslationsLoaded = typeof translations === 'undefined' || _.size(translations) === 0
  const isConfigurationLoaded = typeof configuration === 'undefined' || _.size(configuration) === 0
  if (isTranslationsLoaded || isConfigurationLoaded) return setTimeout(() => initPopout(), 10)

  new Vue({ // eslint-disable-line no-new
    el: '#popout',
    data: {
      items: [],
      socket: getSocket('/')
    },
    render: function (createElement) {
      return createElement(Popout, { props: { commons, socket, page, configuration } })
    }
  })
}

initPopout()
