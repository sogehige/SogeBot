import { shuffle } from '@sogebot/ui-helpers/array';
import { DAY } from '@sogebot/ui-helpers/constants';
import { HelixClip } from '@twurple/api/lib';

import { getGameNameFromId } from './getGameNameFromId';

import { streamStatusChangeSince } from '~/helpers/api';
import { getFunctionName } from '~/helpers/getFunctionName';
import { debug, error, isDebugEnabled, warning } from '~/helpers/log';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';
import twitch from '~/services/twitch';
import { variables } from '~/watchers';

export async function getTopClips (opts: any): Promise<(Partial<HelixClip> & { mp4: string; game: string | null })[]> {
  if (isDebugEnabled('api.calls')) {
    debug('api.calls', new Error().stack);
  }
  const broadcasterId = variables.get('services.twitch.broadcasterId') as string;
  try {
    const period = {
      startDate: opts.period === 'stream'
        ? (new Date(streamStatusChangeSince.value)).toISOString()
        : new Date(Date.now() - opts.days * DAY).toISOString(),
      endDate: (new Date()).toISOString(),
    };

    const getClipsForBroadcaster = await twitch.apiClient?.asIntent(['bot'], ctx => ctx.clips.getClipsForBroadcasterPaginated(broadcasterId, { ...period }).getAll());

    // get mp4 from thumbnail
    const clips: (Partial<HelixClip> & { mp4: string; game: string | null })[] = [];
    for (const c of getClipsForBroadcaster ?? []) {
      clips.push({
        ...c,
        mp4:  c.thumbnailUrl.replace('-preview-480x272.jpg', '.mp4'),
        game: await getGameNameFromId(Number(c.gameId)),
      });
    }
    return shuffle(clips).slice(0, opts.first);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('ETIMEDOUT')) {
        warning(`${getFunctionName()} => Connection to Twitch timed out. Will retry request.`);
        await setImmediateAwait();
        return getTopClips(opts);
      } else {
        error(`${getFunctionName()} => ${e.stack ?? e.message}`);
      }
    }
  }
  return [];
}