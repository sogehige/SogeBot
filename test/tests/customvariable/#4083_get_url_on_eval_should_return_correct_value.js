const { defaultPermissions } = require ('../../../dest/helpers/permissions/defaultPermissions');

require('../../general.js');

import { db } from '../../general.js';
import { message } from '../../general.js';
const user = require('../../general.js').user;

import assert from 'assert';

const _ = require('lodash');
const axios = require('axios');

const { Variable } = require('../../../dest/database/entity/variable');

const { v4 } = require('uuid');

// stub
_.set(global, 'widgets.custom_variables.io.emit', function () {
  return;
});

describe('Custom Variable - #4083 - Get url on eval should return correct value - @func1', () => {
  before(async () => {
    await db.cleanup();
    await message.prepare();
    await user.prepare();
  });

  const urlId = v4();
  it(`Create eval $_variable to return Date.now()`, async () => {
    await (new Variable({
      variableName:  '$_variable',
      readOnly:      false,
      currentValue:  '0',
      type:          'eval',
      responseType:  2,
      permission:    defaultPermissions.MODERATORS,
      evalValue:     'return Date.now();',
      runEvery:      0,
      usableOptions: [],
      urls:          [{
        id:           urlId,
        GET:          true,
        POST:         true,
        showResponse: true,
      }],
    }).save());
  });

  it(`Fetch endpoint for value and check`, async () => {
    const now = Date.now();
    const response = await axios.get(`http://localhost:20000/customvariables/${urlId}`);
    console.log(JSON.stringify(response.data));
    assert(response.data.value > now && response.data.value < Date.now());
  });
});
