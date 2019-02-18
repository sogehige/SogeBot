/* global describe it before */
const {
  isMainThread
} = require('worker_threads');
if (!isMainThread) process.exit()


require('../../general.js')

const db = require('../../general.js').db
const message = require('../../general.js').message
const constants = require('../../../dest/constants')

const moment = require('moment-timezone')

// users
const owner = { username: 'soge__' }

describe('Top - !top followage', () => {
  before(async () => {
    await db.cleanup()
    await message.prepare()
  })

  it ('Add 10 users into db and last user will don\'t have any followage', async () => {
    for (let i = 0; i < 10; i++) {
      const id = String(Math.floor(Math.random() * 100000))
      await global.db.engine.insert('users', {
        id,
        username: 'user' + i,
        is: {
          follower: true
        },
        time: {
          follow: Date.now() - (constants.HOUR * i)
        }
      })
    }
  })

  it ('Add user with long followage but not follower', async () => {
    const id = String(Math.floor(Math.random() * 100000))
    await global.db.engine.insert('users', {
      id,
      username: 'user11',
      is: {
        follower: false
      },
      time: {
        follow: Date.now() - (constants.HOUR * 24 * 30)
      }
    })
  })

  it('run !top followage and expect correct output', async () => {
    global.systems.top.followage({ sender: { username: global.commons.getOwner() } })
    const dates = []
    for (let i = 0; i < 10; i++) {
      dates.push(`${moment.utc(Date.now() - (constants.HOUR * i)).format('L')} (${moment.utc(Date.now() - (constants.HOUR * i)).fromNow()})`)
    }
    await message.isSentRaw(`Top 10 (followage): 1. @user9 - ${dates[9]}, 2. @user8 - ${dates[8]}, 3. @user7 - ${dates[7]}, 4. @user6 - ${dates[6]}, 5. @user5 - ${dates[5]}, 6. @user4 - ${dates[4]}, 7. @user3 - ${dates[3]}, 8. @user2 - ${dates[2]}, 9. @user1 - ${dates[1]}, 10. @user0 - ${dates[0]}`, owner)
  })
})
