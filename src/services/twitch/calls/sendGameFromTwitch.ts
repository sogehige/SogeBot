import client from '../api/client';
import { refresh } from '../token/refresh';

import { getFunctionName } from '~/helpers/getFunctionName';
import { error, warning } from '~/helpers/log';

async function sendGameFromTwitch (game: string) {
  try {
    const clientBot = await client('bot');
    const searchCategories = await clientBot.search.searchCategoriesPaginated(game).getAll();
    return searchCategories.map(o => o.name);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Invalid OAuth token')) {
        warning(`${getFunctionName()} => Invalid OAuth token - attempting to refresh token`);
        await refresh('bot');
      } else {
        error(`${getFunctionName()} => ${e.stack ?? e.message}`);
      }
    }
    return;
  }
}

export { sendGameFromTwitch };