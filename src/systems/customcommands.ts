import {
  Commands, CommandsGroup, CommandsResponses,
} from '@entity/commands';
import * as constants from '@sogebot/ui-helpers/constants';
import { validateOrReject } from 'class-validator';
import _, { merge } from 'lodash';
import { getRepository } from 'typeorm';

import { parserReply } from '../commons';
import {
  command, default_permission, helper, timer,
} from '../decorators';
import { parser } from '../decorators';
import Expects from '../expects';
import System from './_interface';

import { checkFilter } from '~/helpers/checkFilter';
import {
  getAllCountOfCommandUsage, getCountOfCommandUsage, incrementCountOfCommandUsage, resetCountOfCommandUsage,
} from '~/helpers/commands/count';
import { prepare } from '~/helpers/commons';
import { info, warning } from '~/helpers/log';
import { app } from '~/helpers/panel';
import {
  addToViewersCache, get, getFromViewersCache,
} from '~/helpers/permissions';
import { check, defaultPermissions } from '~/helpers/permissions/index';
import { adminMiddleware } from '~/socket';
import { translate } from '~/translate';

/*
 * !command                                                                            - gets an info about command usage
 * !command add (-p [uuid|name]) ?-s true|false -c ![cmd] -r [response]                - add command with specified response
 * !command edit (-p [uuid|name]) ?-s true|false -c ![cmd] -rid [number] -r [response] - edit command with specified response
 * !command remove -c ![cmd]                                                           - remove specified command
 * !command remove -c ![cmd] -rid [number]                                             - remove specified response of command
 * !command toggle ![cmd]                                                              - enable/disable specified command
 * !command toggle-visibility ![cmd]                                                   - enable/disable specified command
 * !command list                                                                       - get commands list
 * !command list ![cmd]                                                                - get responses of command
 */

let cacheValid = false;
const findCache: {
  search: string;
  commands: {
    command: Commands;
    cmdArray: string[];
  }[]
}[] = [];

class CustomCommands extends System {
  constructor () {
    super();
    this.addMenu({
      category: 'commands', name: 'customcommands', id: 'commands/customcommands', this: this,
    });
  }

  sockets () {
    if (!app) {
      setTimeout(() => this.sockets(), 100);
      return;
    }

    app.get('/api/systems/customcommands', adminMiddleware, async (req, res) => {
      res.send({
        data:  await Commands.find({ relations: ['responses'] }),
        count: await getAllCountOfCommandUsage(),
      });
    });
    app.get('/api/systems/customcommands/groups/', adminMiddleware, async (req, res) => {
      let [ groupsList, items ] = await Promise.all([
        CommandsGroup.find(), Commands.find(),
      ]);

      for (const item of items) {
        if (item.group && !groupsList.find(o => o.name === item.group)) {
          // we dont have any group options -> create temporary group
          const group = new CommandsGroup();
          group.name = item.group;
          group.options = {
            filter:     null,
            permission: null,
          };
          groupsList = [
            ...groupsList,
            group,
          ];
        }
      }
      res.send({
        data: groupsList,
      });
    });
    app.get('/api/systems/customcommands/:id', adminMiddleware, async (req, res) => {
      const cmd = await Commands.findOne({ where: { id: req.params.id }, relations: ['responses'] });
      res.send({
        data:  cmd,
        count: cmd ? await getCountOfCommandUsage(cmd.command) : 0,
      });
    });
    app.delete('/api/systems/customcommands/groups/:name', adminMiddleware, async (req, res) => {
      await CommandsGroup.delete({ name: req.params.name });
      this.invalidateCache();
      res.status(404).send();
    });
    app.delete('/api/systems/customcommands/:id', adminMiddleware, async (req, res) => {
      await Commands.delete({ id: req.params.id });
      this.invalidateCache();
      res.status(404).send();
    });
    app.post('/api/systems/customcommands/group', adminMiddleware, async (req, res) => {
      try {
        this.invalidateCache();
        const itemToSave = new CommandsGroup();
        merge(itemToSave, req.body);
        await validateOrReject(itemToSave);
        await itemToSave.save();
        res.send({ data: itemToSave });
      } catch (e) {
        res.status(400).send({ errors: e });
      }
    });
    app.post('/api/systems/customcommands', adminMiddleware, async (req, res) => {
      try {
        this.invalidateCache();
        const itemToSave = new Commands();

        const { count, ...data } = req.body;
        merge(itemToSave, data);
        await validateOrReject(itemToSave);
        await itemToSave.save();

        if (count === 0) {
          await resetCountOfCommandUsage(itemToSave.command);
        }

        await getRepository(CommandsResponses).delete({ command: itemToSave });
        const responses = req.body.responses;
        for (const response of responses) {
          const resToSave = new CommandsResponses();
          merge(resToSave, response);
          resToSave.command = itemToSave;
          await resToSave.save();
        }
        res.send({ data: itemToSave });
      } catch (e) {
        res.status(400).send({ errors: e });
      }
    });
  }

  @command('!command')
  @default_permission(defaultPermissions.CASTERS)
  @helper()
  main (opts: CommandOptions) {
    let url = 'http://sogebot.github.io/sogeBot/#/systems/custom-commands';
    if ((process.env?.npm_package_version ?? 'x.y.z-SNAPSHOT').includes('SNAPSHOT')) {
      url = 'http://sogebot.github.io/sogeBot/#/_master/systems/custom-commands';
    }
    return [{ response: translate('core.usage') + ' => ' + url, ...opts }];
  }

  @command('!command edit')
  @default_permission(defaultPermissions.CASTERS)
  async edit (opts: CommandOptions) {
    try {
      const [userlevel, stopIfExecuted, cmd, rId, response] = new Expects(opts.parameters)
        .permission({ optional: true, default: defaultPermissions.VIEWERS })
        .argument({
          optional: true, name: 's', default: null, type: Boolean,
        })
        .argument({
          name: 'c', type: String, multi: true, delimiter: '',
        })
        .argument({ name: 'rid', type: Number })
        .argument({
          name: 'r', type: String, multi: true, delimiter: '',
        })
        .toArray();

      if (!cmd.startsWith('!')) {
        throw Error('Command should start with !');
      }

      const cDb = await Commands.findOne({
        relations: ['responses'],
        where:     { command: cmd },
      });
      if (!cDb) {
        return [{ response: prepare('customcmds.command-was-not-found', { command: cmd }), ...opts }];
      }

      const responseDb = cDb.responses.find(o => o.order === (rId - 1));
      if (!responseDb) {
        return [{ response: prepare('customcmds.response-was-not-found', { command: cmd, response: rId }), ...opts }];
      }

      const pItem = await get(userlevel);
      if (!pItem) {
        throw Error('Permission ' + userlevel + ' not found.');
      }

      responseDb.response = response;
      responseDb.permission = pItem.id ?? defaultPermissions.VIEWERS;
      if (stopIfExecuted) {
        responseDb.stopIfExecuted = stopIfExecuted;
      }

      await responseDb.save();
      this.invalidateCache();
      return [{ response: prepare('customcmds.command-was-edited', { command: cmd, response }), ...opts }];
    } catch (e: any) {
      return [{ response: prepare('customcmds.commands-parse-failed', { command: this.getCommand('!command') }), ...opts }];
    }
  }

  @command('!command add')
  @default_permission(defaultPermissions.CASTERS)
  async add (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [userlevel, stopIfExecuted, cmd, response] = new Expects(opts.parameters)
        .permission({ optional: true, default: defaultPermissions.VIEWERS })
        .argument({
          optional: true, name: 's', default: false, type: Boolean,
        })
        .argument({
          name: 'c', type: String, multi: true, delimiter: '',
        })
        .argument({
          name: 'r', type: String, multi: true, delimiter: '',
        })
        .toArray();

      if (!cmd.startsWith('!')) {
        throw Error('Command should start with !');
      }

      const cDb = await Commands.findOne({
        relations: ['responses'],
        where:     { command: cmd },
      });
      if (!cDb) {
        const newCommand = new Commands();
        newCommand.command = cmd;
        newCommand.enabled = true;
        newCommand.visible = true;
        await newCommand.save();
        return this.add(opts);
      }

      const pItem = await get(userlevel);
      if (!pItem) {
        throw Error('Permission ' + userlevel + ' not found.');
      }

      const newResponse = new CommandsResponses();
      newResponse.order =          cDb.responses.length;
      newResponse.permission =     pItem.id ?? defaultPermissions.VIEWERS;
      newResponse.stopIfExecuted = stopIfExecuted;
      newResponse.response =       response;
      newResponse.filter =         '';
      newResponse.command = cDb;
      await newResponse.save();
      this.invalidateCache();
      return [{ response: prepare('customcmds.command-was-added', { command: cmd }), ...opts }];
    } catch (e: any) {
      return [{ response: prepare('customcmds.commands-parse-failed', { command: this.getCommand('!command') }), ...opts }];
    }
  }

  invalidateCache() {
    cacheValid = false;
  }

  async find(search: string) {
    const commands: {
      command: Commands;
      cmdArray: string[];
    }[] = [];
    if (!cacheValid) {
      // we need to purge findCache and make cacheValid again
      while(findCache.length > 0) {
        findCache.shift();
      }
      cacheValid = true;
    }

    const fromCache = findCache.find(o => o.search === search);
    if (fromCache) {
      return fromCache.commands;
    } else {
      const cmdArray = search.toLowerCase().split(' ');
      for (let i = 0, len = search.toLowerCase().split(' ').length; i < len; i++) {
        const db_commands: Commands[]
          = await Commands.find({
            relations: ['responses'],
            where:     { command: cmdArray.join(' ') },
          });
        for (const cmd of db_commands) {
          commands.push({
            cmdArray: _.cloneDeep(cmdArray),
            command:  cmd,
          });
        }
        cmdArray.pop(); // remove last array item if not found
      }
      findCache.push({ search, commands });
      return commands;
    }
  }

  @timer()
  @parser({ priority: constants.HIGHEST, fireAndForget: true })
  async run (opts: ParserOptions & { quiet?: boolean, processedCommands?: string[] }): Promise<boolean> {
    if (!opts.message.startsWith('!') || !opts.sender) {
      return true;
    } // do nothing if it is not a command

    const commands = await this.find(opts.message);
    if (commands.length === 0) {
      return true;
    } // no command was found - return

    // go through all commands
    let atLeastOnePermissionOk = false;
    for (const cmd of commands) {
      if (!cmd.command.enabled) {
        atLeastOnePermissionOk = true; // continue if command is disabled
        warning(`Custom command ${cmd.command.command} (${cmd.command.id}) is disabled!`);
        continue;
      }
      const _responses: CommandsResponses[] = [];
      // remove found command from message to get param
      const param = opts.message.replace(new RegExp('^(' + cmd.cmdArray.join(' ') + ')', 'i'), '').trim();
      incrementCountOfCommandUsage(cmd.command.command);

      // check group filter first
      let group: Readonly<Required<CommandsGroup>> | undefined;
      let groupPermission: null | string = null;
      if (cmd.command.group) {
        group = await getRepository(CommandsGroup).findOne({ name: cmd.command.group });
        if (group) {
          if (group.options.filter && !(await checkFilter(opts, group.options.filter))) {
            warning(`Custom command ${cmd.command.command}#${cmd.command.id} didn't pass group filter.`);
            continue;
          }
          groupPermission = group.options.permission;
        }
      }

      for (const r of _.orderBy(cmd.command.responses, 'order', 'asc')) {
        let permission = r.permission ?? groupPermission;
        // show warning if null permission
        if (!permission) {
          permission = defaultPermissions.CASTERS;
          warning(`Custom command ${cmd.command.command}#${cmd.command.id}|${r.order} doesn't have any permission set, treating as CASTERS permission.`);
        }

        if (typeof getFromViewersCache(opts.sender.userId, permission) === 'undefined') {
          addToViewersCache(opts.sender.userId, permission, (await check(opts.sender.userId, permission, false)).access);
        }

        if ((opts.skip || getFromViewersCache(opts.sender.userId, permission))
            && (r.filter.length === 0 || (r.filter.length > 0 && await checkFilter(opts, r.filter)))) {
          _responses.push(r);
          atLeastOnePermissionOk = true;
          if (r.stopIfExecuted) {
            break;
          }
        }

        if (!atLeastOnePermissionOk) {
          info(`User ${opts.sender.userName}#${opts.sender.userId} doesn't have permissions or filter to use custom command ${cmd.command.command}#${cmd.command.id}`);
        }
      }

      if (!opts.quiet) {
        this.sendResponse(_.cloneDeep(_responses), {
          param, sender: opts.sender, command: cmd.command.command, processedCommands: opts.processedCommands, discord: opts.discord, id: opts.id,
        });
      }
    }
    return atLeastOnePermissionOk;
  }

  async sendResponse(responses: (CommandsResponses)[], opts: { param: string; sender: CommandOptions['sender'], discord: CommandOptions['discord'], command: string, processedCommands?: string[], id: string, }) {
    for (let i = 0; i < responses.length; i++) {
      await parserReply(responses[i].response, opts);
    }
  }

  @command('!command list')
  @default_permission(defaultPermissions.CASTERS)
  async list (opts: CommandOptions) {
    const cmd = new Expects(opts.parameters).command({ optional: true }).toArray()[0];

    if (!cmd) {
      // print commands
      const commands = await Commands.find({ where: { visible: true, enabled: true } });
      const response = (commands.length === 0 ? translate('customcmds.list-is-empty') : translate('customcmds.list-is-not-empty').replace(/\$list/g, _.orderBy(commands, 'command').map(o => o.command).join(', ')));
      return [{ response, ...opts }];
    } else {
      // print responses
      const command_with_responses
        = await Commands.findOne({
          relations: ['responses'],
          where:     { command: cmd },
        });

      if (!command_with_responses || command_with_responses.responses.length === 0) {
        return [{ response: prepare('customcmds.list-of-responses-is-empty', { command: cmd }), ...opts }];
      }
      return Promise.all(_.orderBy(command_with_responses.responses, 'order', 'asc').map(async(r) => {
        const perm = r.permission ? await get(r.permission) : { name: '-- unset --' };
        const response = prepare('customcmds.response', {
          command: cmd, index: ++r.order, response: r.response, after: r.stopIfExecuted ? '_' : 'v', permission: perm?.name ?? 'n/a',
        });
        return { response, ...opts };
      }));
    }
  }

  @command('!command toggle')
  @default_permission(defaultPermissions.CASTERS)
  async toggle (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [cmdInput, subcommand] = new Expects(opts.parameters)
        .command()
        .string({ optional: true })
        .toArray();

      const cmd = await Commands.findOne({ where: { command: (cmdInput + ' ' + subcommand).trim() } });
      if (!cmd) {
        const response = prepare('customcmds.command-was-not-found', { command: (cmdInput + ' ' + subcommand).trim() });
        return [{ response, ...opts }];
      }
      cmd.enabled = !cmd.enabled;
      await cmd.save();
      this.invalidateCache();
      return [{ response: prepare(cmd.enabled ? 'customcmds.command-was-enabled' : 'customcmds.command-was-disabled', { command: cmd.command }), ...opts }];
    } catch (e: any) {
      const response = prepare('customcmds.commands-parse-failed', { command: this.getCommand('!command') });
      return [{ response, ...opts }];
    }
  }

  @command('!command toggle-visibility')
  @default_permission(defaultPermissions.CASTERS)
  async toggleVisibility (opts: CommandOptions): Promise<CommandResponse[]> {
    try {
      const [cmdInput, subcommand] = new Expects(opts.parameters)
        .command()
        .string({ optional: true })
        .toArray();

      const cmd = await Commands.findOne({ where: { command: (cmdInput + ' ' + subcommand).trim() } });
      if (!cmd) {
        const response = prepare('customcmds.command-was-not-found', { command: (cmdInput + ' ' + subcommand).trim() });
        return [{ response, ...opts }];
      }
      cmd.visible = !cmd.visible;
      await cmd.save();

      const response = prepare(cmd.visible ? 'customcmds.command-was-exposed' : 'customcmds.command-was-concealed', { command: cmd.command });
      this.invalidateCache();
      return [{ response, ...opts }];

    } catch (e: any) {
      const response = prepare('customcmds.commands-parse-failed', { command: this.getCommand('!command') });
      return [{ response, ...opts }];
    }
  }

  @command('!command remove')
  @default_permission(defaultPermissions.CASTERS)
  async remove (opts: CommandOptions) {
    try {
      const [cmd, rId] = new Expects(opts.parameters)
        .argument({
          name: 'c', type: String, multi: true, delimiter: '',
        })
        .argument({
          name: 'rid', type: Number, optional: true, default: 0,
        })
        .toArray();

      if (!cmd.startsWith('!')) {
        throw Error('Command should start with !');
      }

      const command_db = await Commands.findOne({
        where:     { command: cmd },
        relations: [ 'responses' ],
      });
      if (!command_db) {
        return [{ response: prepare('customcmds.command-was-not-found', { command: cmd }), ...opts }];
      } else {
        let response = prepare('customcmds.command-was-removed', { command: cmd });
        if (rId >= 1) {
          const responseDb = command_db.responses.filter(o => o.order !== (rId - 1));
          const toRemove = command_db.responses.find(o => o.order === (rId - 1));
          await toRemove?.remove();

          // reorder
          responseDb.forEach((item, index) => {
            item.order = index;
          });
          for (const r of responseDb) {
            await r.save();
          }
          response = prepare('customcmds.response-was-removed', { command: cmd, response: rId });
        } else {
          await Commands.remove(command_db);
        }
        this.invalidateCache();
        return [{ response, ...opts }];
      }
    } catch (e: any) {
      return [{ response: prepare('customcmds.commands-parse-failed', { command: this.getCommand('!command') }), ...opts }];
    }
  }
}

export default new CustomCommands();
