import { debug } from 'console';

import { AppDataSource } from '~/database';

import { TwitchClips } from '../../../database/entity/twitch';
import { error, isDebugEnabled, warning } from '../../../helpers/log';
import client from '../api/client';
import { refresh } from '../token/refresh.js';

import { getFunctionName } from '~/helpers/getFunctionName';

export async function checkClips () {
  if (isDebugEnabled('api.calls')) {
    debug('api.calls', new Error().stack);
  }
  try {
    const clientBot = await client('bot');
    let notCheckedClips = (await AppDataSource.getRepository(TwitchClips).findBy({ isChecked: false }));

    // remove clips which failed
    for (const clip of notCheckedClips.filter((o) => new Date(o.shouldBeCheckedAt).getTime() < new Date().getTime())) {
      await AppDataSource.getRepository(TwitchClips).remove(clip);
    }
    notCheckedClips = notCheckedClips.filter((o) => new Date(o.shouldBeCheckedAt).getTime() >= new Date().getTime());
    if (notCheckedClips.length === 0) { // nothing to do
      return { state: true };
    }

    const getClipsByIds = await clientBot.clips.getClipsByIds(notCheckedClips.map((o) => o.clipId));
    for (const clip of getClipsByIds) {
      // clip found in twitch api
      await AppDataSource.getRepository(TwitchClips).update({ clipId: clip.id }, { isChecked: true });
    }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('ETIMEDOUT')) {
        warning(`${getFunctionName()} => Connection to Twitch timed out. Will retry request.`);
        return { state: false }; // ignore etimedout error
      }
      if (e.message.includes('Invalid OAuth token')) {
        warning(`${getFunctionName()} => Invalid OAuth token - attempting to refresh token`);
        await refresh('bot');
      } else {
        error(`${getFunctionName()} => ${e.stack ?? e.message}`);
      }
    }
  }
  return { state: true };
}