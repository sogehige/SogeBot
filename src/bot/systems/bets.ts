'use strict';

// 3rdparty libraries
const {
  isMainThread,
// tslint:disable-next-line:no-var-requires
} = require('worker_threads');
import * as _ from 'lodash';

// bot libraries
import * as constants from '../constants';
import Expects from '../expects';
import System from './_interface';
import * as Points from './points';

const ERROR_NOT_ENOUGH_OPTIONS = 'Expected more parameters';
const ERROR_ALREADY_OPENED = '1';
const ERROR_ZERO_BET = '2';
const ERROR_NOT_RUNNING = '3';
const ERROR_UNDEFINED_BET = '4';
const ERROR_IS_LOCKED = '5';
const ERROR_DIFF_BET = '6';
const ERROR_NOT_OPTION = '7';

/*
 * !bet                                                                          - gets an info about bet
 * !bet [option-index] [amount]                                                  - bet [amount] of points on [option]
 * !bet open [-timeout 5] -title "your bet title" option | option | option | ... - open a new bet with selected options
 *                                                                               - -timeout in minutes - optional: default 2
 *                                                                               - -title - must be in "" - optional
 * !bet close [option]                                                           - close a bet and select option as winner
 * !bet refund                                                                   - close a bet and refund all participants
 * !set betPercentGain [0-100]                                                   - sets amount of gain per option
 */

class Bets extends System {
  [x: string]: any; // TODO: remove after interface ported to TS

  constructor() {
    const options: InterfaceSettings = {
      ui: {
        betPercentGain: {
          type: 'number-input',
          step: 1,
          min: 0,
          max: 100,
        },
      },
      settings: {
        betPercentGain: 20,
        commands: [
          { name: '!bet open', permission: constants.MODS },
          { name: '!bet close', permission: constants.MODS },
          { name: '!bet refund', permission: constants.MODS },
          { name: '!bet', isHelper: true },
        ],
      },
      dependsOn: [
        'systems.points',
      ],
    };
    super(options);

    if (isMainThread) {
      this.checkIfBetExpired();
    }

    this.addWidget('bets', 'widget-title-bets', 'far fa-money-bill-alt');
  }

  public sockets() {
    this.socket.on('connection', (socket) => {
      socket.on('close', async (option) => {
        const message = '!bet ' + (option === 'refund' ? option : 'close ' + option);
        global.log.process({ type: 'parse', sender: { username: global.commons.getOwner() }, message });
        global.workers.sendToWorker({ type: 'message', sender: { username: global.commons.getOwner() }, message, skip: true });
      });
    });
  }

  public async checkIfBetExpired() {
    try {
      const currentBet = await global.db.engine.findOne(this.collection.data, { key: 'bets' });
      if (_.isEmpty(currentBet) || currentBet.locked) { throw Error(ERROR_NOT_RUNNING); }

      const isExpired = currentBet.end <= new Date().getTime();
      if (isExpired) {
        currentBet.locked = true;

        const _bets = await global.db.engine.find(this.collection.users);
        if (_bets.length > 0) {
          global.commons.sendMessage(global.translate('bets.locked'), { username: global.commons.getOwner() });
          const _id = currentBet._id.toString(); delete currentBet._id;
          await global.db.engine.update(this.collection.data, { _id }, currentBet);
        } else {
          global.commons.sendMessage(global.translate('bets.removed'), global.commons.getOwner());
          await global.db.engine.remove(this.collection.data, { key: 'bets' });
        }
      }
    } catch (e) {
      switch (e.message) {
        case ERROR_NOT_RUNNING:
          break;
        default:
          global.log.error(e.stack);
          break;
      }
    }
    setTimeout(() => this.checkIfBetExpired(), 10000);
  }

  public async open(opts) {
    const currentBet = await global.db.engine.findOne(this.collection.data, { key: 'bets' });
    try {
      if (!_.isEmpty(currentBet)) { throw new Error(ERROR_ALREADY_OPENED); }

      const [timeout, title, options] = new Expects(opts.parameters)
        .argument({ name: 'timeout', optional: true, default: 2, type: Number })
        .argument({ name: 'title', optional: false, multi: true })
        .list({ delimiter: '|' })
        .toArray();
      if (options.length < 2) { throw new Error(ERROR_NOT_ENOUGH_OPTIONS); }

      const bet = { title, locked: false, options: [], key: 'bets', end: new Date().getTime() + timeout * 1000 * 60 };
      for (const i of Object.keys(options)) { bet.options[i] = { name: options[i] }; }

      await global.db.engine.insert(this.collection.data, bet);
      global.commons.sendMessage(await global.commons.prepare('bets.opened', {
        username: global.commons.getOwner(),
        title,
        maxIndex: options.length - 1,
        minutes: timeout,
        options: options.map((v, i) => `${i}. '${v}'`).join(', '),
        command: await this.settings.commands['!bet'],
      }), opts.sender);
    } catch (e) {
      switch (e.message) {
        case ERROR_NOT_ENOUGH_OPTIONS:
          global.commons.sendMessage(global.translate('bets.notEnoughOptions'), opts.sender);
          break;
        case ERROR_ALREADY_OPENED:
          global.commons.sendMessage(
            global.commons.prepare('bets.running', {
              command: await this.settings.commands['!bet'],
              maxIndex: currentBet.options.length - 1,
              options: currentBet.options.map((v, i) => `${i}. '${v.name}'`).join(', '),
            }), opts.sender);
          break;
        default:
          global.log.warning(e.stack);
          global.commons.sendMessage(global.translate('core.error'), opts.sender);
      }
    }
  }

  public async info(opts) {
    const currentBet = await global.db.engine.findOne(this.collection.data, { key: 'bets' });
    if (_.isEmpty(currentBet)) { global.commons.sendMessage(global.translate('bets.notRunning'), opts.sender); } else {
      global.commons.sendMessage(await global.commons.prepare(currentBet.locked ? 'bets.lockedInfo' : 'bets.info', {
        command: opts.command,
        title: currentBet.title,
        maxIndex: currentBet.options.length - 1,
        options: currentBet.options.map((v, i) => `${i}. '${v.name}'`).join(', '),
        minutes: Number((currentBet.end - new Date().getTime()) / 1000 / 60).toFixed(1) }), opts.sender);
    }
  }

  public async participate(opts) {
    const currentBet = await global.db.engine.findOne(this.collection.data, { key: 'bets' });

    try {
      // tslint:disable-next-line:prefer-const
      let [index, points] = new Expects(opts.parameters).number({ optional: true }).points({ optional: true }).toArray();
      if (!_.isNil(points) && !_.isNil(index)) {
        const pointsOfUser = await global.systems.points.getPointsOf(opts.sender.userId);
        const _betOfUser = await global.db.engine.findOne(this.collection.users, { id: opts.sender.userId });

        if (points === 'all' || points > pointsOfUser) { points = pointsOfUser; }

        if (points === 0) { throw Error(ERROR_ZERO_BET); }
        if (_.isEmpty(currentBet)) { throw Error(ERROR_NOT_RUNNING); }
        if (_.isNil(currentBet.options[index])) { throw Error(ERROR_UNDEFINED_BET); }
        if (currentBet.locked) { throw Error(ERROR_IS_LOCKED); }
        if (!_.isEmpty(_betOfUser) && _betOfUser.option !== index) { throw Error(ERROR_DIFF_BET); }

        if (_.isEmpty(_betOfUser)) { _betOfUser.points = 0; }

        // All OK
        await global.db.engine.increment('users.points', { id: opts.sender.userId }, { points: points * -1 });
        await global.db.engine.update(this.collection.users, { id: opts.sender.userId }, { username: opts.sender.username, points: points + _betOfUser.points, option: index });
      } else {
        this.info(opts);
      }
    } catch (e) {
      switch (e.message) {
        case ERROR_ZERO_BET:
          global.commons.sendMessage(global.translate('bets.zeroBet')
            .replace(/\$pointsName/g, await Points.getPointsName(0)), opts.sender);
          break;
        case ERROR_NOT_RUNNING:
          global.commons.sendMessage(global.translate('bets.notRunning'), opts.sender);
          break;
        case ERROR_UNDEFINED_BET:
          global.commons.sendMessage(await global.commons.prepare('bets.undefinedBet', { command: opts.command }), opts.sender);
          break;
        case ERROR_IS_LOCKED:
          global.commons.sendMessage(global.translate('bets.timeUpBet'), opts.sender);
          break;
        case ERROR_DIFF_BET:
          const result = _.pickBy(currentBet.bets, (v, k) => Object.keys(v).includes(opts.sender.username));
          global.commons.sendMessage(global.translate('bets.diffBet').replace(/\$option/g, Object.keys(result)[0]), opts.sender);
          break;
        default:
          global.log.warning(e.stack);
          global.commons.sendMessage(await global.commons.prepare('bets.error', { command: opts.command }).replace(/\$maxIndex/g, currentBet.options.length - 1), opts.sender);
      }
    }
  }

  public async refund(opts) {
    try {
      if (_.isEmpty(await global.db.engine.findOne(this.collection.data, { key: 'bets' }))) { throw Error(ERROR_NOT_RUNNING); }
      for (const user of await global.db.engine.find(this.collection.users)) {
        await global.db.engine.increment('users.points', { id: user.id }, { points: parseInt(user.points, 10) });
      }
      await global.db.engine.remove(this.collection.users, {});
      global.commons.sendMessage(global.translate('bets.refund'), opts.sender);
    } catch (e) {
      switch (e.message) {
        case ERROR_NOT_RUNNING:
          global.commons.sendMessage(global.translate('bets.notRunning'), opts.sender);
          break;
        default:
          global.log.warning(e.stack);
          global.commons.sendMessage(global.translate('core.error'), opts.sender);
      }
    } finally {
      await global.db.engine.remove(this.collection.data, { key: 'bets' });
    }
  }

  public async close(opts) {
    const currentBet = await global.db.engine.findOne(this.collection.data, { key: 'bets' });
    try {
      const index = new Expects(opts.parameters).number().toArray()[0];

      if (_.isEmpty(currentBet)) { throw Error(ERROR_NOT_RUNNING); }
      if (_.isNil(currentBet.options[index])) { throw Error(ERROR_NOT_OPTION); }

      const percentGain = (currentBet.options.length * parseInt(this.settings.betPercentGain, 10)) / 100;

      const users = await global.db.engine.find(this.collection.users);
      let total = 0;
      for (const user of users) {
        await global.db.engine.remove(this.collection.users, { _id: String(user._id) });
        if (user.option === index) {
          total += Math.round((parseInt(user.points, 10) * percentGain));
          await global.db.engine.increment('users.points', { user: user.id }, { points: Math.round((parseInt(user.points, 10) * percentGain)) });
        }
      }

      global.commons.sendMessage(global.translate('bets.closed')
        .replace(/\$option/g, currentBet.options[index].name)
        .replace(/\$amount/g, _.filter(users, (o) => o.option === index).length)
        .replace(/\$pointsName/g, await Points.getPointsName(total))
        .replace(/\$points/g, total), opts.sender);
      await global.db.engine.remove(this.collection.data, { _id: currentBet._id.toString() });
    } catch (e) {
      switch (e.message) {
        case ERROR_NOT_ENOUGH_OPTIONS:
          global.commons.sendMessage(global.translate('bets.closeNotEnoughOptions'), opts.sender);
          break;
        case ERROR_NOT_RUNNING:
          global.commons.sendMessage(global.translate('bets.notRunning'), opts.sender);
          break;
        case ERROR_NOT_OPTION:
          global.commons.sendMessage(await global.commons.prepare('bets.notOption', { command: opts.command }), opts.sender);
          break;
        default:
          global.log.warning(e.stack);
          global.commons.sendMessage(global.translate('core.error'), opts.sender);
      }
    }
  }

  public main(opts) {
    if (opts.parameters.length === 0) { this.info(opts); } else { this.participate(opts); }
  }
}

module.exports = new Bets();
