/* global */
require('../../general.js');
require('../../mocks.js');

const assert = require('assert');

const Message = require('../../../dest/message').default;
const db = require('../../general.js').db;
const msg = require('../../general.js').message;

describe('Message - api filter - @func3', () => {
  beforeEach(async () => {
    await db.cleanup();
    await msg.prepare();
  });

  describe('#1989 - ?test=a\\\\nb should be correctly parsed', () => {
    // we are using mock http://localhost/get?test=a\\nb

    const toParse = '(api|http://localhost/get?test=a\\nb) Lorem (api.test)';

    it('Expecting response Lorem a\\\\nb', async () => {
      const message = await new Message(toParse).parse({ });
      assert(message === 'Lorem a\\nb');
    });
  });
});
