/* global describe it before */
if (require('cluster').isWorker) process.exit()

require('../../general.js')

const db = require('../../general.js').db
const message = require('../../general.js').message
const assert = require('assert')

// users
const owner = { username: 'soge__' }
const user1 = { username: 'user1' }

describe('Custom Commands - run()', () => {
  before(async () => {
    await db.cleanup()
    await message.prepare()
  })

  describe('!cmd with username filter', () => {
    it('create command and response with filter', async () => {
      let cmd = await global.db.engine.insert('systems.customcommands', { command: '!cmd', enabled: true, visible: true })
      await global.db.engine.insert('systems.customcommands.responses', { cid: String(cmd._id), filter: '$sender == "user1"', response: 'Lorem Ipsum', permission: 1 })
    })

    it('run command as user not defined in filter', async () => {
      global.systems.customCommands.run({ sender: owner, message: '!cmd' })
      let notSent = false
      try {
        await message.isSentRaw('Lorem Ipsum', owner)
      } catch (e) {
        notSent = true
      }
      assert.ok(!!notSent)
    })

    it('run command as user defined in filter', async () => {
      global.systems.customCommands.run({ sender: user1, message: '!cmd' })
      await message.isSentRaw('Lorem Ipsum', user1)
    })
  })

  it('!a will show Lorem Ipsum', async () => {
    global.systems.customCommands.add({ sender: owner, parameters: '!a Lorem Ipsum' })
    await message.isSent('customcmds.command-was-added', owner, { command: '!a', response: 'Lorem Ipsum', sender: owner.username })

    global.systems.customCommands.run({ sender: owner, message: '!a' })
    await message.isSentRaw('Lorem Ipsum', owner)

    global.systems.customCommands.remove({ sender: owner, parameters: '!a' })
    await message.isSent('customcmds.command-was-removed', owner, { command: '!a', sender: owner.username })
  })

  it('!한글 will show Lorem Ipsum', async () => {
    global.systems.customCommands.add({ sender: owner, parameters: '!한글 Lorem Ipsum' })
    await message.isSent('customcmds.command-was-added', owner, { command: '!한글', response: 'Lorem Ipsum', sender: owner.username })

    global.systems.customCommands.run({ sender: owner, message: '!한글' })
    await message.isSentRaw('Lorem Ipsum', owner)

    global.systems.customCommands.remove({ sender: owner, parameters: '!한글' })
    await message.isSent('customcmds.command-was-removed', owner, { command: '!한글', sender: owner.username })
  })

  it('!русский will show Lorem Ipsum', async () => {
    global.systems.customCommands.add({ sender: owner, parameters: '!русский Lorem Ipsum' })
    await message.isSent('customcmds.command-was-added', owner, { command: '!русский', response: 'Lorem Ipsum', sender: owner.username })

    global.systems.customCommands.run({ sender: owner, message: '!русский' })
    await message.isSentRaw('Lorem Ipsum', owner)

    global.systems.customCommands.remove({ sender: owner, parameters: '!русский' })
    await message.isSent('customcmds.command-was-removed', owner, { command: '!русский', sender: owner.username })
  })
})
