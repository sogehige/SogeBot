import { Randomizer as RandomizerEntity } from '@entity/randomizer';
import { LOW } from '@sogebot/ui-helpers/constants';
import { AppDataSource } from '~/database';
import { v4 } from 'uuid';

import { parser } from '../decorators';
import Registry from './_interface';

import { check } from '~/helpers/permissions/index';
import { adminEndpoint, publicEndpoint } from '~/helpers/socket';

class Randomizer extends Registry {
  constructor() {
    super();
    this.addMenu({
      category: 'registry', name: 'randomizer', id: 'registry/randomizer/', this: null,
    });
  }

  sockets () {
    adminEndpoint('/registries/randomizer', 'generic::getAll', async (cb) => {
      cb(null, await AppDataSource.getRepository(RandomizerEntity).find());
    });
    publicEndpoint('/registries/randomizer', 'randomizer::getVisible', async (cb) => {
      cb(
        null,
        await AppDataSource.getRepository(RandomizerEntity).findOne({ where: { isShown: true }, relations: [ 'items'] })
      );
    });
    adminEndpoint('/registries/randomizer', 'randomizer::startSpin', async () => {
      const { default: tts, services } = await import ('../tts');
      let key = v4();
      if (tts.ready) {
        if (tts.service === services.RESPONSIVEVOICE) {
          key = tts.responsiveVoiceKey;
        }
        if (tts.service === services.GOOGLE) {
          tts.addSecureKey(key);
        }
      }
      this.socket?.emit('spin', {
        service: tts.service,
        key,
      });
    });
    adminEndpoint('/registries/randomizer', 'randomizer::showById', async (id, cb) => {
      try {
        await AppDataSource.getRepository(RandomizerEntity).update({}, { isShown: false });
        await AppDataSource.getRepository(RandomizerEntity).update({ id: String(id) }, { isShown: true });
        cb(null);
      } catch (e: any) {
        cb (e);
      }
    });
  }

  /**
   * Check if command is in randomizer (priority: low, fireAndForget)
   *
   * !<command> - hide/show randomizer
   *
   * !<command> go - spin up randomizer
   */
  @parser({ priority: LOW, fireAndForget: true })
  async run (opts: ParserOptions) {
    if (!opts.sender || !opts.message.startsWith('!')) {
      return true;
    } // do nothing if it is not a command

    const [command, subcommand] = opts.message.split(' ');

    const randomizer = await AppDataSource.getRepository(RandomizerEntity).findOneBy({ command });
    if (!randomizer) {
      return true;
    }

    // user doesn't have permision to use command
    if (!(await check(opts.sender.userId, randomizer.permissionId, false)).access) {
      return true;
    }

    if (!subcommand) {
      await AppDataSource.getRepository(RandomizerEntity).update({}, { isShown: false });
      await AppDataSource.getRepository(RandomizerEntity).update({ id: randomizer.id }, { isShown: !randomizer.isShown });
    } else if (subcommand === 'go') {
      if (!randomizer.isShown) {
        await AppDataSource.getRepository(RandomizerEntity).update({}, { isShown: false });
        await AppDataSource.getRepository(RandomizerEntity).update({ id: randomizer.id }, { isShown: !randomizer.isShown });
        setTimeout(() => {
          this.socket?.emit('spin');
        }, 5000);
      } else {
        this.socket?.emit('spin');
      }
    }

    return true;
  }
}

export default new Randomizer();
