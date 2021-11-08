import * as constants from '@sogebot/ui-helpers/constants';
import axios from 'axios';

import { setStatus } from '../../../helpers/parser';
import { tmiEmitter } from '../../../helpers/tmi';
import client from '../api/client';
import { refresh } from './refresh';

import emitter from '~/helpers/interfaceEmitter';
import {
  debug,
  error,
  warning,
} from '~/helpers/log';
import { variables } from '~/watchers';

let botTokenErrorSent = false;
let broadcasterTokenErrorSent = false;

const expirationDate = {
  bot:         -1,
  broadcaster: -1,
};
const isValidating = {
  bot:         false,
  broadcaster: false,
};

export const cache: { bot: string; broadcaster: string } = { bot: '', broadcaster: '' };
/*
   * Validates OAuth access tokens
   * and sets this[type + 'Username']
   * and sets this[type + 'CurrentScopes']
   * if invalid refresh()
   * @param {string} type - bot or broadcaster
   *
   * Example output:
      {
        "client_id": "<your client ID>",
        "login": "<authorized user login>",
        "scopes": [
          "<requested scopes>"
        ],
        "user_id": "<authorized user ID>"
      }
    */
export const validate = async (type: 'bot' | 'broadcaster', retry = 0, clear = false): Promise < boolean > => {
  try {
    debug('oauth.validate', `Validation: ${type} - ${retry} retries`);
    if (isValidating[type]) {
      debug('oauth.validate', `Validation in progress.`);
      return false;
    } else {
      isValidating[type] = true;
    }

    const refreshToken = variables.get('services.twitch.' + type + 'refreshToken') as string;

    if (refreshToken === '') {
      throw new Error('no refresh token for ' + type);
    } else if (!['bot', 'broadcaster'].includes(type)) {
      throw new Error(`Type ${type} is not supported`);
    }

    let token: string;
    if (expirationDate[type] - Date.now() > 5 * constants.MINUTE && expirationDate[type] !== -1) {
      debug('oauth.validate', `Skipping refresh token for ${type}, expiration time: ${new Date(expirationDate[type]).toISOString()}`);
      return true;
    } else {
      debug('oauth.validate', `Refreshing token for ${type}`);
      token = await refresh(type, true);
    }

    if ((global as any).mocha) {
      return true;
    }

    const url = 'https://id.twitch.tv/oauth2/validate';

    debug('oauth.validate', `Checking ${type} - retry no. ${retry}`);
    const request = await axios.get < any > (url, {
      headers: {
        Authorization: 'OAuth ' + token,
      },
    });
    debug('oauth.validate', JSON.stringify(request.data));
    expirationDate[type] = Date.now() + request.data.expires_in * 1000;

    setTimeout(() => {
      const botId = variables.get('services.twitch.botId') as string;
      const broadcasterId = variables.get('services.twitch.broadcasterId') as string;

      if (type === 'bot' && botId === broadcasterId) {
        warning('You shouldn\'t use same account for bot and broadcaster!');
      }
    }, 10000);

    if (type === 'bot') {
      emitter.emit('set', '/services/twitch', 'botId', request.data.user_id);
      emitter.emit('set', '/services/twitch', 'botUsername', request.data.login);
      emitter.emit('set', '/services/twitch', 'botCurrentScopes', request.data.scopes);
      emitter.emit('set', '/services/twitch', 'botTokenValid', true);
      botTokenErrorSent = false;

      // load profile image of a bot
      const clientBot = await client('bot');
      const userFromTwitch = await clientBot.users.getUserByName(request.data.login);
      if (userFromTwitch) {
        emitter.emit('set', '/services/twitch', 'botProfileImageUrl', userFromTwitch.profilePictureUrl);
      } else {
        throw new Error(`User ${request.data.login} not found on Twitch.`);
      }
    } else {
      emitter.emit('set', '/services/twitch', 'broadcasterId', request.data.user_id);
      emitter.emit('set', '/services/twitch', 'broadcasterUsername', request.data.login);
      emitter.emit('set', '/services/twitch', 'broadcasterCurrentScopes', request.data.scopes);
      emitter.emit('set', '/services/twitch', 'broadcasterTokenValid', true);
      broadcasterTokenErrorSent = false;
    }

    if (cache[type] !== '' && cache[type] !== request.data.login + request.data.scopes.join(',')) {
      tmiEmitter.emit('reconnect', type); // force TMI reconnect
      cache[type] = request.data.login + request.data.scopes.join(',');
    }

    setStatus('API', request.status === 200 ? constants.CONNECTED : constants.DISCONNECTED);

    return true;
  } catch (e: any) {
    expirationDate[type] = -1;

    if (e.isAxiosError) {
      if ((typeof e.response === 'undefined' || (e.response.status !== 401 && e.response.status !== 403)) && retry < 5) {
        // retry validation if error is different than 401 Invalid Access Token
        await new Promise < void > ((resolve) => {
          setTimeout(() => resolve(), 1000 + (retry ** 2));
        });
        return validate(type, retry++);
      }
      if (await refresh(type)) {
        return true;
      }
      throw new Error(`Error on validate ${type} OAuth token, error: ${e.response.status} - ${e.response.statusText} - ${e.response.data.message}`);
    } else {
      debug('oauth.validate', e.stack);
      if (e.message.includes('no refresh token for')) {
        if ((type === 'bot' && !botTokenErrorSent) || (type === 'broadcaster' && !broadcasterTokenErrorSent)) {
          warning(`Rerfresh token ${type} account not found. Please set it in UI.`);
          if (type === 'broadcaster') {
            broadcasterTokenErrorSent = true;
          } else {
            botTokenErrorSent = true;
          }
        }
      } else {
        error(e);
        error(e.stack);
      }
      const botRefreshToken = variables.get('services.twitch.botRefreshToken') as string;
      const broadcasterRefreshToken = variables.get('services.twitch.broadcasterRefreshToken') as string;

      if ((type === 'bot' ? botRefreshToken : broadcasterRefreshToken) !== '') {
        refresh(type, clear);
      } else {
        if (type === 'bot') {
          emitter.emit('set', '/services/twitch', 'botTokenValid', false);
          emitter.emit('set', '/services/twitch', 'botId', '');
          emitter.emit('set', '/services/twitch', 'botUsername', '');
          emitter.emit('set', '/services/twitch', 'botCurrentScopes', []);
        } else {
          emitter.emit('set', '/services/twitch', 'broadcasterTokenValid', false);
          emitter.emit('set', '/services/twitch', 'broadcasterId', '');
          emitter.emit('set', '/services/twitch', 'broadcasterUsername', '');
          emitter.emit('set', '/services/twitch', 'broadcasterCurrentScopes', []);
        }
      }
    }
    debug('oauth.validate', `Token for ${type} is ${status ? 'valid' : 'invalid'}.`);
    throw new Error(e);
  } finally {
    isValidating[type] = false;
  }
};
