class Interface {
  /**
   * Asynchronous find several results on db
   * @param {string} table table to search
   * @param {object} where object to find in format {'toFind': 'value', _sort, _total, _sum, _group} - example {'id': 'soge__'}
   * @returns {object} results
   */
  async find (table, where) {
    throw Error('function find() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous find one result on db
   * @param {string} table table to search
   * @param {object} where object to find in format {'toFind': 'value'} - example {'id': 'soge__'}
   * @returns {object} exactly one result
   */
  async findOne (table, where) {
    throw Error('function findOne() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous insert object into db
   * @param {string} table table to search
   * @param {object} object object to insert
   * @returns {object} created object
   */
  async insert (table, object) {
    throw Error('function insert() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous remove objects on db
   * @param {string} table table to search
   * @param {object} where object to find in format {'toFind': 'value'} - example {'id': 'soge__'}
   * @returns {object} no. of results deleted
   */
  async remove (table, where) {
    throw Error('function remove() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous update of object in db
   * @param {string} table table of object to update
   * @param {string} where object to search update
   * @param {object} object object data to update
   * @returns {object} no. of results updated
   */
  async update (table, where, object) {
    throw Error('function update() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous increment update of object in db
   * @param {string} table table of object to update
   * @param {string} where object to search update
   * @param {object} object object data to update
   * @returns {object} no. of results updated
   */
  async increment (table, where, object) {
    throw Error('function increment() is not implemented in ' + this.constructor.name)
  }

  /**
   * Asynchronous increment update of one object in db
   * @param {string} table table of object to update
   * @param {string} where object to search update
   * @param {object} object object data to update
   * @returns {object} no. of results updated
   */
  async incrementOne (table, where, object) {
    throw Error('function incrementOne() is not implemented in ' + this.constructor.name)
  }

  /**
   * Sets up index of table
   * note: Indexes should be set only at start on master
   * @param {object} opts options for indexing
   * @param {string} opts.table table for indexing
   * @param {string} opts.index index column
   * @param {boolean} opts.unique index should be unique
   */
  async index (opts) {
    throw Error('function index() is not implemented in ' + this.constructor.name)
  }

  /**
   * Count table
   * note: Indexes should be set only at start on master
   * @param {string} table table for count
   */
  async count (table) {
    throw Error('function count() is not implemented in ' + this.constructor.name)
  }
}

module.exports = Interface
