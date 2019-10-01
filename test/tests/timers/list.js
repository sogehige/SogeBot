/* global describe it beforeEach */
require('../../general.js');

const db = require('../../general.js').db;
const uuid = require('uuid/v4');
const message = require('../../general.js').message;

// users
const owner = { username: 'soge__' };

describe('Timers - list()', () => {
  beforeEach(async () => {
    await db.cleanup();
    await message.prepare();
    await global.db.engine.insert(global.systems.timers.collection.data, { id: uuid(), name: 'test', messages: 0, seconds: 60, enabled: true, trigger: { messages: global.linesParsed, timestamp: new Date().getTime() } });
    const timer = await global.db.engine.insert(global.systems.timers.collection.data, { id: uuid(), name: 'test2', messages: 0, seconds: 60, enabled: false, trigger: { messages: global.linesParsed, timestamp: new Date().getTime() } });
    await global.db.engine.insert(global.systems.timers.collection.responses, { response: 'Lorem Ipsum', timerId: timer.id, enabled: true });
    await global.db.engine.insert(global.systems.timers.collection.responses, { response: 'Lorem Ipsum 2', timerId: timer.id, enabled: false });
  });

  it('', async () => {
    global.systems.timers.list({ sender: owner, parameters: '' });
    await message.isSentRaw(`@${owner.username}, timers list: ⚫ test, ⚪ test2`, owner);
  });

  it('-name unknown', async () => {
    global.systems.timers.list({ sender: owner, parameters: '-name unknown' });
    await message.isSent('timers.timer-not-found', owner, { name: 'unknown', sender: owner.username });
  });

  it('-name test2', async () => {
    global.systems.timers.list({ sender: owner, parameters: '-name test2' });

    const response1 = await global.db.engine.findOne(global.systems.timers.collection.responses, { response: 'Lorem Ipsum' });
    const response2 = await global.db.engine.findOne(global.systems.timers.collection.responses, { response: 'Lorem Ipsum 2' });

    await message.isSent('timers.responses-list', owner, { name: 'test2', sender: owner.username });
    await message.isSentRaw([
      `⚫ ${response1._id} - ${response1.response}`,
      `⚪ ${response2._id} - ${response2.response}`], owner, { name: 'test2', sender: owner.username });
    await message.isSentRaw([
      `⚫ ${response1._id} - ${response1.response}`,
      `⚪ ${response2._id} - ${response2.response}`], owner, { name: 'test2', sender: owner.username });
  });
});
