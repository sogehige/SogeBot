const client = require('mongodb').MongoClient
const ObjectID = require('mongodb').ObjectID
const mongodbUri = require('mongodb-uri')

const Interface = require('./interface')
const config = require('@config')
const flatten = require('flat')
const cluster = require('cluster')

const _ = require('lodash')

class IMongoDB extends Interface {
  constructor (forceIndexes, forceRemoveIndexes) {
    super('mongodb')

    this.createIndexes = (forceIndexes && cluster.isMaster)
    this.forceRemoveIndexes = forceRemoveIndexes || false

    this.connected = false
    this.client = null
    this.dbName = mongodbUri.parse(config.database.mongodb.url).database

    this.connect()
  }

  async index (opts) {
    opts.unique = opts.unique || false
    if (!opts.index) throw new Error('Missing index option')
    if (!opts.table) throw new Error('Missing table option')

    try {
      if (!this.connected) throw new Error('Not connected yet')
      let db = await this.client.db(this.dbName)
      await db.createCollection(opts.table)
      await db.collection(opts.table).dropIndexes()
      await db.collection(opts.table).createIndex(opts.index, { unique: opts.unique })
      return
    } catch (e) {
      // indexes will be created when collection is available
      setTimeout(() => this.index(opts), 5000)
    }
  }

  async connect () {
    this.client = await client.connect(config.database.mongodb.url,
      {
        poolSize: _.get(config, 'database.mongodb.poolSize', 5),
        useNewUrlParser: true,
        reconnectTries: Number.MAX_VALUE,
        connectTimeoutMS: 60000
      })

    // create indexes
    let db = await this.client.db(this.dbName)

    if (this.createIndexes || this.forceRemoveIndexes) {
      const collections = await db.listCollections().toArray()
      const dropIndexes = [
        'users.bits', 'users.tips', 'users.points', 'users.online', 'users.messages', 'users.watched',
        'cache', 'customTranslations', 'users', 'stats'
      ]
      for (let table of dropIndexes) {
        if (_.find(collections, (o) => o.name === table)) await db.collection(table).dropIndexes()
        await db.createCollection(table)
      }

      if (this.createIndexes) {
        await db.collection('users.bits').createIndex('timestamp')
        await db.collection('users.tips').createIndex('timestamp')
        await db.collection('users').createIndex('username', { unique: true })
        await db.collection('users').createIndex(
          { id: 1 },
          { partialFilterExpression: { id: { $exists: true } }, unique: true }
        )
        await db.collection('users.online').createIndex('username')
        await db.collection('users.points').createIndex('username')
        await db.collection('users.messages').createIndex('username')
        await db.collection('users.watched').createIndex('username')
        await db.collection('cache').createIndex('key', { unique: true })
        await db.collection('customTranslations').createIndex('key')
        await db.collection('stats').createIndex('whenOnline')
        await db.collection('cache.hosts').createIndex('username', { unique: true })
      }
    }
    this.connected = true
  }

  async find (table, where) {
    where = where || {}
    if (!_.isNil(where._id)) {
      let regexp = new RegExp('^[0-9a-fA-F]{24}$')
      if (regexp.test(where._id)) where._id = new ObjectID(where._id)
      else return {}
    }

    const sortBy = where._sort || '_id'
    const sumBy = where._sum || undefined
    const groupBy = where._group || undefined
    const total = where._total || undefined

    delete where._sort; delete where._sum; delete where._total; delete where._group
    try {
      let db = this.client.db(this.dbName)
      let items
      const order = sortBy.startsWith('-') ? 1 : -1

      if (!sumBy || !groupBy) {
        if (sortBy !== '_id') {
          where[sortBy.replace('-', '')] = { $exists: true, $ne: order === 1 ? 0 : null }
        }
        items = await db.collection(table).find(where).sort({ [sortBy.replace('-', '')]: order }).limit(Number(total))
      } else {
        const group = { _id: `$${groupBy}`, [sumBy]: { $sum: `$${sumBy}` } }
        items = await db.collection(table).aggregate([{ $group: group }]).sort({ [sortBy.replace('-', '')]: order }).limit(Number(total))
      }
      return items.toArray()
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async findOne (table, where) {
    where = where || {}
    if (!_.isNil(where._id)) {
      let regexp = new RegExp('^[0-9a-fA-F]{24}$')
      if (regexp.test(where._id)) where._id = new ObjectID(where._id)
      else return {}
    } else where = flatten(where)

    try {
      let db = this.client.db(this.dbName)
      let item = await db.collection(table).findOne(where)
      return item || {}
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async insert (table, object) {
    object = _.clone(object)
    delete object._id
    if (_.isEmpty(object)) throw Error('Object cannot be empty')

    try {
      let db = this.client.db(this.dbName)
      if (_.isArray(object)) await db.collection(table).insertMany(object)
      let item = await db.collection(table).insertOne(flatten.unflatten(object))
      return item.ops[0]
    } catch (e) {
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async incrementOne (table, where, object) {
    where = where || {}
    if (!_.isNil(where._id)) where._id = new ObjectID(where._id)
    else where = flatten(where)

    if (_.isEmpty(object)) throw Error('Object to update cannot be empty')
    delete object._id

    try {
      let db = this.client.db(this.dbName)
      let item = await db.collection(table).findAndModify(
        where,
        { _id: 1 },
        // DON'T EVER DELETE flatten ON OBJECT - with flatten object get updated and not replaced
        { $inc: flatten(object) },
        { new: true } // will return updated item
      )
      return item.value
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async increment (table, where, object) {
    where = where || {}
    if (!_.isNil(where._id)) where._id = new ObjectID(where._id)
    else where = flatten(where)

    if (_.isEmpty(object)) throw Error('Object to update cannot be empty')
    delete object._id

    try {
      let db = this.client.db(this.dbName)

      await db.collection(table).updateOne(
        where,
        // DON'T EVER DELETE flatten ON OBJECT - with flatten object get updated and not replaced
        { $inc: flatten(object) }, {
          upsert: true,
          multi: _.isEmpty(where)
        }
      )

      // workaround for return of updated objects
      let items = await db.collection(table).find(where).toArray()
      return items
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async remove (table, where) {
    if (!_.isNil(where._id)) where._id = new ObjectID(where._id)
    else where = flatten(where)

    try {
      let db = this.client.db(this.dbName)
      let result = await db.collection(table).deleteMany(where)
      return result.result.n
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }

  async update (table, where, object) {
    if (_.isEmpty(object)) throw Error('Object to update cannot be empty')

    if (!_.isNil(where._id)) where._id = new ObjectID(where._id)
    else where = flatten(where)

    // remove _id from object
    delete object._id
    try {
      let db = this.client.db(this.dbName)

      if (_.size(where) === 0) {
        // DON'T EVER DELETE flatten ON OBJECT - with flatten object get updated and not replaced
        await db.collection(table).updateMany({}, { $set: flatten(object, { safe: true }) })
      } else {
        await db.collection(table).updateOne(
          where,
          // DON'T EVER DELETE flatten ON OBJECT - with flatten object get updated and not replaced
          { $set: flatten(object, { safe: true }) }, {
            upsert: _.isNil(where._id)
          }
        )
      }

      // workaround for return of updated objects
      let items = await db.collection(table).find(where).toArray()
      return items.length === 1 ? items[0] : items
    } catch (e) {
      if (e.message.startsWith('E11000 duplicate key error collection')) {
        // this often means that update was too fast...re-do after io
        setImmediate(() => this.update(table, where, object))
      } else if (e.message.match(/EPIPE/g)) {
        global.log.error(e.stack)
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      } else {
        global.log.error(e.stack)
      }
    }
  }

  async count (table) {
    try {
      let db = this.client.db(this.dbName)
      return db.collection(table).countDocuments()
    } catch (e) {
      global.log.error(e.stack)
      if (e.message.match(/EPIPE/g)) {
        global.log.error('Something went wrong with mongodb instance (EPIPE error)')
        process.exit()
      }
    }
  }
}

module.exports = IMongoDB
