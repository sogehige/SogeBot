import { getRepository } from 'typeorm';

import { Settings } from '../../database/entity/settings';
import { isDbConnected } from '../database';

let _value = '';

const channelId = {
  set value(value: typeof _value) {
    _value = value;
    getRepository(Settings).findOne({
      namespace: '/core/oauth', name: 'channelId',
    }).then(row => {
      getRepository(Settings).save({
        ...row, namespace: '/core/oauth', name: 'channelId', value: JSON.stringify(value),
      });
    });
  },
  get value() {
    return _value;
  },
};

async function load() {
  if (!isDbConnected) {
    setTimeout(() => load(), 1000);
    return;
  }

  try {
    _value = JSON.parse(
      (await getRepository(Settings).findOneOrFail({
        namespace: '/core/oauth', name: 'channelId',
      })).value
    );
  } catch (e) {
    // ignore if nothing was found
  }
}

load();

export { channelId };