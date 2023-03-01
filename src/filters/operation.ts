import events from '../events';
import { info } from '../helpers/log';

import type { ResponseFilter } from '.';

import { AppDataSource } from '~/database';
import { Price } from '~/database/entity/price';
import alerts from '~/registries/alerts';

export const operation: ResponseFilter = {
  '$triggerOperation(#)': async function (filter: string, attributes) {
    const countRegex = new RegExp('\\$triggerOperation\\((?<id>\\S*)\\)', 'gm');
    const match = countRegex.exec(filter);
    if (match && match.groups) {
      info(`Triggering event ${match.groups.id} by command ${attributes.command}`);
      await events.fire(match.groups.id, { userId: attributes.sender.userId, username: attributes.sender.userName, isTriggeredByCommand: attributes.command });
    }
    return '';
  },
  '$triggerAlert(#)': async function (filter: string, attributes) {
    const countRegex = new RegExp('\\$triggerAlert\\((?<id>\\S*)\\)', 'gm');
    const match = countRegex.exec(filter);
    if (match && match.groups) {
      info(`Triggering alert ${match.groups.id} by command ${attributes.command}`);

      const price = await AppDataSource.getRepository(Price).findOneBy({ command: attributes.command, enabled: true });

      await alerts.trigger({
        amount:     price ? price.price : 0,
        currency:   'CZK',
        event:      'custom',
        alertId:    match.groups.id,
        message:    attributes.param || '',
        monthsName: '',
        name:       attributes.command,
        tier:       null,
        recipient:  attributes.sender.userName,
      });
    }
    return '';
  },
};