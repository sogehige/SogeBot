require('../../general.js');

const assert = require('assert');

const shortid = require('shortid');
const { getRepository } = require('typeorm');

const { Gallery } = require('../../../dest/database/entity/gallery');
const db = require('../../general.js').db;

const id = shortid.generate();

describe('Gallery - #4969 - id can be shortid - @func3', () => {
  beforeEach(async () => {
    await db.cleanup();
  });

  it(`Save pseudo-file with shortid`, async () => {
    await getRepository(Gallery).save({
      id, type: '', data: '', name: 'unknown',
    });
  });

  it(`Pseudo-file should exist in db`, async () => {
    const count = await getRepository(Gallery).count({ id });
    assert.strictEqual(count, 1);
  });
});
