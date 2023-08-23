import cronparser from 'cron-parser';
import { escapeRegExp } from 'lodash';

import { debug } from '~/helpers/log';

export const ListenToGenerator = (pluginId: string, type: string, message: string, userstate: { userName: string, userId: string } | null) => ({
  Cron(cron: string, callback: () => void) {
    if (type === 'cron') {
      const cronParsed = cronparser.parseExpression(cron);
      const cronDate = cronParsed.prev();
      const timestamp = Math.floor(cronDate.getTime() / 1000);
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (timestamp === currentTimestamp) {
        callback();
      }
    }
  },
  Twitch: {
    command: (opts: { command: string }, callback: any) => {
      if (type === 'Twitch.command') {
        if (message.toLowerCase().startsWith(opts.command.toLowerCase())) {
          debug('plugins', `PLUGINS#${pluginId}: Twitch command executed`);
          const regexp = new RegExp(escapeRegExp(opts.command), 'i');
          callback(userstate, ...message.replace(regexp, '').trim().split(' ').filter(Boolean));
        }
      }
    },
    message: (callback: any) => {
      if (type === 'Twitch.message') {
        debug('plugins', `PLUGINS#${pluginId}: Twitch message executed`);
        callback(userstate, message);
      }
    },
  },
});