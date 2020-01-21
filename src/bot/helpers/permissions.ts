export const permission = Object.freeze({
  CASTERS: '4300ed23-dca0-4ed9-8014-f5f2f7af55a9',
  MODERATORS: 'b38c5adb-e912-47e3-937a-89fabd12393a',
  SUBSCRIBERS: 'e3b557e7-c26a-433c-a183-e56c11003ab7',
  VIP: 'e8490e6e-81ea-400a-b93f-57f55aad8e31',
  FOLLOWERS: 'c168a63b-aded-4a90-978f-ed357e95b0d2',
  VIEWERS: '0efd7b1c-e460-4167-8e06-8aaf2c170311',
});

export let cachedViewers: {
  [userId: number]: {
    [permId: string]: boolean;
  };
} = {};

export const cleanViewersCache = () => {
  cachedViewers = {};
};

export const getFromViewersCache = (userId: number | string, permId: string) => {
  userId = Number(userId);
  const permList = cachedViewers[userId];
  if (permList) {
    return permList[permId];
  } else {
    return undefined;
  }
};

export const addToViewersCache = (userId: number | string, permId: string, haveAccess: boolean) => {
  userId = Number(userId);
  if (typeof cachedViewers[userId] === 'undefined') {
    cachedViewers[userId] = {};
  }
  cachedViewers[userId][permId] = haveAccess;
};