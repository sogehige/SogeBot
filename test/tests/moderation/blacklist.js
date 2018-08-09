/* global describe it before */
if (require('cluster').isWorker) process.exit()

require('../../general.js')

const db = require('../../general.js').db
const variable = require('../../general.js').variable

const _ = require('lodash')
const assert = require('chai').assert

const tests = {
  'test': {
    'should.return.false': [
      'test', 'a test', 'test a', 'a test a', 'test?', '?test'
    ],
    'should.return.true': [
      'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'testa', 'testaa', 'atesta', 'aatestaa', 'test1', '1test1', 'test11', '11test11', 'русскийtestрусский', 'testрусский', '한국어test한국어', 'test한국어'
    ]
  },
  '*test': {
    'should.return.false': [
      'test', 'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'a test', 'test a', 'test?', '?test'
    ],
    'should.return.true': [
      'testa', 'testaa', 'atesta', 'aatestaa', 'test1', '1test1', 'test11', '11test11', 'русскийtestрусский', 'testрусский', '한국어test한국어', 'test한국어'
    ]
  },
  'test*': {
    'should.return.false': [
      'test', 'a test', 'test a', 'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', 'test?', '?test'
    ],
    'should.return.true': [
      'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어'
    ]
  },
  '*test*': {
    'should.return.true': [
      'abc'
    ],
    'should.return.false': [
      'test', 'a test', 'test a', 'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', 'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어', 'test?', '?test'
    ]
  },
  '+test': {
    'should.return.false': [
      'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'atest?'
    ],
    'should.return.true': [
      'test', 'a test', 'test a', 'testa', 'testaa', 'atesta', 'aatestaa', 'test1', '1test1', 'test11', '11test11', 'русскийtestрусский', 'testрусский', '한국어test한국어', 'test한국어', '?test'
    ]
  },
  'test+': {
    'should.return.false': [
      'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', '?testa'
    ],
    'should.return.true': [
      'test', 'a test', 'test a', 'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어', 'test?'
    ]
  },
  '+test+': {
    'should.return.false': [
      'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어'
    ],
    'should.return.true': [
      'test', 'abc', 'a test', 'test a', 'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', 'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'test?', '?test'
    ]
  },
  '*test+': {
    'should.return.false': [
      'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', 'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어'
    ],
    'should.return.true': [
      'test', 'abc', 'a test', 'test a', 'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'test?', '?test'
    ]
  },
  '+test*': {
    'should.return.false': [
      'atest', 'aatest', '1test', '11test', 'русскийtest', '한국어test', 'atesta', 'aatestaa', '1test1', '11test11', 'русскийtestрусский', '한국어test한국어'
    ],
    'should.return.true': [
      'test', 'abc', 'a test', 'test a', 'testa', 'testaa', 'test1', 'test11', 'testрусский', 'test한국어', 'test?', '?test'
    ]
  },
  '*саня*': {
    'should.return.false': ['саня'],
    'should.return.true': []
  }
}

describe('systems/moderation - blacklist()', () => {
  before(async () => {
    await db.cleanup()
  })

  for (let [pattern, test] of Object.entries(tests)) {
    for (let text of _.get(test, 'should.return.true', [])) {
      it(`pattern '${pattern}' should ignore '${text}'`, async () => {
        await (global.systems.moderation.settings.lists.blacklist = [pattern])
        await variable.isEqual('systems.moderation.settings.lists.blacklist', [pattern])
        let result = await global.systems.moderation.blacklist({ sender: { username: 'testuser' }, message: text })
        assert.isTrue(result)
      })
    }
    for (let text of _.get(test, 'should.return.false', [])) {
      it(`pattern '${pattern}' should timeout on '${text}'`, async () => {
        await (global.systems.moderation.settings.lists.blacklist = [pattern])
        await variable.isEqual('systems.moderation.settings.lists.blacklist', [pattern])
        let result = await global.systems.moderation.blacklist({ sender: { username: 'testuser' }, message: text })
        assert.isFalse(result)
      })
    }
  }
})
