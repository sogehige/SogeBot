import { cloneDeep, set } from 'lodash';
import DeepProxy from 'proxy-deep';
import { getManager, getRepository } from 'typeorm';

import { Settings } from '../../database/entity/settings';
import { IsLoadingInProgress, toggleLoadingInProgress } from '../../decorators';
import { isDbConnected } from '../database';
import { debug } from '../log';

function persistent<T>({ value, name, namespace, onChange }: { value: T, name: string, namespace: string, onChange?: (cur: T, old: T) => void }) {
  const sym = Symbol(name);

  const proxy = new DeepProxy({ __loaded__: false, value }, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val === 'object' && val !== null) {
        return this.nest(val);
      } else {
        return val;
      }
    },
    set(target, prop, receiver) {
      if (IsLoadingInProgress(sym) || prop === '__loaded__') {
        return Reflect.set(target, prop, receiver);
      }

      const oldObject = proxy.value;
      let newObject;
      if (typeof proxy.value === 'string' || typeof proxy.value === 'number' || proxy.value === null) {
        newObject = receiver;
      } else if (this.path.length === 0) {
        newObject = { ...proxy.value, ...receiver };
      } else {
        // remove first key (which is value)
        const [, ...path] = [...this.path, prop];
        newObject = set<T>(cloneDeep(proxy.value as any), path.join('.'), receiver);
      }
      if (onChange) {
        onChange(newObject, oldObject);
      }
      debug('persistent', `Updating ${namespace}/${name}`);
      debug('persistent', newObject);
      getRepository(Settings).update({ namespace, name }, { value: JSON.stringify(newObject) }).then(() => {
        debug('persistent', `Update done on ${namespace}/${name}`);
      });

      return Reflect.set(target, prop, receiver);
    },
  });

  toggleLoadingInProgress(sym);

  async function load() {
    if (!isDbConnected) {
      setImmediate(() => load());
      return;
    }

    try {
      debug('persistent', `Loading ${namespace}/${name}`);
      proxy.value = JSON.parse(
        (await getRepository(Settings).findOneOrFail({ namespace, name })).value,
      );
    } catch (e) {
      debug('persistent', `Data not found, creating ${namespace}/${name}`);
      await getManager().transaction(async transactionalEntityManager => {
        await transactionalEntityManager.delete(Settings, { name, namespace });
        await transactionalEntityManager.insert(Settings, {
          name, namespace, value: JSON.stringify(value),
        });
      });
    } finally {
      toggleLoadingInProgress(sym);
      proxy.__loaded__ = true;
      debug('persistent', `Load done ${namespace}/${name}`);
    }
  }
  load();

  return proxy;
}

export { persistent };