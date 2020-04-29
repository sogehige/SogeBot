'use strict';

import * as _ from 'lodash';

import { prepare, sendMessage } from '../commons';
import { command, default_permission, parser } from '../decorators';
import Expects from '../expects';
import Message from '../message';
import Parser from '../parser';
import { permission } from '../helpers/permissions';
import System from './_interface';
import { incrementCountOfCommandUsage } from '../helpers/commands/count';
import { debug, warning } from '../helpers/log';

import { Alias as AliasEntity, AliasInterface } from '../database/entity/alias';
import { getRepository } from 'typeorm';
import { adminEndpoint, publicEndpoint } from '../helpers/socket';
import { addToViewersCache, getFromViewersCache } from '../helpers/permissions';
import permissions from '../permissions';
import { translate } from '../translate';
import tmi from '../tmi';

/*
 * !alias                                              - gets an info about alias usage
 * !alias add (-p [uuid|name]) -a ![alias] -c ![cmd]   - add alias for specified command
 * !alias edit (-p [uuid|name]) -a ![alias] -c ![cmd]  - add alias for specified command
 * !alias remove ![alias]                              - remove specified alias
 * !alias toggle ![alias]                              - enable/disable specified alias
 * !alias toggle-visibility ![alias]                   - enable/disable specified alias
 * !alias list                                         - get alias list
 */

class Alias extends System {
  constructor () {
    super();

    this.addMenu({ category: 'manage', name: 'alias', id: 'manage/alias' });
  }

  sockets() {
    publicEndpoint(this.nsp, 'alias:getAll', async (cb) => {
      try {
        cb(null, await getRepository(AliasEntity).find());
      } catch (e) {
        cb(e.stack, []);
      }
    });

    adminEndpoint(this.nsp, 'getById', async (id, cb) => {
      try {
        cb(null, await getRepository(AliasEntity).findOne({ id }));
      } catch (e) {
        cb(e.stack);
      }
    });

    adminEndpoint(this.nsp, 'setById', async (id, dataset: AliasInterface, cb) => {
      try {
        const item = await getRepository(AliasEntity).save({ ...(await getRepository(AliasEntity).findOne({ id })), ...dataset});
        cb(null, item);
      } catch (e) {
        cb(e.stack, null);
      }
    });

    adminEndpoint(this.nsp, 'deleteById', async (id, cb) => {
      await getRepository(AliasEntity).delete({ id });
      cb(null);
    });
  }

  @parser()
  async run (opts) {
    const p = new Parser();
    let alias;

    // is it an command?
    if (!opts.message.startsWith('!')) {
      return true;
    }

    let cmdArray = opts.message.toLowerCase().split(' ');
    const length = opts.message.toLowerCase().split(' ').length;
    for (let i = 0; i < length; i++) {
      alias = await getRepository(AliasEntity).findOne({ alias: cmdArray.join(' '), enabled: true });
      if (!_.isEmpty(alias)) {
        break;
      }
      cmdArray.pop(); // remove last array item if not found
    }
    if (_.isEmpty(alias)) {
      return true;
    } // no alias was found - return

    const replace = new RegExp(`${alias.alias}`, 'i');
    cmdArray = opts.message.replace(replace, `${alias.command}`).split(' ');
    let tryingToBypass = false;

    for (let i = 0; i < length; i++) { // search for correct alias
      if (cmdArray.length === alias.command.split(' ').length) {
        break;
      } // command is correct (have same number of parameters as command)

      const parsedCmd = await p.find(cmdArray.join(' '), null);
      const isRegistered = !_.isNil(parsedCmd) && parsedCmd.command.split(' ').length === cmdArray.length;

      if (isRegistered) {
        tryingToBypass = true;
        break;
      }
      cmdArray.pop(); // remove last array item if not found
    }
    if (!tryingToBypass) {
      // Don't run alias if its same as command e.g. alias !me -> command !me
      if (alias.command === alias.alias) {
        warning(`Cannot run alias ${alias.alias}, because it exec ${alias.command}`);
        return false;
      } else {
        if (typeof getFromViewersCache(opts.sender.userId, alias.permission) === 'undefined') {
          addToViewersCache(opts.sender.userId, alias.permission, (await permissions.check(opts.sender.userId, alias.permission, false)).access);
        }
        if (getFromViewersCache(opts.sender.userId, alias.permission)) {
          // parse variables
          const message = await new Message(opts.message.replace(replace, `${alias.command}`)).parse({
            sender: opts.sender,
          });
          debug('alias.process', message);
          tmi.message({
            message: {
              tags: opts.sender,
              message,
            }, skip: true });
          incrementCountOfCommandUsage(alias.alias);
        } else {
          return false;
        }
      }
    }
    return true;
  }

  @command('!alias')
  @default_permission(permission.CASTERS)
  main (opts) {
    sendMessage(translate('core.usage') + ': !alias add -p [uuid|name] <!alias> <!command> | !alias edit -p [uuid|name] <!alias> <!command> | !alias remove <!alias> | !alias list | !alias toggle <!alias> | !alias toggle-visibility <!alias>', opts.sender, opts.attr);
  }

  @command('!alias edit')
  @default_permission(permission.CASTERS)
  async edit (opts) {
    try {
      const [perm, alias, cmd] = new Expects(opts.parameters)
        .permission({ optional: true, default: permission.VIEWERS })
        .argument({ name: 'a', type: String, multi: true, delimiter: '' }) // set as multi as alias can contain spaces
        .argument({ name: 'c', type: String, multi: true, delimiter: '' }) // set as multi as command can contain spaces
        .toArray();

      if (!alias.startsWith('!') || !cmd.startsWith('!')) {
        throw Error('Alias or Command doesn\'t start with !');
      }

      const pItem = await permissions.get(perm);
      if (!pItem) {
        throw Error('Permission ' + perm + ' not found.');
      }

      const item = await getRepository(AliasEntity).findOne({ alias });
      if (!item) {
        const message = prepare('alias.alias-was-not-found', { alias });
        sendMessage(message, opts.sender, opts.attr);
        return false;
      }
      await getRepository(AliasEntity).save({...item, command: cmd, permission: pItem.id ?? permission.VIEWERS});

      const message = prepare('alias.alias-was-edited', { alias, command: cmd });
      sendMessage(message, opts.sender, opts.attr);
    } catch (e) {
      sendMessage(prepare('alias.alias-parse-failed'), opts.sender, opts.attr);
    }
  }

  @command('!alias add')
  @default_permission(permission.CASTERS)
  async add (opts) {
    try {
      const [perm, alias, cmd] = new Expects(opts.parameters)
        .permission({ optional: true, default: permission.VIEWERS })
        .argument({ name: 'a', type: String, multi: true, delimiter: '' }) // set as multi as alias can contain spaces
        .argument({ name: 'c', type: String, multi: true, delimiter: '' }) // set as multi as command can contain spaces
        .toArray();

      if (!alias.startsWith('!') || !cmd.startsWith('!')) {
        throw Error('Alias or Command doesn\'t start with !');
      }

      const pItem = await permissions.get(perm);
      if (!pItem) {
        throw Error('Permission ' + perm + ' not found.');
      }

      const message = prepare('alias.alias-was-added',
        await getRepository(AliasEntity).save({
          alias,
          command: cmd,
          enabled: true,
          visible: true,
          permission: pItem.id ?? permission.VIEWERS,
        })
      );
      sendMessage(message, opts.sender, opts.attr);
    } catch (e) {
      sendMessage(prepare('alias.alias-parse-failed'), opts.sender, opts.attr);
    }
  }

  @command('!alias list')
  @default_permission(permission.CASTERS)
  async list (opts) {
    const alias = await getRepository(AliasEntity).find({ visible: true, enabled: true });
    const output = (alias.length === 0 ? translate('alias.list-is-empty') : translate('alias.list-is-not-empty').replace(/\$list/g, (_.map(_.orderBy(alias, 'alias'), 'alias')).join(', ')));
    sendMessage(output, opts.sender, opts.attr);
  }

  @command('!alias toggle')
  @default_permission(permission.CASTERS)
  async toggle (opts) {
    try {
      const [alias] = new Expects(opts.parameters)
        .everything()
        .toArray();

      if (!alias.startsWith('!')) {
        throw Error('Not starting with !');
      }

      const item = await getRepository(AliasEntity).findOne({ alias });
      if (!item) {
        const message = prepare('alias.alias-was-not-found', { alias });
        sendMessage(message, opts.sender, opts.attr);
        return;
      }
      await getRepository(AliasEntity).save({...item, enabled: !item.enabled});
      const message = prepare(!item.enabled ? 'alias.alias-was-enabled' : 'alias.alias-was-disabled', item);
      sendMessage(message, opts.sender, opts.attr);
    } catch (e) {
      const message = prepare('alias.alias-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
    }
  }

  @command('!alias toggle-visibility')
  @default_permission(permission.CASTERS)
  async toggleVisibility (opts) {
    try {
      const [alias] = new Expects(opts.parameters)
        .everything()
        .toArray();

      if (!alias.startsWith('!')) {
        throw Error('Not starting with !');
      }

      const item = await getRepository(AliasEntity).findOne({ alias });
      if (!item) {
        const message = prepare('alias.alias-was-not-found', { alias });
        sendMessage(message, opts.sender, opts.attr);
        return false;
      }
      await getRepository(AliasEntity).save({...item, visible: !item.visible});
      const message = prepare(!item.visible ? 'alias.alias-was-exposed' : 'alias.alias-was-concealed', item);
      sendMessage(message, opts.sender, opts.attr);
    } catch (e) {
      const message = prepare('alias.alias-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
    }
  }

  @command('!alias remove')
  @default_permission(permission.CASTERS)
  async remove (opts) {
    try {
      const [alias] = new Expects(opts.parameters)
        .everything()
        .toArray();

      if (!alias.startsWith('!')) {
        throw Error('Not starting with !');
      }

      const item = await getRepository(AliasEntity).findOne({ alias });
      if (!item) {
        const message = prepare('alias.alias-was-not-found', { alias });
        sendMessage(message, opts.sender, opts.attr);
        return false;
      }
      await getRepository(AliasEntity).remove(item);

      const message = prepare('alias.alias-was-removed', { alias });
      sendMessage(message, opts.sender, opts.attr);
    } catch (e) {
      const message = prepare('alias.alias-parse-failed');
      sendMessage(message, opts.sender, opts.attr);
    }
  }
}

export default new Alias();
