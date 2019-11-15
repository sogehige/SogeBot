'use strict';

import * as _ from 'lodash';

// bot libraries
import Parser from '../parser';
import System from './_interface';
import * as constants from '../constants';
import { permission } from '../helpers/permissions';
import { command, default_permission, rollback } from '../decorators';
import { parser } from '../decorators';
import { isOwner, prepare, sendMessage } from '../commons';

import { getRepository } from 'typeorm';
import { User } from '../database/entity/user';
import { Price as PriceEntity } from '../database/entity/price';
import { adminEndpoint } from '../helpers/socket';
import { error } from '../helpers/log';

/*
 * !price                     - gets an info about price usage
 * !price set [cmd] [price]   - add notice with specified response
 * !price unset [cmd] [price] - add notice with specified response
 * !price list                - get list of notices
 * !price toggle [cmd]        - remove notice by id
 */

class Price extends System {
  public dependsOn: string[] = ['systems.points'];

  constructor () {
    super();
    this.addMenu({ category: 'manage', name: 'price', id: 'manage/price/list' });
  }

  sockets() {
    adminEndpoint(this.nsp, 'price::getAll', async (cb) => {
      cb(await getRepository(PriceEntity).find({
        order: {
          price: 'ASC',
        },
      }));
    });

    adminEndpoint(this.nsp, 'price::getOne', async (id, cb) => {
      cb(await getRepository(PriceEntity).findOne({ id }));
    });

    adminEndpoint(this.nsp, 'price::save', async (price: PriceEntity, cb) => {
      try {
        await getRepository(PriceEntity).save(price);
        cb(null);
      } catch (e) {
        error(e);
        cb(e);
      }
    });

    adminEndpoint(this.nsp, 'price::delete', async (id: string, cb) => {
      try {
        await getRepository(PriceEntity).delete({ id });
        cb(null);
      } catch (e) {
        error(e);
        cb(e);
      }
    });
  }

  @command('!price')
  @default_permission(permission.CASTERS)
  main (opts) {
    sendMessage(global.translate('core.usage') + ': !price set <cmd> <price> | !price unset <cmd> | !price list | !price toggle <cmd>', opts.sender, opts.attr);
  }

  @command('!price set')
  @default_permission(permission.CASTERS)
  async set (opts) {
    const parsed = opts.parameters.match(/^(![\S]+) ([0-9]+)$/);

    if (_.isNil(parsed)) {
      const message = await prepare('price.price-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    const [command, argPrice] = parsed.slice(1);
    if (parseInt(argPrice, 10) === 0) {
      this.unset(opts);
      return false;
    }

    let price = await getRepository(PriceEntity).findOne({ command });
    if (!price) {
      price = new PriceEntity();
      price.command = command;
      price.price = argPrice;
    }
    await getRepository(PriceEntity).save(price);
    const message = await prepare('price.price-was-set', { command, amount: parseInt(argPrice, 10), pointsName: await global.systems.points.getPointsName(price) });
    sendMessage(message, opts.sender, opts.attr);
  }

  @command('!price unset')
  @default_permission(permission.CASTERS)
  async unset (opts) {
    const parsed = opts.parameters.match(/^(![\S]+)$/);

    if (_.isNil(parsed)) {
      const message = await prepare('price.price-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    const command = parsed[1];
    await getRepository(PriceEntity).delete({ command });
    const message = await prepare('price.price-was-unset', { command });
    sendMessage(message, opts.sender, opts.attr);
  }

  @command('!price toggle')
  @default_permission(permission.CASTERS)
  async toggle (opts) {
    const parsed = opts.parameters.match(/^(![\S]+)$/);

    if (_.isNil(parsed)) {
      const message = await prepare('price.price-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    const command = parsed[1];
    const price = await getRepository(PriceEntity).findOne({ command });
    if (!price) {
      const message = await prepare('price.price-was-not-found', { command });
      sendMessage(message, opts.sender, opts.attr);
      return false;
    }

    price.enabled = !price.enabled;
    await getRepository(PriceEntity).save(price);
    const message = await prepare(!price.enabled ? 'price.price-was-enabled' : 'price.price-was-disabled', { command });
    sendMessage(message, opts.sender, opts.attr);
  }

  @command('!price list')
  @default_permission(permission.CASTERS)
  async list (opts) {
    const prices = await getRepository(PriceEntity).find();
    const output = (prices.length === 0 ? global.translate('price.list-is-empty') : global.translate('price.list-is-not-empty').replace(/\$list/g, (_.map(_.orderBy(prices, 'command'), (o) => {
      return `${o.command} - ${o.price}`;
    })).join(', ')));
    sendMessage(output, opts.sender, opts.attr);
  }

  @parser({ priority: constants.HIGH })
  async check (opts) {
    const parsed = opts.message.match(/^(![\S]+)/);
    const helpers = (await (new Parser()).getCommandsList()).filter(o => o.isHelper).map(o => o.command);
    if (
      _.isNil(parsed)
      || isOwner(opts.sender)
      || helpers.includes(opts.message)
    ) {
      return true;
    }

    const price = await getRepository(PriceEntity).findOne({ command: parsed[1], enabled: true });
    if (!price) { // no price set
      return true;
    }
    const availablePts = await global.systems.points.getPointsOf(opts.sender.userId);
    const removePts = price.price;
    const haveEnoughPoints = availablePts >= removePts;
    if (!haveEnoughPoints) {
      const message = await prepare('price.user-have-not-enough-points', { amount: removePts, command: `${price.command}`, pointsName: await global.systems.points.getPointsName(removePts) });
      sendMessage(message, opts.sender, opts.attr);
    } else {
      await getRepository(User).decrement({ userId: opts.sender.userId }, 'points', removePts);
    }
    return haveEnoughPoints;
  }

  @rollback()
  async restorePointsRollback (opts) {
    const parsed = opts.message.match(/^(![\S]+)/);
    const helpers = (await (new Parser()).getCommandsList()).filter(o => o.isHelper).map(o => o.command);
    if (
      _.isNil(parsed)
      || isOwner(opts.sender)
      || helpers.includes(opts.message)
    ) {
      return true;
    }
    const price = await getRepository(PriceEntity).findOne({ command: parsed[1], enabled: true });

    if (!price) { // no price set
      return true;
    }

    const removePts = price.price;
    await getRepository(User).increment({ userId: opts.sender.userId }, 'points', removePts);
  }
}

export default Price;
export { Price };