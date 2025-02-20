import { EventList as EventListDB } from '@entity/eventList.js';
import type { EmitData } from '@entity/overlay.js';
import { UserTip } from '@entity/user.js';
import { Request } from 'express';
import { Between, MoreThan } from 'typeorm';

import Widget from './_interface.js';
import alerts from '../registries/alerts.js';

import { AppDataSource } from '~/database.js';
import { Delete, Get, Post } from '~/decorators/endpoint.js';
import { SECOND } from '~/helpers/constants.js';
import { getLocalizedName } from '~/helpers/getLocalizedName.js';
import { error } from '~/helpers/log.js';
import getNameById from '~/helpers/user/getNameById.js';
import { translate } from '~/translations.js';

class EventList extends Widget {
  @Get('/')
  async getAll(req: Request) {
    // we need to get by count and/or timestamp
    const count = Number(req.query.count) || undefined;
    const timestamp = Number(req.query.timestamp) || 0;

    try {
      const events = await AppDataSource.getRepository(EventListDB).find({
        where: { isHidden: false, timestamp: timestamp > 0 ? MoreThan(timestamp) : undefined },
        order: { timestamp: 'DESC' },
        take:  count,
      });
      // we need to change userId => username and from => from username for eventlist compatibility
      const mapping = new Map() as Map<string, string>;
      const tipMapping = new Map() as Map<string, number>;
      for (const event of events) {
        const values = JSON.parse(event.values_json);
        if (values.fromId && values.fromId != '0') {
          if (!mapping.has(values.fromId)) {
            try {
              mapping.set(values.fromId, await getNameById(values.fromId));
            } catch {
              event.isHidden = true; // hide event if user is unknown
              await AppDataSource.getRepository(EventListDB).save(event);
            }
          }
        }
        if (!event.userId.includes('__anonymous__')) {
          if (!mapping.has(event.userId)) {
            try {
              mapping.set(event.userId, await getNameById(event.userId));
            } catch {
              event.isHidden = true; // hide event if user is unknown
              await AppDataSource.getRepository(EventListDB).save(event);
            }
          }
        } else {
          mapping.set(event.userId, event.userId.replace('#__anonymous__', ''));
        }
        // pair tips so we have sortAmount to use in eventlist filter
        if (event.event === 'tip') {
          // search in DB for corresponding tip, unfortunately pre 13.0.0 timestamp won't exactly match (we are adding 10 seconds up/down)
          const tip = await AppDataSource.getRepository(UserTip).findOneBy({
            userId:   event.userId,
            tippedAt: Between(event.timestamp - (10 * SECOND), event.timestamp + (10 * SECOND)),
          });
          tipMapping.set(event.id, tip?.sortAmount ?? 0);
        }
      }
      return events
        .filter(o => !o.isHidden) // refilter as we might have new hidden events
        .map(event => {
          const values = JSON.parse(event.values_json);
          if (values.fromId && values.fromId != '0') {
            values.fromId = mapping.get(values.fromId);
          }
          return {
            ...event,
            username:    mapping.get(event.userId),
            sortAmount:  tipMapping.get(event.id),
            values_json: JSON.stringify(values),
          };
        });
    } catch (e: any) {
      return [];
    }

  }

  @Post('/', { action: 'skip' })
  async skip() {
    alerts.skip();
  }

  @Post('/:id', { action: 'resend' })
  async resend(req: Request) {
    const id = req.params.id;
    const event = await AppDataSource.getRepository(EventListDB).findOneBy({ id: String(id) });
    if (event) {
      const values = JSON.parse(event.values_json);
      switch(event.event) {
        case 'follow':
        case 'sub':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     0,
            tier:       String(values.tier) as EmitData['tier'],
            currency:   '',
            monthsName: '',
            message:    '' });
          break;
        case 'raid':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     Number(values.viewers),
            tier:       null,
            currency:   '',
            monthsName: '',
            message:    '' });
          break;
        case 'resub':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     Number(values.subCumulativeMonths),
            tier:       String(values.tier) as EmitData['tier'],
            currency:   '',
            monthsName: getLocalizedName(values.subCumulativeMonths, translate('core.months')),
            message:    values.message });
          break;
        case 'subgift':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(values.fromId),
            tier:       null,
            recipient:  await getNameById(event.userId),
            amount:     Number(values.months),
            monthsName: getLocalizedName(Number(values.months), translate('core.months')),
            currency:   '',
            message:    '' });
          break;
        case 'cheer':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     Number(values.bits),
            tier:       null,
            currency:   '',
            monthsName: '',
            message:    values.message });
          break;
        case 'subcommunitygift':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     Number(values.count),
            tier:       null,
            currency:   '',
            monthsName: '',
            message:    '' });
          break;
        case 'tip':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       await getNameById(event.userId),
            amount:     Number(values.amount),
            tier:       null,
            currency:   values.currency,
            monthsName: '',
            message:    values.message });
          break;
        case 'rewardredeem':
          alerts.trigger({ eventId:    null,
            event:      event.event,
            name:       values.titleOfReward,
            rewardId:   values.rewardId,
            amount:     0,
            tier:       null,
            currency:   '',
            monthsName: '',
            message:    values.message,
            recipient:  await getNameById(event.userId) });
          break;
        default:
          error(`event.event ${event.event} cannot be retriggered`);
      }

    } else {
      error(`Event ${id} not found.`);
    }
  }

  @Delete('/:id')
  async removeById(req: Request) {
    await AppDataSource.getRepository(EventListDB).update(req.params.id, { isHidden: true });
  }
}

export default new EventList();
