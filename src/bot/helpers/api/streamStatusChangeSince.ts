import { getRepository } from 'typeorm';

import { Settings } from '../../database/entity/settings';
import { isDbConnected } from '../database';

let _value = Date.now();

const streamStatusChangeSince = {
  set value(value: typeof _value) {
    _value = value;
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
    streamStatusChangeSince.value = JSON.parse(
      (await getRepository(Settings).findOneOrFail({
        namespace: '/core/api', name: 'streamStatusChangeSince',
      })).value
    );
  } catch (e) {
    // ignore if nothing was found
  }
}

load();

export { streamStatusChangeSince };