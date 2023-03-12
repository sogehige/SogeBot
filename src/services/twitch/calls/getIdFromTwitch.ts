import { debug, error, isDebugEnabled, warning } from '~/helpers/log';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';
import twitch from '~/services/twitch';

async function getIdFromTwitch (userName: string): Promise<string> {
  if (isDebugEnabled('api.calls')) {
    debug('api.calls', new Error().stack);
  }
  try {
    const getUserByName = await twitch.apiClient?.asIntent(['bot'], ctx => ctx.users.getUserByName(userName));
    if (getUserByName) {
      return getUserByName.id;
    } else {
      throw new Error(`User ${userName} not found on Twitch.`);
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message.includes('ETIMEDOUT')) {
        warning(`getIdFromTwitch => Connection to Twitch timed out. Will retry request.`);
        await setImmediateAwait();
        return getIdFromTwitch(userName);
      } else if(e.message.includes('not found on Twitch')) {
        warning(`${e.message}`);
      } else {
        error(`getIdFromTwitch => ${e.stack ?? e.message}`);
      }
    }
    throw(e);
  }
}

export { getIdFromTwitch };