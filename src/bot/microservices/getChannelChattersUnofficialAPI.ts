import axios from 'axios';
import { flatMap, includes } from 'lodash';
import config from '@config';
import { isMainThread, parentPort, Worker } from 'worker_threads';

import {
  createConnection,
  getConnection,
  getConnectionOptions,
  getManager,
} from 'typeorm';

import { UsersOnline } from '../entity/usersOnline';
import { ThreadEvent } from '../entity/threadEvent';
import { getAllOnlineUsernames } from '../users';

export const getChannelChattersUnofficialAPI = async (): Promise<{ modStatus: boolean; partedUsers: string[]; joinedUsers: string[] }> => {
  if (!isMainThread) {
    const connectionOptions = await getConnectionOptions();
    createConnection({
      synchronize: true,
      logging: false,
      entities: [__dirname + '/../entity/*.{js,ts}'],
      ...connectionOptions,
    });
  }
  const connection = await getConnection();

  // spin up worker
  if (isMainThread && (config.database.type === 'mongodb' && connection.options.type !== 'sqlite')) {
    const value = await new Promise((resolve, reject) => {
      const worker = new Worker(__filename);
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
    return value as unknown as { modStatus: boolean; partedUsers: string[]; joinedUsers: string[] };
  }

  try {
    // lock thread
    await getManager()
      .createQueryBuilder()
      .insert()
      .into(ThreadEvent)
      .values([
        { event: 'getChannelChattersUnofficialAPI' },
      ])
      .execute();



    const event = await getManager()
      .createQueryBuilder()
      .select()
      .from(ThreadEvent, 'thread')
      .where('thread.event = :event', { event: 'getChannelChattersUnofficialAPI' })
      .execute();
    console.log({event});

    const channel: string | undefined = (await global.db.engine.findOne('core.settings', {
      key: 'generalChannel',
      system: 'oauth',
    })).value;
    const bot: string | undefined = (await global.db.engine.findOne('core.settings', {
      key: 'botUsername',
      system: 'oauth',
    })).value;

    if (typeof channel === 'undefined') {
      throw Error('channel undefined');
    }

    const url = `https://tmi.twitch.tv/group/user/${channel}/chatters`;
    const request = await axios.get(url);

    if (typeof request.data.chatters === 'undefined') {
      throw Error('chatters undefined');
    }

    const chatters: any[] = flatMap(request.data.chatters);
    const modStatus = request.data.chatters.moderators.map(o => o.toLowerCase()).includes(bot);

    const allOnlineUsers = await getAllOnlineUsernames();

    const partedUsers: string[] = [];
    for (const user of allOnlineUsers) {
      if (!includes(chatters, user) && user !== bot) {
        // user is no longer in channel
        await getManager()
          .createQueryBuilder()
          .delete()
          .from(UsersOnline)
          .where('username = :username', { username: user })
          .execute();
        partedUsers.push(user);
      }
    }

    const joinedUsers: string[] = [];
    for (const chatter of chatters) {
      if (!includes(allOnlineUsers, chatter) && chatter !== bot) {
        joinedUsers.push(chatter);
      }
    }

    // always remove bot from online users
    await getManager()
      .createQueryBuilder()
      .delete()
      .from(UsersOnline)
      .where('username = :username', { username: bot })
      .execute();

    // insert joined online users
    if (joinedUsers.length > 0) {
      await getManager()
        .createQueryBuilder()
        .insert()
        .into(UsersOnline)
        .values(
          joinedUsers.map(o => {
            return { username: o };
          }),
        )
        .execute();
    }

    if (!isMainThread) {
      parentPort?.postMessage({ modStatus, partedUsers, joinedUsers });
    }
    return { modStatus, partedUsers, joinedUsers };
  } catch (e) {
    if (!isMainThread) {
      parentPort?.postMessage({ modStatus: false, partedUsers: [], joinedUsers: [] });
    }
    return { modStatus: false, partedUsers: [], joinedUsers: [] };
  } finally {
    // free event
    await getManager()
      .createQueryBuilder()
      .delete()
      .from(ThreadEvent)
      .where('event = :event', { event: 'getChannelChattersUnofficialAPI' })
      .execute();
  };
};

if (!isMainThread) {
  // init if not master
  getChannelChattersUnofficialAPI();
}