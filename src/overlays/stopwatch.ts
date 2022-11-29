import { OverlayMapper } from '@entity/overlay.js';
import { MINUTE, SECOND } from '@sogebot/ui-helpers/constants';
import { AppDataSource } from '~/database';
import { app } from '~/helpers/panel';

import Overlay from './_interface';

import { adminEndpoint, publicEndpoint } from '~/helpers/socket';
import { adminMiddleware } from '~/socket';

const checks = new Map<string, { timestamp: number; isEnabled: boolean; time: number; }>();
const statusUpdate = new Map<string, { timestamp: number; isEnabled: boolean | null; time: number | null; }>();

setInterval(() => {
  // remove all checks and statusUpdate if last data were 10 minutes long
  for (const key of checks.keys()) {
    if (Date.now() - (checks.get(key)?.timestamp ?? 0) > 10 * MINUTE) {
      checks.delete(key);
    }
  }
  for (const key of statusUpdate.keys()) {
    if (Date.now() - (statusUpdate.get(key)?.timestamp ?? 0) > 10 * MINUTE) {
      statusUpdate.delete(key);
    }
  }
}, 30 * SECOND);

class Stopwatch extends Overlay {
  sockets () {
    if (!app) {
      setTimeout(() => this.sockets(), 100);
      return;
    }

    app.post('/api/overlays/stopwatch/:id/:operation', adminMiddleware, async (req, res) => {
      const check = checks.get(req.params.id);
      const operationEnableList = {
        stop:         false,
        start:        true,
        toggle:       !check?.isEnabled,
        resetAndStop: false,
      };

      statusUpdate.set(req.params.id, {
        isEnabled: operationEnableList[req.params.operation as keyof typeof operationEnableList] ?? null,
        time:      req.params.operation.includes('reset') ? 0 : check?.time ?? 0,
        timestamp: Date.now(),
      });

      res.status(204).send();
    });

    publicEndpoint('/overlays/stopwatch', 'stopwatch::update', async (data: { id: string, isEnabled: boolean, time: number }, cb) => {
      const update = {
        timestamp: Date.now(),
        isEnabled: data.isEnabled,
        time:      data.time,
      };

      const update2 = statusUpdate.get(data.id);
      if (update2) {
        if (update2.isEnabled !== null) {
          update.isEnabled = update2.isEnabled;
        }
        if (update2.time !== null) {
          update.time = update2.time;
        }
      }

      checks.set(data.id, update);
      cb(null, statusUpdate.get(data.id));
      statusUpdate.delete(data.id);

      // we need to check if persistent
      const overlay = await AppDataSource.getRepository(OverlayMapper).findOneBy({ id: data.id });
      if (overlay && overlay.value === 'stopwatch') {
        if (overlay.opts && overlay.opts.isPersistent) {
          await AppDataSource.getRepository(OverlayMapper).update(data.id, {
            opts: {
              ...overlay.opts,
              currentTime: data.time,
            },
          });
        }
      }
    });
    adminEndpoint('/overlays/stopwatch', 'stopwatch::check', async (stopwatchId: string, cb) => {
      const update = checks.get(stopwatchId);
      if (update) {
        const update2 = statusUpdate.get(stopwatchId);
        if (update2) {
          if (update2.isEnabled !== null) {
            update.isEnabled = update2.isEnabled;
          }
          if (update2.time !== null) {
            update.time = update2.time;
          }
        }
        cb(null, update);
      } else {
        cb(null, undefined);
      }
    });
    adminEndpoint('/overlays/stopwatch', 'stopwatch::update::set', async (data: { id: string, isEnabled: boolean | null, time: number | null }) => {
      statusUpdate.set(data.id, {
        isEnabled: data.isEnabled,
        time:      data.time,
        timestamp: Date.now(),
      });
    });
  }
}

export default new Stopwatch();
