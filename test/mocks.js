const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { v4 } = require('uuid');

const users = require('./helpers/user');

const getLatest100FollowersMockData = () => {
  const data = [];
  for (let i = 0; i < 100; i++) {
    // we want to have each follower every minute
    data.push({
      'userId':     String(Math.floor(Math.random() * 10000000)),
      'userName':   v4(),
      'followDate': new Date(Date.now() - (i * 60000)),
    });
  }
  return data;
};

global.mockClient = (account) => {
  return {
    chat: {
      getGlobalEmotes:  () => ([]),
      getChannelEmotes: () => ([]),
    },
    users: {
      getUserByName: (userName) => {
        let id = String(Math.floor(Math.random() * 100000));
        for (const key of Object.keys(users)) {
          if (users[key].userName === userName) {
            id = users[key].userId;
          }
        }
        return {
          id,
          name:              userName,
          displayName:       userName,
          profilePictureUrl: '',
        };
      },
      getFollows: () => {
        console.log('Mocking call users.getFollows for ' + account);
        return {
          data: getLatest100FollowersMockData(),
        };
      },
    },
    clips: {
      getClipById: () => {
        console.log('Mocking call clips.getClipById for ' + account);
      },
    },
  };
};

global.mock = new MockAdapter(axios);
global.mock
  .onGet('http://localhost/get?test=a\\nb').reply(200, { test: 'a\\nb' })
  .onAny().passThrough(); // pass through others