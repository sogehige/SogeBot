import { cloneDeep, get, isEqual } from 'lodash';
import { isMainThread } from './cluster';
import { error } from './helpers/log';
import { change } from './changelog';
import { getRepository } from 'typeorm';
import { Settings } from './database/entity/settings';
import { getFunctionList } from './decorators/on';
import { isDbConnected } from './helpers/database';
import { list } from './helpers/register';

const variables: {
  [x: string]: any;
} = {};
const readonly: {
  [x: string]: any;
} = {};

setInterval(() => {
  if (isDbConnected) {
    VariableWatcher.check();
  }
}, 1000);

export const VariableWatcher = {
  add(key: string, value: any, isReadOnly: boolean) {
    if (isReadOnly) {
      readonly[key] = cloneDeep(value);
    } else {
      variables[key] = cloneDeep(value);
    }
  },
  async check() {
    for (const k of Object.keys(variables)) {
      let checkedModule;

      if (k.startsWith('core')) {
        checkedModule = list('core').find(m => m.constructor.name.toLowerCase() === k.split('.')[1]);
      } else {
        checkedModule = list(k.split('.')[0]).find(m => m.constructor.name.toLowerCase() === k.split('.')[1]);
      }
      const variable = k.split('.').slice(2).join('.');
      const value = cloneDeep(get(checkedModule, variable, undefined));
      if (typeof value === 'undefined') {
        throw new Error('Value not found, check your code!!! ' + JSON.stringify({k, variable, value}));
      }
      if (!isEqual(value, variables[k])) {
        const [type, name, variable] = k.split('.');

        variables[k] = value;
        let self;
        if (type === 'core') {
          self = (require('./' + name)).default;
        } else {
          self = (require('./' + type + '/' + name)).default;
        }

        if (isMainThread && self) {
          const savedSetting = await getRepository(Settings).findOne({
            where: {
              name: variable,
              namespace: self.nsp,
            },
          });
          await getRepository(Settings).save({
            ...savedSetting,
            name: variable,
            namespace: self.nsp,
            value: JSON.stringify(value),
          });

          change(`${type}.${name}.${variable}`);
          for (const event of getFunctionList('change', type === 'core' ? `${name}.${variable}` : `${type}.${name}.${variable}`)) {
            if (typeof self[event.fName] === 'function') {
              self[event.fName](variable, cloneDeep(value));
            } else {
              error(`${event.fName}() is not function in ${self._name}/${self.constructor.name.toLowerCase()}`);
            }
          }
        }
      }
      for (const k of Object.keys(readonly)) {
        let checkedModule;

        if (k.startsWith('core')) {
          checkedModule = (require(`./${k.split('.')[1]}`)).default;
        } else {
          checkedModule = (require(`./${k.split('.')[0]}/${k.split('.')[1]}`)).default;
        }
        const variable = k.split('.').slice(2).join('.');
        const value = cloneDeep(get(checkedModule, variable, null));
        if (!isEqual(value, readonly[k])) {
          const [type, name, variable] = k.split('.');
          error(`Cannot change read-only variable, forcing initial value for ${type}.${name}.${variable}`);
          checkedModule[variable] = readonly[k];
        }
      }
    }
  },
};