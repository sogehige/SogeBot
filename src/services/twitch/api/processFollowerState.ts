import * as constants from '@sogebot/ui-helpers/constants';
import { chunk } from 'lodash';
import { getRepository } from 'typeorm';

import { User, UserInterface } from '~/database/entity/user';
import { follow } from '~/helpers/events/follow';
import { debug } from '~/helpers/log';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';
import { SQLVariableLimit } from '~/helpers/sql';
import * as changelog from '~/helpers/user/changelog.js';

export const processFollowerState = async (users: { from_name: string; from_id: string; followed_at: string }[], fullScale = false) => {
  const timer = Date.now();
  if (users.length === 0) {
    debug('api.followers', `No followers to process.`);
    return;
  }
  debug('api.followers', `Processing ${users.length} followers`);
  await changelog.flush();
  const usersGotFromDb = (await Promise.all(
    chunk(users, SQLVariableLimit).map(async (bulk) => {
      return await getRepository(User).findByIds(bulk.map(user => user.from_id));
    }),
  )).flat();
  debug('api.followers', `Found ${usersGotFromDb.length} followers in database`);
  if (users.length > usersGotFromDb.length) {
    const usersSavedToDbPromise: Promise<Readonly<Required<UserInterface>>>[] = [];
    users
      .filter(user => !usersGotFromDb.find(db => db.userId === user.from_id))
      .map(user => {
        return { userId: user.from_id, userName: user.from_name };
      }).forEach(user => {
        changelog.update(user.userId, user);
        usersSavedToDbPromise.push(changelog.get(user.userId) as Promise<Readonly<Required<UserInterface>>>);
      });
    const usersSavedToDb = await Promise.all(usersSavedToDbPromise);
    await setImmediateAwait();
    await updateFollowerState([...usersSavedToDb, ...usersGotFromDb], users, fullScale);
  } else {
    await updateFollowerState(usersGotFromDb, users, fullScale);
  }
  debug('api.followers', `Finished parsing ${users.length} followers in ${Date.now() - timer}ms`);
};

const updateFollowerState = async(users: (Readonly<Required<UserInterface>>)[], usersFromAPI: { from_name: string; from_id: string; followed_at: string }[], fullScale: boolean) => {
  if (!fullScale) {
    // we are handling only latest followers
    // handle users currently not following
    for (const user of users.filter(o => !o.isFollower)) {
      const apiUser = usersFromAPI.find(userFromAPI => userFromAPI.from_id === user.userId) as typeof usersFromAPI[0];
      if (new Date().getTime() - new Date(apiUser.followed_at).getTime() < 2 * constants.HOUR) {
        if (user.followedAt === 0 || new Date().getTime() - user.followedAt > 60000 * 60) {
          follow(user.userId, user.userName, user.followedAt);
        }
      }
    }
  }

  users.map(user => {
    const apiUser = usersFromAPI.find(userFromAPI => userFromAPI.from_id === user.userId) as typeof usersFromAPI[0];
    return {
      ...user,
      followedAt:    user.haveFollowedAtLock ? user.followedAt : new Date(apiUser.followed_at).getTime(),
      isFollower:    user.haveFollowerLock? user.isFollower : true,
      followCheckAt: Date.now(),
    };
  }).forEach(user => {
    changelog.update(user.userId, user);
  });
};