/* global describe it before */
const {
  isMainThread
} = require('worker_threads');
if (!isMainThread) process.exit()


require('../../general.js')

const db = require('../../general.js').db
const message = require('../../general.js').message

const Parser = require('../../../dest/parser')

describe('Parser - case sensitive commands', async () => {
  const tests = [
    {
      test: '!uptime',
      expected: 'Stream is currently offline for'
    },
    {
      test: '!UPTIME',
      expected: 'Stream is currently offline for'
    }
  ]

  for (let test of tests) {
    describe(`'${test.test}' expect '${test.expected}'`, async () => {
      before(async () => {
        await db.cleanup()
        await message.prepare()
      })

      it(`Run command '${test.test}'`, async () => {
        const parse = new Parser({ sender: { username: 'soge__' }, message: test.test, skip: false, quiet: false })
        await parse.process()
      })

      it(`Expect message '${test.expected}`, async () => {
        await message.isSentRaw(test.expected, { username: 'soge__' })
      })
    })
  }
})
