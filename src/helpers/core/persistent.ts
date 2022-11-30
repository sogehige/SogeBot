import { Settings } from '@entity/settings';
import DeepProxy from 'proxy-deep';
import { EntityNotFoundError } from 'typeorm';
import { AppDataSource } from '~/database';

import { IsLoadingInProgress, toggleLoadingInProgress } from '../../decorators';
import { isDbConnected } from '../database';
import { debug } from '../log';
import { setImmediateAwait } from '../setImmediateAwait';

function persistent<T>({ value, name, namespace, onChange }: { value: T, name: string, namespace: string, onChange?: (cur: T) => void }) {
  const sym = Symbol(name);

  const proxy = new DeepProxy({ __loaded__: false, value }, {
    get(target, prop, receiver) {
      if (['toJSON', 'constructor'].includes(String(prop))) {
        return JSON.stringify(target.value);
      }

      if (prop === '__loaded__'
        || typeof prop === 'symbol'
        || typeof (target as any)[prop] === 'function') {
        return Reflect.get(target, prop, receiver);
      }

      try {
        const val = Reflect.get(target, prop, receiver);
        if (typeof val === 'object' && val !== null) {
          return this.nest(val);
        } else {
          return val;
        }
      } catch (e: any) {
        console.log(e);
        return undefined;
      }
    },
    set(target, prop, receiver) {
      if (IsLoadingInProgress(sym) || prop === '__loaded__') {
        return Reflect.set(target, prop, receiver);
      }
      setImmediate(() => save());
      return Reflect.set(target, prop, receiver);
    },
  });

  toggleLoadingInProgress(sym);

  async function save() {
    if (onChange) {
      onChange(proxy.value);
    }
    debug('persistent.set', `Updating ${namespace}/${name}`);
    debug('persistent.set', proxy.value);
    AppDataSource.getRepository(Settings).findOneBy({ namespace, name })
      .then((row) => {
        AppDataSource.getRepository(Settings).save({ id: row?.id, namespace, name, value: JSON.stringify(proxy.value) }).then(() => {
          debug('persistent.set', `Update done on ${namespace}/${name}`);
        });
      });
  }

  async function load() {
    if (!isDbConnected) {
      setInterval(() => load(), 5000);
      return;
    }

    try {
      debug('persistent.load', `Loading ${namespace}/${name}`);
      proxy.value = JSON.parse(
        (await AppDataSource.getRepository(Settings).findOneByOrFail({ namespace, name })).value,
      );
    } catch (e: any) {
      debug('persistent.load', `Data not found, using default value`);
      proxy.value = value;
    } finally {
      toggleLoadingInProgress(sym);
      proxy.__loaded__ = true;
      debug('persistent.load', `Load done ${namespace}/${name}`);
      debug('persistent.load', JSON.stringify(proxy.value, null, 2));
    }
  }
  load();

  return proxy;
}

export { persistent };