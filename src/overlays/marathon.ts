import { SECOND } from '@sogebot/ui-helpers/constants';
import { getRepository } from 'typeorm';

import {
  OverlayMapper, OverlayMapperGroup, OverlayMapperMarathon,
} from '../database/entity/overlay.js';
import { onStartup } from '../decorators/on.js';
import { eventEmitter } from '../helpers/events/emitter.js';
import { adminEndpoint } from '../helpers/socket';
import Overlay from './_interface';

const cachedOverlays = new Map<string, Required<OverlayMapperGroup['opts']['items'][number] | OverlayMapperMarathon>>();

class Marathon extends Overlay {
  @onStartup()
  events() {
    setInterval(() => {
      console.log('trigger sub');
      eventEmitter.emit('subscription', {
        username: 'test', method: 'aaa', subCumulativeMonths: 0, tier: 'Prime',
      });
    }, 10 * SECOND);

    eventEmitter.on('subscription', async (data) => {
      await this.updateCache();
      for (const [id, value] of cachedOverlays.entries()) {
        if (value.opts.endTime < Date.now()
          && !value.opts.disableWhenReachedZero
          && Date.now() < value.opts.maxEndTime) {
          value.opts.endTime = Date.now(); // reset endTime
        } else if (value.opts.endTime < Date.now()) {
          console.log('disabled');
          return;
        }

        let tier = Number(data.tier);
        if (isNaN(tier)) {
          tier = 1;
        }
        const timeToAdd = value.opts.values.sub[`tier${tier}`];
        value.opts.endTime = Math.min(value.opts.endTime + timeToAdd, value.opts.maxEndTime);
        cachedOverlays.set(id, value);
      }
      await this.flushCache();
    });
    eventEmitter.on('resub', async (data) => {
      await this.updateCache();
      for (const [id, value] of cachedOverlays.entries()) {
        if (value.opts.endTime < Date.now()
          && !value.opts.disableWhenReachedZero
          && Date.now() < value.opts.maxEndTime) {
          value.opts.endTime = Date.now(); // reset endTime
        } else if (value.opts.endTime < Date.now()) {
          return;
        }

        let tier = Number(data.tier);
        if (isNaN(tier)) {
          tier = 1;
        }
        const timeToAdd = value.opts.values.resub[`tier${tier}`];
        value.opts.endTime = Math.min(value.opts.endTime + timeToAdd, value.opts.maxEndTime);
        cachedOverlays.set(id, value);
      }
      await this.flushCache();
    });
    eventEmitter.on('cheer', async (data) => {
      await this.updateCache();
      for (const [id, value] of cachedOverlays.entries()) {
        if (value.opts.endTime < Date.now()
          && !value.opts.disableWhenReachedZero
          && Date.now() < value.opts.maxEndTime) {
          value.opts.endTime = Date.now(); // reset endTime
        } else if (value.opts.endTime < Date.now()) {
          return;
        }

        // how much time to add
        let multiplier = data.bits / value.opts.values.bits.bits;
        if (!value.opts.values.bits.addFraction) {
          multiplier = Math.floor(multiplier);
        }
        const timeToAdd = value.opts.values.bits.time * multiplier;
        value.opts.endTime = Math.min(value.opts.endTime + timeToAdd, value.opts.maxEndTime);
        cachedOverlays.set(id, value);
      }
      await this.flushCache();
    });
    eventEmitter.on('tip', async (data) => {
      await this.updateCache();
      for (const [id, value] of cachedOverlays.entries()) {
        if (value.opts.endTime < Date.now()
          && !value.opts.disableWhenReachedZero
          && Date.now() < value.opts.maxEndTime) {
          value.opts.endTime = Date.now(); // reset endTime
        } else if (value.opts.endTime < Date.now()) {
          return;
        }

        // how much time to add
        let multiplier = Number(data.amountInBotCurrency) / value.opts.values.tips.tips;
        if (!value.opts.values.tips.addFraction) {
          multiplier = Math.floor(multiplier);
        }
        const timeToAdd = value.opts.values.tips.time * multiplier;
        value.opts.endTime = Math.min(value.opts.endTime + timeToAdd, value.opts.maxEndTime);
        cachedOverlays.set(id, value);
      }
      await this.flushCache();
    });
  }

  async updateCache() {
    const ids = [];
    for (const overlay of await getRepository(OverlayMapper).find({ value: 'marathon' }) as OverlayMapperMarathon[]) {
      if (!cachedOverlays.has(overlay.id)) {
        cachedOverlays.set(overlay.id, overlay);
      }
      ids.push(overlay.id);
    }

    for (const overlay of (await getRepository(OverlayMapper).find({ value: 'group' }) as OverlayMapperGroup[])) {
      for(const item of overlay.opts.items.filter(o => o.type === 'marathon')) {
        cachedOverlays.set(`${overlay.id}|${item.id}`, item);
        ids.push(`${overlay.id}|${item.id}`);
      }
    }

    // cleanup ids which are not longer valid
    for (const id of cachedOverlays.keys()) {
      if (!ids.includes(id)) {
        cachedOverlays.delete(id);
      }
    }
  }

  async flushCache() {
    for (const [id, value] of cachedOverlays.entries()) {
      if (id.includes('|')) {
        // part of group
        const [groupId, itemId] = id.split('|');
        const group = await getRepository(OverlayMapper).findOne({ id: groupId }) as OverlayMapperGroup;
        if (group) {
          const idx = group.opts.items.findIndex(o => o.id === itemId);
          if (idx !== -1) {
            group.opts.items[idx] = value as Required<OverlayMapperGroup['opts']['items'][number]>;
            await getRepository(OverlayMapper).save(group);
          }
        }
      } else {
        // single overlay
        await getRepository(OverlayMapper).save(value);
      }
    }
  }

  sockets () {
    adminEndpoint(this.nsp, 'marathon::check', async (marathonId: string, cb) => {
      await this.updateCache();
      const key = Array.from(cachedOverlays.keys()).find(id => id.includes(marathonId));
      cb(null, cachedOverlays.get(key ?? ''));
    });
    adminEndpoint(this.nsp, 'marathon::update::set', async (data: { time: number, id: string }) => {
      await this.updateCache();
      const key = Array.from(cachedOverlays.keys()).find(id => id.includes(data.id));
      const item = cachedOverlays.get(key ?? '');
      if (item) {
        item.opts.endTime = Math.min(item.opts.endTime + data.time, item.opts.maxEndTime);
        cachedOverlays.set(key ?? '', item);
      }
    });
  }
}

export default new Marathon();
