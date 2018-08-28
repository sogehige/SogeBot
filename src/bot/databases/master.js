const _ = require('lodash')
const cluster = require('cluster')
const crypto = require('crypto')
const debug = require('debug')
const util = require('util')
const Timeout = require('../timeout')

const Interface = require('./interface')

const DEBUG_MASTER_REQUEST_ID = debug('db:master:request:id')
const DEBUG_MASTER_INCOMING = debug('db:master:incoming')
const DEBUG_MASTER = debug('db:master')
class IMasterController extends Interface {
  constructor () {
    super('master')

    cluster.on('message', (worker, message) => {
      if (message.type !== 'db') return
      DEBUG_MASTER_INCOMING(`Got data from Worker#${worker.id}\n${util.inspect(message)}`)
      this.data.push({
        id: message.id,
        items: message.items,
        timestamp: _.now()
      })
    })

    this.connected = false
    this.data = []

    this.connect()
  }

  async connect () {
    let allOnline = true
    for (let worker in cluster.workers) {
      if (!cluster.workers[worker].isConnected()) {
        allOnline = false
        break
      }
    }
    if (!(await this.checkConnection()) || !allOnline) return setTimeout(() => this.connect(), 1000) // re-do on first error
    else this.connected = allOnline
  }

  async checkConnection () {
    let timeout = new Promise((resolve, reject) => {
      let id = setTimeout(() => {
        clearTimeout(id)
        DEBUG_MASTER('Connection to db timeouted')
        resolve(false)
      }, 5000)
    })
    return Promise.race([
      this.find('info'),
      timeout
    ])
  }

  sendRequest (resolve, reject, id, data) {
    const timeout = new Timeout()
    try {
      timeout.clear(`sendRequest-${id}`)
      const worker = _.sample(cluster.workers)
      if (!worker.isConnected()) throw new Error('Worker is not connected')
      worker.send(data)
      DEBUG_MASTER_REQUEST_ID(id)
      this.returnData(resolve, reject, id)
    } catch (e) {
      timeout.recursive({ uid: `sendRequest-${id}`, this: this, args: [resolve, reject, id], fnc: this.sendRequest, wait: 10 })
    }
  }

  returnData (resolve, reject, id) {
    const timeout = new Timeout()
    let dataFromWorker = _.find(this.data, (o) => o.id === id)
    if (!_.isNil(dataFromWorker)) {
      const items = dataFromWorker.items
      _.remove(this.data, (o) => o.id === id)
      timeout.clear(`returnData-${id}`)
      resolve(items)
    } else timeout.recursive({ uid: `returnData-${id}`, this: this, args: [resolve, reject, id], fnc: this.returnData, wait: 10 })
  }

  async find (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'find', table: table, where: where, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async findOne (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'findOne', table: table, where: where, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async insert (table, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'insert', table: table, object: object, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async remove (table, where) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'remove', table: table, where: where, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async update (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'update', table: table, where: where, object: object, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async incrementOne (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'incrementOne', table: table, where: where, object: object, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async increment (table, where, object) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'increment', table: table, where: where, object: object, id: id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }

  async index (opts) {
    const id = crypto.randomBytes(64).toString('hex')
    const data = { type: 'db', fnc: 'index', opts, id }

    return new Promise((resolve, reject) => {
      this.sendRequest(resolve, reject, id, data)
    })
  }
}

module.exports = IMasterController
