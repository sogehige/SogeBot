import { Price as PriceEntity } from '@entity/price.js';
import * as _ from 'lodash-es';

import System from './_interface.js';
import { parserReply } from '../commons.js';
import {
  command, default_permission, rollback,
} from '../decorators.js';
import { parser } from '../decorators.js';
import general from '../general.js';
import { Parser } from '../parser.js';

import { AppDataSource } from '~/database.js';
import { Delete, Get, Post } from '~/decorators/endpoint.js';
import { prepare } from '~/helpers/commons/index.js';
import { HIGH } from '~/helpers/constants.js';
import { format } from '~/helpers/number.js';
import defaultPermissions from '~/helpers/permissions/defaultPermissions.js';
import { getPointsName } from '~/helpers/points/index.js';
import * as changelog from '~/helpers/user/changelog.js';
import { isBroadcaster, isOwner } from '~/helpers/user/index.js';
import { translate } from '~/translate.js';

/*
 * !price                     - gets an info about price usage
 * !price set [cmd] [price]   - add notice with specified response
 * !price unset [cmd] [price] - add notice with specified response
 * !price list                - get list of notices
 * !price toggle [cmd]        - remove notice by id
 */

class Price extends System {
  public dependsOn = [ 'systems.points' ];

  constructor () {
    super();
    this.addMenu({
      category: 'commands', name: 'price', id: 'commands/price', this: this, scopeParent: this.scope(),
    });
  }

  ///////////////////////// <! API endpoints
  @Post('/')
  postOne(req: any) {
    return PriceEntity.create(req.body).save();
  }
  @Get('/')
  getAll() {
    return PriceEntity.find({ order: { price: 'ASC' } });
  }
  @Get('/:id')
  getOne(req: any) {
    return PriceEntity.findOneBy({ id: req.params.id });
  }
  @Delete('/:id')
  async deleteOne(req: any) {
    const al = await PriceEntity.findOneBy({ id: req.params.id });
    if (al) {
      await al.remove();
    }
  }
  ///////////////////////// API endpoints />

  @command('!price')
  @default_permission(defaultPermissions.CASTERS)
  main (opts: CommandOptions): CommandResponse[] {
    return [{ response: translate('core.usage') + ': !price set <cmd> <price> | !price unset <cmd> | !price list | !price toggle <cmd>', ...opts }];
  }

  @command('!price set')
  @default_permission(defaultPermissions.CASTERS)
  async set (opts: CommandOptions): Promise<CommandResponse[]> {
    const parsed = opts.parameters.match(/^(![\S]+) ([0-9]+)$/);

    if (_.isNil(parsed)) {
      const response = prepare('price.price-parse-failed');
      return [{ response, ...opts }];
    }

    const [cmd, argPrice] = parsed.slice(1);
    if (parseInt(argPrice, 10) === 0) {
      return this.unset(opts);
    }

    const price = await AppDataSource.getRepository(PriceEntity).save({
      ...(await AppDataSource.getRepository(PriceEntity).findOneBy({ command: cmd })),
      command: cmd, price: parseInt(argPrice, 10),
    });
    const response = prepare('price.price-was-set', {
      command: cmd, amount: format(general.numberFormat, 0)(Number(argPrice)), pointsName: getPointsName(price.price),
    });
    return [{ response, ...opts }];
  }

  @command('!price unset')
  @default_permission(defaultPermissions.CASTERS)
  async unset (opts: CommandOptions): Promise<CommandResponse[]> {
    const parsed = opts.parameters.match(/^(![\S]+)$/);

    if (_.isNil(parsed)) {
      const response = prepare('price.price-parse-failed');
      return [{ response, ...opts }];
    }

    const cmd = parsed[1];
    await AppDataSource.getRepository(PriceEntity).delete({ command: cmd });
    const response = prepare('price.price-was-unset', { command: cmd });
    return [{ response, ...opts }];
  }

  @command('!price toggle')
  @default_permission(defaultPermissions.CASTERS)
  async toggle (opts: CommandOptions): Promise<CommandResponse[]> {
    const parsed = opts.parameters.match(/^(![\S]+)$/);

    if (_.isNil(parsed)) {
      const response = prepare('price.price-parse-failed');
      return [{ response, ...opts }];
    }

    const cmd = parsed[1];
    const price = await AppDataSource.getRepository(PriceEntity).findOneBy({ command: cmd });
    if (!price) {
      const response = prepare('price.price-was-not-found', { command: cmd });
      return [{ response, ...opts }];
    }

    await AppDataSource.getRepository(PriceEntity).save({ ...price, enabled: !price.enabled });
    const response = prepare(price.enabled ? 'price.price-was-enabled' : 'price.price-was-disabled', { command: cmd });
    return [{ response, ...opts }];
  }

  @command('!price list')
  @default_permission(defaultPermissions.CASTERS)
  async list (opts: CommandOptions): Promise<CommandResponse[]> {
    const prices = await AppDataSource.getRepository(PriceEntity).find();
    const response = (prices.length === 0 ? translate('price.list-is-empty') : translate('price.list-is-not-empty').replace(/\$list/g, (_.orderBy(prices, 'command').map((o) => {
      return `${o.command} - ${o.price}`;
    })).join(', ')));
    return [{ response, ...opts }];
  }

  @parser({ priority: HIGH, skippable: true })
  async check (opts: ParserOptions): Promise<boolean> {
    const points = (await import('../systems/points.js')).default;
    const parsed = opts.message.match(/^(![\S]+)/);
    if (!opts.sender || !parsed || isBroadcaster(opts.sender?.userName)) {
      return true; // skip if not command or user is broadcaster
    }
    const helpers = (await (opts.parser || new Parser()).getCommandsList()).filter(o => o.isHelper).map(o => o.command);
    if (helpers.includes(opts.message)) {
      return true;
    }

    const price = await AppDataSource.getRepository(PriceEntity).findOneBy({ command: parsed[1], enabled: true });
    if (!price) { // no price set
      return true;
    }

    let translation = 'price.user-have-not-enough-points';
    if (price.price === 0 && price.priceBits > 0) {
      translation = 'price.user-have-not-enough-bits';
    }
    if (price.price > 0 && price.priceBits > 0) {
      translation = 'price.user-have-not-enough-points-or-bits';
    }

    const availablePts = await points.getPointsOf(opts.sender.userId);
    const removePts = price.price;
    const haveEnoughPoints = price.price > 0 && availablePts >= removePts;
    if (!haveEnoughPoints) {
      const response = prepare(translation, {
        bitsAmount: price.priceBits, amount: format(general.numberFormat, 0)(removePts), command: `${price.command}`, pointsName: getPointsName(removePts),
      });
      parserReply(response, opts);
    } else {
      await points.decrement({ userId: opts.sender.userId }, removePts);
    }
    return haveEnoughPoints;
  }

  @rollback()
  async restorePointsRollback (opts: ParserOptions): Promise<boolean> {
    if (!opts.sender) {
      return true;
    }
    const parsed = opts.message.match(/^(![\S]+)/);
    const helpers = (await (opts.parser || new Parser()).getCommandsList()).filter(o => o.isHelper).map(o => o.command);
    if (
      _.isNil(parsed)
      || isOwner(opts.sender)
      || helpers.includes(opts.message)
    ) {
      return true;
    }
    const price = await AppDataSource.getRepository(PriceEntity).findOneBy({ command: parsed[1], enabled: true });
    if (price) { // no price set
      const removePts = price.price;
      changelog.increment(opts.sender.userId, { points: removePts });
    }
    return true;
  }
}

export default new Price();