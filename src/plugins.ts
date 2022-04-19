import { adminEndpoint } from './helpers/socket';

import Core from '~/_interface';
import { onStartup } from '~/decorators/on';

const twitchChatMessage = {
  sender: {
    username: 'String',
    userId:   'String',
  },
  message: 'String',
};
const twitchCommand = {
  sender: {
    username: 'String',
    userId:   'String',
  },
  message: 'String',
};

class Plugins extends Core {
  listeners = {
    twitchChatMessage,
    twitchCommand,
  } as const;

  @onStartup()
  onStartup() {
    this.addMenu({
      category: 'registry', name: 'plugins', id: 'registry/plugins', this: null,
    });
  }

  public sockets() {
    adminEndpoint('/core/plugins', 'listeners', async (cb) => {
      cb(this.listeners);
    });
  }
}

export default new Plugins();
