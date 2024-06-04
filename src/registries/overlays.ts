import { Request } from 'express';

import Registry from './_interface.js';
import { Message } from  '../message.js';

import { Goal, Overlay } from '~/database/entity/overlay.js';
import { AppDataSource } from '~/database.js';
import { Delete, Get, Post } from '~/decorators/endpoint.js';
import { stats } from '~/helpers/api/index.js';
import { SECOND } from '~/helpers/constants.js';
import { executeVariablesInText } from '~/helpers/customvariables/executeVariablesInText.js';
import { isBotStarted } from '~/helpers/database.js';
import defaultValues from '~/helpers/overlaysDefaultValues.js';

const ticks: string[] = [];

setInterval(async () => {
  if (!isBotStarted) {
    return;
  }

  while(ticks.length > 0) {
    let id = ticks.shift() as string;
    let groupId = '';
    let time: number | string = 1000;
    if (id.includes('|')) {
      [groupId, id, time] = id.split('|');
    }
    // check if it is without group
    const overlay = await AppDataSource.getRepository(Overlay).findOneBy({ id: groupId });
    if (overlay) {
      const item = overlay.items.find(o => o.id === id);
      if (item?.opts.typeId === 'countdown' || item?.opts.typeId === 'stopwatch') {
        item.opts.currentTime = Number(time);
        overlay.save();
      }
    }
  }
}, SECOND * 1);

const updateGoalValues = (output: Overlay) => {
  // we need to set up current values for goals current
  for (const item_ of output.items) {
    if (item_.opts.typeId === 'goal') {
      for (const campaign of (item_.opts as Goal).campaigns) {
        if (campaign.type === 'currentFollowers') {
          campaign.currentAmount = stats.value.currentFollowers;
        }
        if (campaign.type === 'currentSubscribers') {
          campaign.currentAmount = stats.value.currentSubscribers;
        }
      }
    }
  }
  return output.items;
};

class Overlays extends Registry {
  constructor() {
    super();
    this.addMenu({
      category: 'registry', name: 'overlays', id: 'registry/overlays', this: null,
    });
  }

  @Get('/', { scope: 'public' })
  async getAll() {
    const items = await AppDataSource.getRepository(Overlay).find();
    return items.map(defaultValues) as Overlay[];
  }
  @Get('/:id', { scope: 'public' })
  async getById(req: Request) {
    const id = req.params.id;
    const item = await AppDataSource.getRepository(Overlay).findOneBy({ id });
    if (item) {
      const output = defaultValues(item);
      output.items = updateGoalValues(output);
      return output;
    } else {
      // try to find if id is part of group
      const items = await Overlay.find();
      for (const it of items) {
        if (it.items.map(o => o.id).includes(id)) {
          const output = defaultValues(it);
          output.items = updateGoalValues(output);
          return output;
        }
      }
      return null;
    }
  }

  @Delete('/:id')
  deleteById(req: Request) {
    const id = req.params.id;
    return AppDataSource.getRepository(Overlay).delete(id);
  }
  @Post('/')
  async save(req: Request) {
    return Overlay.create(req.body).save();
  }

  @Post('/parse', { scope: 'public' })
  async parse(req: Request) {
    return new Message(await executeVariablesInText(req.body.text, null)).parse();
  }

  @Post('/tick/:groupId/:id/:millis', { scope: 'public' })
  async tick(req: Request) {
    ticks.push(`${req.params.groupId}|${req.params.id}|${req.params.millis}`);
  }
}

export default new Overlays();
