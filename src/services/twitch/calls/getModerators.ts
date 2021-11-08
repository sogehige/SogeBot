import { getRepository, In, Not } from 'typeorm';

import client from '../api/client';

import { User } from '~/database/entity/user';
import { error, warning } from '~/helpers/log';
import { addUIError } from '~/helpers/panel/index';
import { setStatus } from '~/helpers/parser';
import * as changelog from '~/helpers/user/changelog.js';
import { variables } from '~/watchers';

export async function getModerators(opts: { isWarned: boolean }) {
  try {
    const channelId = variables.get('services.twitch.channelId') as string;
    const botId = variables.get('services.twitch.botId') as string;
    const broadcasterCurrentScopes = variables.get('services.twitch.broadcasterCurrentScopes') as string[];

    if (!broadcasterCurrentScopes.includes('moderation:read')) {
      if (!opts.isWarned) {
        opts.isWarned = true;
        warning('Missing Broadcaster oAuth scope moderation:read to read channel moderators.');
        addUIError({ name: 'OAUTH', message: 'Missing Broadcaster oAuth scope moderation:read to read channel moderators.' });
      }
      return { state: false, opts };
    }

    const clientBroadcaster = await client('broadcaster');
    const getModeratorsPaginated = await clientBroadcaster.moderation.getModeratorsPaginated(channelId).getAll();

    await changelog.flush();
    await getRepository(User).update({ userId: Not(In(getModeratorsPaginated.map(o => o.userId))) }, { isModerator: false });
    await getRepository(User).update({ userId: In(getModeratorsPaginated.map(o => o.userId)) }, { isModerator: true });

    setStatus('MOD', getModeratorsPaginated.map(o => o.userId).includes(botId));
  } catch (e) {
    if (e instanceof Error) {
      error(e.stack ?? e.message);
    }
  }
  return { state: true };
}