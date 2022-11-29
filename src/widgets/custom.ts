import { AppDataSource } from '~/database';

import { WidgetCustom } from '../database/entity/widget';
import Widget from './_interface';

import { adminEndpoint } from '~/helpers/socket';

class Custom extends Widget {
  public sockets() {
    adminEndpoint('/widgets/custom', 'generic::getAll', async (userId, cb) => {
      cb(null, await AppDataSource.getRepository(WidgetCustom).find({
        where: { userId },
        order: { name: 'DESC' },
      }));
    });
    adminEndpoint('/widgets/custom', 'generic::save', async (item, cb) => {
      cb(null, await AppDataSource.getRepository(WidgetCustom).save(item));
    });
    adminEndpoint('/widgets/custom', 'generic::deleteById', async (id, cb) => {
      await AppDataSource.getRepository(WidgetCustom).delete({ id });
      cb(null);
    });
  }
}

export default new Custom();
