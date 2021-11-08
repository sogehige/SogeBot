import { setInterval } from 'timers';

import { MINUTE } from '@sogebot/ui-helpers/constants';
import { StaticAuthProvider } from '@twurple/auth';
import { PubSubClient } from '@twurple/pubsub';

import { rawDataSymbol } from '~/../node_modules/@twurple/common/lib';
import { isStreamOnline } from '~/helpers/api';
import { eventEmitter } from '~/helpers/events';
import {
  ban, error, info, redeem, timeout, unban, warning,
} from '~/helpers/log';
import eventlist from '~/overlays/eventlist';
import alerts from '~/registries/alerts';
import { variables } from '~/watchers';

const rewardsRedeemed = new Set();

class PubSub {
  pubSubClient: PubSubClient | null = null;
  listeners: any[] = [];

  constructor() {
    setInterval(() => {
      if (!isStreamOnline.value) {
        rewardsRedeemed.clear();
      }
    }, 10 * MINUTE);

    setInterval(async () => {
      try {
        if (this.pubSubClient) {
          return;
        }
        const clientId = variables.get(`services.twitch.broadcasterClientId`) as string;
        const accessToken = variables.get(`services.twitch.broadcasterAccessToken`) as string;
        const broadcasterId = variables.get(`services.twitch.broadcasterId`) as string;
        const generalChannel = variables.get(`services.twitch.generalChannel`) as string;
        const isValidToken = variables.get(`services.twitch.broadcasterTokenValid`) as string;

        if (!isValidToken) {
          throw new Error(`Cannot initialize Twitch PubSub, broadcaster token invalid.`);
        }
        const authProvider = new StaticAuthProvider(clientId, accessToken);
        this.pubSubClient = new PubSubClient();
        await this.pubSubClient.registerUserListener(authProvider);

        this.listeners.push(await this.pubSubClient.onModAction(broadcasterId, generalChannel, (message) => {
          try {
            const createdBy = `${message.userName}#${message.userId}`;
            if (message[rawDataSymbol].data.moderation_action === 'ban') {
              const [ userName, reason ] = message[rawDataSymbol].data.args;
              ban(`${userName}#${message[rawDataSymbol].data.args[0]} by ${createdBy}: ${reason ? reason : '<no reason>'}`);
              eventEmitter.emit('ban', { userName, reason: reason ? reason : '<no reason>' });
            } else if (message[rawDataSymbol].data.moderation_action === 'unban') {
              const [ userName ] = message[rawDataSymbol].data.args;
              unban(`${userName}#${(message[rawDataSymbol].data as any).target_user_id} by ${createdBy}`);
            } else if (message[rawDataSymbol].data.moderation_action === 'timeout') {
              const [ userName, reason ] = message[rawDataSymbol].data.args;
              timeout(`${userName}#${(message[rawDataSymbol].data as any).target_user_id} by ${createdBy} for ${reason} seconds`);
              eventEmitter.emit('timeout', { userName, duration: Number(reason) });
            } else if (message[rawDataSymbol].data.moderation_action === 'followersoff') {
              info(`${createdBy} disabled followers-only mode.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'followers') {
              if (message[rawDataSymbol].data.args !== null && Number(message[rawDataSymbol].data.args[0]) !== 0) {
                info(`${createdBy} enabled followers-only mode for follows at least ${message[rawDataSymbol].data.args[0]} minutes old.`);
              } else {
                info(`${createdBy} enabled followers-only mode (any follower).`);
              }
            } else if (message[rawDataSymbol].data.moderation_action === 'slow') {
              if (message[rawDataSymbol].data.args === null) {
                message[rawDataSymbol].data.args = ['30']; // default;
              }
              info(`${createdBy} enabled slow mode with ${message[rawDataSymbol].data.args[0]}s wait time.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'slowoff') {
              info(`${createdBy} disabled slow mode.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'subscribersoff') {
              info(`${createdBy} disabled subscribers-only mode.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'subscribers') {
              info(`${createdBy} enabled subscribers-only mode.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'emoteonlyoff') {
              info(`${createdBy} disabled emote-only mode.`);
            } else if (message[rawDataSymbol].data.moderation_action === 'emoteonly') {
              info(`${createdBy} enabled emote-only mode.`);
            }
          } catch (e) {
            warning(`PUBSUB: Unknown moderation_action ${message[rawDataSymbol].data.moderation_action}`);
            warning(`${JSON.stringify(message, null, 2)}`);
          }
        }));
        info('PUBSUB: listening to onModAction');

        this.listeners.push(await this.pubSubClient?.onRedemption(broadcasterId, (message) => {
          if (rewardsRedeemed.has(message.id)) {
            return;
          } else {
            rewardsRedeemed.add(message.id);
          }
          // trigger reward-redeemed event
          if (message.message) {
            redeem(`${message.userName}#${message.userId} redeemed ${message.rewardTitle}: ${message.message}`);
          } else {
            redeem(`${message.userName}#${message.userId} redeemed ${message.rewardTitle}`);
          }

          eventlist.add({
            event:         'rewardredeem',
            userId:        String(message.userId),
            message:       message.message,
            timestamp:     Date.now(),
            titleOfReward: message.rewardTitle,
          });
          alerts.trigger({
            event:      'rewardredeems',
            name:       message.rewardTitle,
            amount:     0,
            tier:       null,
            currency:   '',
            monthsName: '',
            message:    message.message,
            recipient:  message.userName,
          });
          eventEmitter.emit('reward-redeemed', {
            userId:        message.userId,
            userName:      message.userName,
            titleOfReward: message.rewardTitle,
            userInput:     message.message,
          });
        }));
        info('PUBSUB: listening to onRedemption');
      } catch (e) {
        if (e instanceof Error) {
          error(e.stack ?? e.message);
        }
      }
    }, 30000);
  }

  stop() {
    for (const listener of this.listeners) {
      listener.remove();
    }
    info('PUBSUB: removing listeners');
  }
}

export default PubSub;