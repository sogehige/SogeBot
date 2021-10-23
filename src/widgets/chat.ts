import axios from 'axios';

import { getUserSender } from '../helpers/commons';
import { sendMessage } from '../helpers/commons/sendMessage';
import { botId } from '../helpers/oauth/botId';
import { botUsername } from '../helpers/oauth/botUsername';
import { generalChannel } from '../helpers/oauth/generalChannel';
import { adminEndpoint, publicEndpoint } from '../helpers/socket';
import { getIgnoreList } from '../helpers/user/isIgnored';
import Widget from './_interface';

class Chat extends Widget {
  public sockets() {
    adminEndpoint(this.nsp, 'chat.message.send', async (message) => {
      sendMessage(message, getUserSender(botId.value, botUsername.value), { force: true });
    });

    publicEndpoint(this.nsp, 'room', async (cb: (error: null, data: string) => void) => {
      cb(null, generalChannel.value.toLowerCase());
    });

    adminEndpoint(this.nsp, 'viewers', async (cb) => {
      try {
        const url = `https://tmi.twitch.tv/group/user/${generalChannel.value.toLowerCase()}/chatters`;
        const response = await axios.get<{chatters: { viewers: string[] }}>(url);

        if (response.status === 200) {
          const chatters = response.data.chatters;
          chatters.viewers = chatters.viewers.filter((o) => !getIgnoreList().includes(o));
          cb(null, { chatters });
        }
      } catch (e: any) {
        cb(e.message, {});
      }
    });
  }
}

export default new Chat();
