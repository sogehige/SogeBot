import { SECOND } from '@sogebot/ui-helpers/constants';

import users from '../../users';
import { eventEmitter } from '../events';

type RFC3339 = string; // 2020-04-24T20:07:24Z

let latestLevel = 1 as 1 | 2 | 3 | 4 | 5;
let startedAt = null as null | string;
let expiresAt = '2020-04-24T20:05:47.30473127Z' as null | string;
let total = 0;
let goal = 0;

let lastContributionTotal = 0;
let lastContributionType = 'BITS' as 'BITS' | 'SUBS';
let lastContributionUserId = null as null | string;

let topContributionsBitsTotal = 0;
let topContributionsBitsUserId = null as null | string;
let topContributionsSubsTotal = 0;
let topContributionsSubsUserId = null as null | string;

async function setCurrentLevel(level: 1 | 2 | 3 | 4 | 5) {
  if (level > latestLevel && level > 1) {
    eventEmitter.emit('hypetrain-level-reached', {
      level,
      total,
      goal,

      topContributionsBitsUserId:   topContributionsBitsUserId ? topContributionsBitsUserId : 'n/a',
      topContributionsBitsUsername: topContributionsBitsUserId ? await users.getNameById(topContributionsBitsUserId) : 'n/a',
      topContributionsBitsTotal,

      topContributionsSubsUserId:   topContributionsSubsUserId ? topContributionsSubsUserId : 'n/a',
      topContributionsSubsUsername: topContributionsSubsUserId ? await users.getNameById(topContributionsSubsUserId) : 'n/a',
      topContributionsSubsTotal,

      lastContributionTotal,
      lastContributionType,
      lastContributionUserId:   lastContributionUserId ? lastContributionUserId : 'n/a',
      lastContributionUsername: lastContributionUserId ? await users.getNameById(lastContributionUserId) : 'n/a',
    });
  }
  latestLevel = level;
}

function getCurrentLevel() {
  return latestLevel;
}

function getStartedAt() {
  return startedAt;
}

function setLastContribution(total_: typeof lastContributionTotal, type: typeof lastContributionType, userId: typeof lastContributionUserId) {
  lastContributionTotal = total_;
  lastContributionType = type;
  lastContributionUserId = userId;
}

function setTopContributions(type: 'BITS' | 'SUBS', total_: typeof lastContributionTotal, userId: typeof topContributionsBitsUserId) {
  if (type === 'BITS') {
    topContributionsBitsTotal = total_;
    topContributionsBitsUserId = userId;
  } else {
    topContributionsSubsTotal = total_;
    topContributionsSubsUserId = userId;
  }
}

function setStartedAt(date: null | RFC3339) {
  if (date && date !== startedAt) {
    eventEmitter.emit('hypetrain-started');
  }
  startedAt = date;
}

function setExpiresAt(date: null | RFC3339) {
  expiresAt = date;
}

function setTotal(value: number) {
  total = value;
}

function setGoal(value: number) {
  goal = value;
}

setInterval(async () => {
  if (expiresAt) {
    if (new Date(expiresAt).getTime() < Date.now()) {
      eventEmitter.emit('hypetrain-ended', {
        level: latestLevel,
        total,
        goal,

        topContributionsBitsUserId:   topContributionsBitsUserId ? topContributionsBitsUserId : 'n/a',
        topContributionsBitsUsername: topContributionsBitsUserId ? await users.getNameById(topContributionsBitsUserId) : 'n/a',
        topContributionsBitsTotal,

        topContributionsSubsUserId:   topContributionsSubsUserId ? topContributionsSubsUserId : 'n/a',
        topContributionsSubsUsername: topContributionsSubsUserId ? await users.getNameById(topContributionsSubsUserId) : 'n/a',
        topContributionsSubsTotal,

        lastContributionTotal,
        lastContributionType,
        lastContributionUserId:   lastContributionUserId ? lastContributionUserId : 'n/a',
        lastContributionUsername: lastContributionUserId ? await users.getNameById(lastContributionUserId) : 'n/a',
      });
      expiresAt = null;
    }
  }
}, 30 * SECOND);

export {
  getCurrentLevel,
  setCurrentLevel,
  getStartedAt,
  setStartedAt,
  setExpiresAt,
  setTotal,
  setGoal,
  setTopContributions,
  setLastContribution,
};
