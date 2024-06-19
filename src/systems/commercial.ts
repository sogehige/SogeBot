import * as _ from 'lodash-es';

import System from './_interface.js';
import {
  command, default_permission, helper,
} from '../decorators.js';

import { error, warning } from '~/helpers/log.js';
import defaultPermissions from '~/helpers/permissions/defaultPermissions.js';
import twitch from '~/services/twitch.js';
import { variables } from '~/watchers.js';

/*
 * !commercial                        - gets an info about alias usage
 * !commercial [duration] [?message]  - run commercial
 */

class Commercial extends System {
  @command('!commercial')
  @default_permission(defaultPermissions.CASTERS)
  @helper()
  async main (opts: CommandOptions) {
    const parsed = opts.parameters.match(/^([\d]+)? ?(.*)?$/);

    if (!parsed) {
      return [{ response: '$sender, something went wrong with !commercial', ...opts }];
    }

    const commercial = {
      duration: !_.isNil(parsed[1]) ? parseInt(parsed[1], 10) : null,
      message:  !_.isNil(parsed[2]) ? parsed[2] : null,
    };

    if (_.isNil(commercial.duration)) {
      return [{ response: `Usage: ${opts.command} [duration] [optional-message]`, ...opts }];
    }

    const broadcasterId = variables.get('services.twitch.broadcasterId') as string;
    const broadcasterCurrentScopes = variables.get('services.twitch.broadcasterCurrentScopes') as string[];
    // check if duration is correct (30, 60, 90, 120, 150, 180)
    if ([30, 60, 90, 120, 150, 180].includes(commercial.duration ?? 0)) {
      if (!broadcasterCurrentScopes.includes('channel:edit:commercial')) {
        warning('Missing Broadcaster oAuth scope channel:edit:commercial to start commercial');
        return;
      }

      try {
        await twitch.apiClient?.asIntent(['broadcaster'], ctx => ctx.channels.startChannelCommercial(broadcasterId, commercial.duration as 30 | 60 | 90 | 120 | 150 | 180));
        if (!_.isNil(commercial.message)) {
          return [{ response: commercial.message, ...opts }];
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          error(e.stack ?? e.message);
        }
      }
      return [];
    } else {
      return [{ response: '$sender, available commercial duration are: 30, 60, 90, 120, 150 and 180', ...opts }];
    }
  }
}

const commercial = new Commercial();
export default commercial;
