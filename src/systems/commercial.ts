'use strict';

import * as _ from 'lodash';

import {
  command, default_permission, helper,
} from '../decorators';
import client from '../services/twitch/api/client';
import System from './_interface';

import { getOwnerAsSender } from '~/helpers/commons';
import { eventEmitter } from '~/helpers/events';
import { error, warning } from '~/helpers/log';
import { addUIError } from '~/helpers/panel/alerts';
import { defaultPermissions } from '~/helpers/permissions/index';
import { adminEndpoint } from '~/helpers/socket';
import { variables } from '~/watchers';

/*
 * !commercial                        - gets an info about alias usage
 * !commercial [duration] [?message]  - run commercial
 */

class Commercial extends System {
  sockets() {
    adminEndpoint(this.nsp, 'commercial.run', (data) => {
      commercial.main({
        parameters:    data.seconds,
        command:       '!commercial',
        sender:        getOwnerAsSender(),
        attr:          {},
        createdAt:     Date.now(),
        emotesOffsets: new Map(),
        isAction:      false,
        discord:       undefined,
      });
    });
  }

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

    const channelId = variables.get('services.twitch.channelId') as string;
    const broadcasterCurrentScopes = variables.get('services.twitch.broadcasterCurrentScopes') as string[];
    // check if duration is correct (30, 60, 90, 120, 150, 180)
    if ([30, 60, 90, 120, 150, 180].includes(commercial.duration ?? 0)) {
      if (!broadcasterCurrentScopes.includes('channel:edit:commercial')) {
        warning('Missing Broadcaster oAuth scope channel:edit:commercial to start commercial');
        addUIError({ name: 'OAUTH', message: 'Missing Broadcaster oAuth scope channel:edit:commercial to start commercial' });
        return;
      }

      try {
        const clientBroadcaster = await client('broadcaster');
        await clientBroadcaster.channels.startChannelCommercial(channelId, commercial.duration as 30 | 60 | 90 | 120 | 150 | 180);
        eventEmitter.emit('commercial', { duration: commercial.duration ?? 30 });
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
