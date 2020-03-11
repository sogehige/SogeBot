import _ from 'lodash';
import chalk from 'chalk';
import axios from 'axios';
import io from 'socket.io-client';

import Integration from './_interface';
import { onChange, onStartup } from '../decorators/on.js';
import { settings } from '../decorators';
import { ui } from '../decorators.js';
import { error, info, tip } from '../helpers/log.js';
import { triggerInterfaceOnTip } from '../helpers/interface/triggers.js';

import { getRepository } from 'typeorm';
import { User, UserTipInterface } from '../database/entity/user';
import api from '../api.js';
import events from '../events.js';
import users from '../users.js';
import eventlist from '../overlays/eventlist.js';
import currency from '../currency';
import alerts from '../registries/alerts.js';

class TipeeeStream extends Integration {
  socketToTipeeestream: SocketIOClient.Socket | null = null;

  @settings()
  @ui({ type: 'text-input', secret: false })
  username = '';

  @settings()
  @ui({ type: 'text-input', secret: true })
  apiKey = '';

  constructor () {
    super();
  }

  @onStartup()
  @onChange('enabled')
  onStateChange (key: string, val: boolean) {
    if (val) {
      this.connect();
    } else {
      this.disconnect();
    }
  }

  async disconnect () {
    if (this.socketToTipeeestream !== null) {
      this.socketToTipeeestream.removeAllListeners();
      this.socketToTipeeestream.disconnect();
      this.socketToTipeeestream = null;
    }
  }

  @onChange('apiKey')
  async connect () {
    this.disconnect();

    if (this.username.trim() === '' || this.apiKey.trim() === '' || !this.enabled) {
      return;
    }

    // get current avaliable host and port
    // destructured response from https://api.tipeeestream.com/v2.0/site/socket
    // example response: { "code": 200, "message": "success", "datas": { "port": "443", "host": "https://sso-cf.tipeeestream.com" } }
    const { data: { datas: { host, port }}} = await axios.get('https://api.tipeeestream.com/v2.0/site/socket');

    this.socketToTipeeestream = io(`${host}:${port}`,
      {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        query: {
          access_token: this.apiKey.trim(),
        },
      });

    if (this.socketToTipeeestream !== null) {
      this.socketToTipeeestream.on('connect_error', (e) => {
        error(chalk.red('TIPEEESTREAM.COM:') + ' error while connecting, ' + e);
      });
      this.socketToTipeeestream.on('connect', () => {
        if (this.socketToTipeeestream !== null) {
          this.socketToTipeeestream.emit('join-room', { room: this.apiKey.trim(), username: this.username.trim() });
        }
        info(chalk.yellow('TIPEEESTREAM.COM:') + ' Successfully connected socket to service');
      });
      this.socketToTipeeestream.on('reconnect_attempt', () => {
        info(chalk.yellow('TIPEEESTREAM.COM:') + ' Trying to reconnect to service');
      });
      this.socketToTipeeestream.on('disconnect', () => {
        info(chalk.yellow('TIPEEESTREAM.COM:') + ' Socket disconnected from service');
        this.disconnect();
        this.socketToTipeeestream = null;
      });

      this.socketToTipeeestream.on('new-event', async (data) => {
        this.parse(data);
      });
    }
  }

  async parse(data) {
    if (data.event.type !== 'donation') {
      return;
    }
    try {
      const { amount, message } = data.event.parameters;
      const username = data.event.parameters.username.toLowerCase();
      const donationCurrency = data.event.parameters.currency;

      eventlist.add({
        event: 'tip',
        amount,
        currency: donationCurrency,
        username,
        message,
        timestamp: Date.now(),
      });

      events.fire('tip', {
        username,
        amount: parseFloat(amount).toFixed(2),
        currency: donationCurrency,
        amountInBotCurrency: Number(currency.exchange(amount, donationCurrency, currency.mainCurrency)).toFixed(2),
        currencyInBot: currency.mainCurrency,
        message,
      });

      alerts.trigger({
        event: 'tips',
        name: username,
        amount: Number(parseFloat(amount).toFixed(2)),
        currency: donationCurrency,
        monthsName: '',
        message,
        autohost: false,
      });

      if (!data._is_test_alert) {
        const getUser = async (username, id) => {
          const userByUsername = await getRepository(User).findOne({ where: { username }});
          if (userByUsername) {
            return userByUsername;
          }

          const user = await getRepository(User).findOne({ where: { userId: id }});
          if (user) {
            return user;
          } else {
            return getRepository(User).save({
              userId: Number(id),
              username,
            });
          }
        };

        const user = await getUser(username, await users.getIdByName(username));
        const newTip: UserTipInterface = {
          amount,
          currency: donationCurrency,
          sortAmount: currency.exchange(Number(amount), donationCurrency, 'EUR'),
          message,
          tippedAt: Date.now(),
        };
        user.tips.push(newTip);
        getRepository(User).save(user);

        tip(`${username}${user.userId ? '#' + user.userId : ''}, amount: ${amount.toFixed(2)}${donationCurrency}, message: ${message}`);

        if (api.isStreamOnline) {
          api.stats.currentTips += Number(currency.exchange(amount, donationCurrency, currency.mainCurrency));
        }
      }

      triggerInterfaceOnTip({
        username,
        amount,
        message,
        currency: donationCurrency,
        timestamp: _.now(),
      });
    } catch (e) {
      error(e);
    }
  }
}

export default new TipeeeStream();
