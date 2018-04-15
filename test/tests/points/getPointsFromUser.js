/* global describe it before */

require('../../general.js')

const db = require('../../general.js').db
const message = require('../../general.js').message

const hugePointsUser = { username: 'hugeuser', points: 99999999999999999999999999999999 }
const tinyPointsUser = { username: 'tinyuser', points: 100 }

describe('Points - getPointsFromUser()', () => {
  before(async () => {
    await db.cleanup()
    await message.prepare()
  })

  describe('User with more than safe points should return safe points', () => {
    it('create user with huge amount of points', async () => {
      await global.db.engine.insert('users.points', hugePointsUser)
    })

    it('points should be returned in safe points bounds', async () => {
      await global.systems.points.getPointsFromUser(global.systems.points, hugePointsUser, hugePointsUser.username)
      await message.isSent('points.defaults.pointsResponse', { username: hugePointsUser.username }, {
        amount: Math.floor(Number.MAX_SAFE_INTEGER / 1000000),
        username: hugePointsUser.username,
        pointsName: await global.systems.points.getPointsName(Math.floor(Number.MAX_SAFE_INTEGER / 1000000))
      })
    })
  })

  describe('User with less than safe points should return unchanged points', () => {
    it('create user with normal amount of points', async () => {
      await global.db.engine.insert('users.points', tinyPointsUser)
    })

    it('points should be returned in safe points bounds', async () => {
      await global.systems.points.getPointsFromUser(global.systems.points, tinyPointsUser, tinyPointsUser.username)
      await message.isSent('points.defaults.pointsResponse', { username: tinyPointsUser.username }, {
        amount: 100,
        username: tinyPointsUser.username,
        pointsName: await global.systems.points.getPointsName(100)
      })
    })
  })
})
