import { Variable, VariableInterface } from '@entity/variable';
import { isNil } from 'lodash';
import { AppDataSource } from '~/database';

import users from '../../users';
import { warning } from '../log';
import {
  get, getUserHighestPermission,
} from '../permissions';
import { defaultPermissions } from '../permissions/';
import { check } from '../permissions/';
import { addChangeToHistory } from './addChangeToHistory';
import { csEmitter } from './emitter';
import { getValueOf } from './getValueOf';
import { updateWidgetAndTitle } from './updateWidgetAndTitle';

async function setValueOf (variable: string | Readonly<VariableInterface>, currentValue: any, opts: any): Promise<{ updated: Readonly<VariableInterface>; isOk: boolean; setValue: string; isEval: boolean }> {
  const item = typeof variable === 'string'
    ? await AppDataSource.getRepository(Variable).findOneBy({ variableName: variable })
    : { ...variable };
  let isOk = true;
  let isEval = false;
  const itemOldValue = item?.currentValue;
  let itemCurrentValue = item?.currentValue;

  opts.sender = isNil(opts.sender) ? null : opts.sender;
  opts.readOnlyBypass = isNil(opts.readOnlyBypass) ? false : opts.readOnlyBypass;
  // add simple text variable, if not existing
  if (!item) {
    const newItem: VariableInterface = {
      variableName:  variable as string,
      currentValue:  String(currentValue),
      responseType:  0,
      evalValue:     '',
      description:   '',
      responseText:  '',
      usableOptions: [],
      type:          'text',
      permission:    defaultPermissions.MODERATORS,
    };
    return setValueOf(newItem, currentValue, opts);
  } else {
    if (typeof opts.sender === 'string') {
      opts.sender = {
        userName: opts.sender,
        userId:   await users.getIdByName(opts.sender),
        source:   'twitch',
      };
    }
    const permissionsAreValid = isNil(opts.sender) || (await check(opts.sender.userId, item.permission, false)).access;
    if ((item.readOnly && !opts.readOnlyBypass) || !permissionsAreValid) {
      const highestPermission = await getUserHighestPermission(opts.sender.userId);
      if (highestPermission) {
        const userPermission = await get(highestPermission);
        const variablePermission = await get(item.permission);
        if (userPermission && variablePermission) {
          warning(`User ${opts.sender.userName}#${opts.sender.userId}(${userPermission.name}) doesn't have permission to change variable ${item.variableName}(${variablePermission.name})`);
        }
      }
      isOk = false;
    } else {
      if (item.type === 'number') {
        const match = /(?<sign>[+-])([ ]*)?(?<number>\d*)?/g.exec(currentValue);
        if (match && match.groups) {
          const number = Number((match.groups.number || 1));
          if (match.groups.sign === '+') {
            itemCurrentValue = String(Number(itemCurrentValue) + number);
          } else if (match.groups.sign === '-') {
            itemCurrentValue = String(Number(itemCurrentValue) - number);
          }
        } else {
          const isNumber = isFinite(Number(currentValue));
          isOk = isNumber;
          // we need to retype to get rid of +/-
          itemCurrentValue = isNumber ? String(Number(currentValue)) : String(Number(itemCurrentValue));
        }
      } else if (item.type === 'options') {
        // check if is in usableOptions
        const isUsableOption = item.usableOptions.map((o) => o.trim()).includes(currentValue);
        isOk = isUsableOption;
        itemCurrentValue = isUsableOption ? currentValue : itemCurrentValue;
      } else if (item.type === 'eval') {
        opts.param = currentValue;
        itemCurrentValue = await getValueOf(item.variableName, opts);
        isEval = true;
      } else if (item.type === 'text') {
        itemCurrentValue = String(currentValue);
        isOk = true;
      }
    }
  }

  // do update only on non-eval variables
  if (item.type !== 'eval' && isOk) {
    await AppDataSource.getRepository(Variable).save({
      ...item,
      currentValue: itemCurrentValue,
    });
  }

  const setValue = itemCurrentValue ?? '';
  if (isOk) {
    updateWidgetAndTitle(item.variableName);
    csEmitter.emit('variable-changed', item.variableName);
    if (!isEval) {
      addChangeToHistory({
        sender: opts.sender, item, oldValue: itemOldValue,
      });
    }
  }
  return {
    updated: {
      ...item,
      currentValue: isOk && !isEval ? '' : setValue, // be silent if parsed correctly eval
    }, setValue, isOk, isEval,
  };
}

export { setValueOf };