import chalk from 'chalk';
import _ from 'lodash';
import { setTimeout } from 'timers';
import { isMainThread } from './cluster';

import { loadingInProgress, permissions as permissionsList } from './decorators';
import { getFunctionList } from './decorators/on';
import { permission } from './helpers/permissions';
import { error, info, warning } from './helpers/log';

import { getRepository } from 'typeorm';
import { Settings } from './database/entity/settings';
import { PermissionCommands, Permissions as PermissionsEntity } from './database/entity/permissions';
import { adminEndpoint, publicEndpoint } from './helpers/socket';
import { flatten, unflatten } from './helpers/flatten';
import { existsSync } from 'fs';
import { isDbConnected } from './helpers/database';
import { register } from './helpers/register';

let socket: import('./socket').Socket | any = null;
let panel: null | any = null;

class Module {
  public dependsOn: Module[] = [];
  public showInUI = true;
  public timeouts: { [x: string]: NodeJS.Timeout } = {};
  public settingsList: { category: string; key: string }[] = [];
  public settingsPermList: { category: string; key: string }[] = [];
  public on: InterfaceSettings.On;
  public socket: any = null;

  onStartupTriggered = false;

  get isDisabledByEnv(): boolean {
    const isDisableIgnored = typeof process.env.ENABLE !== 'undefined' && process.env.ENABLE.toLowerCase().split(',').includes(this.constructor.name.toLowerCase());
    return typeof process.env.DISABLE !== 'undefined'
      && (process.env.DISABLE.toLowerCase().split(',').includes(this.constructor.name.toLowerCase()) || process.env.DISABLE === '*')
      && !isDisableIgnored;
  };

  areDependenciesEnabled = false;
  get _areDependenciesEnabled(): Promise<boolean> {
    return new Promise((resolve) => {
      const check = async (retry) => {
        const status: any[] = [];
        for (const dependency of this.dependsOn) {
          if (!dependency || !_.isFunction(dependency.status)) {
            if (retry > 0) {
              setTimeout(() => check(--retry), 10);
            } else {
              throw new Error(`[${this.constructor.name}] Dependency error - possibly wrong path`);
            }
            return;
          } else {
            status.push(await dependency.status({ quiet: true }));
          }
        }
        resolve(status.length === 0 || _.every(status));
      };
      check(1000);
    });
  }

  get nsp(): string {
    return '/' + this._name + '/' + this.constructor.name.toLowerCase();
  }

  get enabled(): boolean {
    if (this.areDependenciesEnabled && !this.isDisabledByEnv) {
      return _.get(this, '_enabled', true);
    } else {
      return false;
    }
  }

  set enabled(value: boolean) {
    if (!_.isEqual(_.get(this, '_enabled', true), value)) {
      _.set(this, '_enabled', value);
      getRepository(Settings).findOne({
        where: {
          name: 'enabled',
          namespace: this.nsp,
        },
      }).then(data => {
        getRepository(Settings).save({
          ...data,
          name: 'enabled',
          value: JSON.stringify(value),
          namespace: this.nsp,
        });
      });
    }
  }

  protected _name: string;
  protected _ui: InterfaceSettings.UI;
  protected _commands: Command[];
  protected _parsers: Parser[];
  protected _rollback: { name: string }[];
  protected _enabled: boolean | null = true;

  constructor(name = 'core', enabled = true) {
    this.on = {
      change: {
        enabled: [],
      },
      load: {},
    };

    this.socket = null;

    this._commands = [];
    this._parsers = [];
    this._rollback = [];
    this._ui = {};
    this._name = name;
    this._enabled = enabled;

    register(this._name as any, this);

    // prepare proxies for variables
    this._sockets();

    const load = () => {
      if (isDbConnected) {
        setTimeout(async () => {
          let enabled = true;
          if (this._name !== 'core') {
            enabled = await this.loadVariableValue('enabled');
          }
          const onStartup = () => {
            if (loadingInProgress.length > 0) {
              // wait until all settings are loaded
              return setTimeout(() => onStartup(), 100);
            }
            this._enabled = typeof enabled === 'undefined' ? this._enabled : enabled;
            this.status({ state: this._enabled, quiet: !isMainThread });
            if (isMainThread) {
              const path = this._name === 'core' ? this.constructor.name.toLowerCase() : `${this._name}.${this.constructor.name.toLowerCase()}`;
              for (const event of getFunctionList('startup', path)) {
                this[event.fName]('enabled', enabled);
              }
            };
            this.onStartupTriggered = true;
          };
          onStartup();

          // require panel/socket
          socket = (require('./socket')).default;
          panel = (require('./panel')).default;
        }, 5000); // slow down little bit to have everything preloaded or in progress of loading
      } else {
        setTimeout(() => load(), 1000);
      }
    };
    load();

    setInterval(async () => {
      this.areDependenciesEnabled = await this._areDependenciesEnabled;
    }, 1000);
  }

  public sockets() {
    return;
  }

  public emit(event: string, ...args: any[]) {
    if (this.socket) {
      this.socket.emit(event, ...args);
    }
  }

  public async loadVariableValue(key) {
    const variable = await getRepository(Settings)
      .createQueryBuilder('settings')
      .select('settings')
      .where('namespace=:namespace', { namespace: this.nsp })
      .andWhere('name=:name', { name: key })
      .getOne();

    const path = this._name === 'core' ? this.constructor.name.toLowerCase() : `${this._name}.${this.constructor.name.toLowerCase()}`;
    for (const event of getFunctionList('load', `${path}.${key}` )) {
      this[event.fName]();
    }

    try {
      if (typeof variable !== 'undefined') {
        return JSON.parse(variable.value);
      } else {
        return undefined;
      }
    } catch (e) {
      error({key, variable});
      error(e);
      return undefined;
    }
  }

  public prepareCommand(opts:  Command) {
    const defaultPermission = permissionsList[`${this._name}.${this.constructor.name.toLowerCase()}.${(opts.fnc || '').toLowerCase()}`];
    if (typeof defaultPermission === 'undefined') {
      opts.permission = opts.permission || permission.VIEWERS;
    } else {
      opts.permission = defaultPermission;
    }
    opts.isHelper = opts.isHelper || false;
    return opts;
  }

  public _sockets() {
    if (panel === null || socket === null) {
      setTimeout(() => this._sockets(), 100);
    } else {
      this.socket = panel.io.of(this.nsp).use(socket.authorize);
      this.sockets();
      this.sockets = function() {
        error(this.nsp + ': Cannot initialize sockets second time');
      };

      // default socket listeners
      adminEndpoint(this.nsp, 'settings', async (cb) => {
        cb(null, await this.getAllSettings(), await this.getUI());
      });
      adminEndpoint(this.nsp, 'settings.update', async (data: { [x: string]: any }, cb) => {
        // flatten and remove category
        data = flatten(data);
        const remap: ({ key: string; actual: string; toRemove: string[] } | { key: null; actual: null; toRemove: null })[] = Object.keys(flatten(data)).map(o => {
          // skip commands, enabled and permissions
          if (o.startsWith('commands') || o.startsWith('enabled') || o.startsWith('_permissions')) {
            return {
              key: o,
              actual: o,
              toRemove: [],
            };
          }

          const toRemove: string[] = [];
          for (const possibleVariable of o.split('.')) {
            const isVariableFound = this.settingsList.find(o => possibleVariable === o.key);
            if (isVariableFound) {
              return {
                key: o,
                actual: isVariableFound.key,
                toRemove,
              };
            } else {
              toRemove.push(possibleVariable);
            }
          }
          return {
            key: null,
            actual: null,
            toRemove: null,
          };
        });

        for (const { key, actual, toRemove } of remap) {
          if (key === null || toRemove === null || actual === null) {
            continue;
          }

          const joinedToRemove = toRemove.join('.');
          for (const key of Object.keys(data)) {
            if (joinedToRemove.length > 0) {
              const value = data[key];
              data[key.replace(joinedToRemove + '.', '')] = value;

              if (key.replace(joinedToRemove + '.', '') !== key) {
                delete data[key];
              }
            }
          }
        }
        try {
          for (const [key, value] of Object.entries(unflatten(data))) {
            if (key === 'enabled' && ['core', 'overlays', 'widgets'].includes(this._name)) {
              // ignore enabled if its core, overlay or widgets (we don't want them to be disabled)
              continue;
            } else if (key === '_permissions') {
              for (const [command, currentValue] of Object.entries(value as any)) {
                const c = this._commands.find((o) => o.name === command);
                if (c) {
                  if (currentValue === c.permission) {
                    await getRepository(PermissionCommands).delete({ name: c.name });
                  } else {
                    await getRepository(PermissionCommands).save({
                      ...(await getRepository(PermissionCommands).findOne({ name: c.name })),
                      name: c.name,
                      permission: currentValue as string,
                    });
                  }
                }
              }
            } else if (key === 'enabled') {
              this.status({ state: value });
            } else if (key === 'commands') {
              for (const [defaultValue, currentValue] of Object.entries(value as any)) {
                if (this._commands) {
                  this.setCommand(defaultValue, currentValue as string);
                }
              }
            } else if (key === '__permission_based__') {
              for (const vKey of Object.keys(value as any)) {
                this['__permission_based__' + vKey] = (value as any)[vKey];
              }
            } else {
              this[key] = value;
            }
          }
        } catch (e) {
          error(e.stack);
          if (typeof cb === 'function') {
            setTimeout(() => cb(e.stack), 1000);
          }
        }

        if (typeof cb === 'function') {
          setTimeout(() => cb(null), 1000);
        }
      });

      adminEndpoint(this.nsp, 'set.value', async (variable, value, cb) => {
        this[variable] = value;
        if (typeof cb === 'function') {
          cb(null, {variable, value});
        }
      });
      publicEndpoint(this.nsp, 'get.value', async (variable, cb) => {
        cb(null, await this[variable]);
      });
    }
  }

  public async status(opts: any = {}) {
    if (['core', 'overlays', 'widgets', 'stats', 'registries'].includes(this._name) || (opts.state === null && typeof opts.state !== 'undefined')) {
      return true;
    }

    const isMasterAndStatusOnly = isMainThread && _.isNil(opts.state);
    const isStatusChanged = !_.isNil(opts.state);

    if (isStatusChanged) {
      this.enabled = opts.state;
    } else {
      opts.state = this.enabled;
    }

    if (existsSync('./restart.pid')) {
      opts.quiet = true; // force quiet if we have restart.pid
    }

    if (!this.areDependenciesEnabled || this.isDisabledByEnv) {
      opts.state = false;
    } // force disable if dependencies are disabled or disabled by env

    // on.change handler on enabled
    if (isMainThread && isStatusChanged && this.onStartupTriggered) {
      const path = this._name === 'core' ? this.constructor.name.toLowerCase() : `${this._name}.${this.constructor.name.toLowerCase()}`;
      for (const event of getFunctionList('change', path + '.enabled')) {
        if (typeof this[event.fName] === 'function') {
          this[event.fName]('enabled', opts.state);
        } else {
          error(`${event.fName}() is not function in ${this._name}/${this.constructor.name.toLowerCase()}`);
        }
      }
    }

    if ((isMasterAndStatusOnly || isStatusChanged) && !opts.quiet) {
      if (this.isDisabledByEnv) {
        info(`${chalk.red('DISABLED BY ENV')}: ${this.constructor.name} (${this._name})`);
      } else if (this.areDependenciesEnabled) {
        info(`${opts.state ? chalk.green('ENABLED') : chalk.red('DISABLED')}: ${this.constructor.name} (${this._name})`);
      } else {
        info(`${chalk.red('DISABLED BY DEP')}: ${this.constructor.name} (${this._name})`);
      }
    }

    return opts.state;
  }

  public addMenu(opts) {
    if (isMainThread) {
      if (_.isNil(panel)) {
        setTimeout(() => this.addMenu(opts), 1000);
      } else {
        panel.addMenu(opts);
      }
    }
  }

  public addWidget(...opts) {
    if (isMainThread) {
      clearTimeout(this.timeouts[`${this.constructor.name}.${opts[0]}.addWidget`]);

      if (_.isNil(panel)) {
        this.timeouts[`${this.constructor.name}.${opts[0]}.addWidget`] = setTimeout(() => this.addWidget(...opts), 1000);
      } else {
        panel.addWidget(opts[0], opts[1], opts[2]);
      }
    }
  }

  public async getAllSettings() {
    const promisedSettings: {
      [x: string]: any;
    } = {};

    // go through expected settings
    for (const { category, key } of this.settingsList) {
      if (category) {
        if (typeof promisedSettings[category] === 'undefined') {
          promisedSettings[category] = {};
        }

        if (category === 'commands') {
          _.set(promisedSettings, `${category}.${key}`, this.getCommand(key));
        } else {
          _.set(promisedSettings, `${category}.${key}`, this[key]);
        }
      } else {
        _.set(promisedSettings, key, this[key]);
      }
    }

    // go through expected permission based settings
    for (const { category, key } of this.settingsPermList) {
      if (typeof promisedSettings.__permission_based__ === 'undefined') {
        promisedSettings.__permission_based__ = {};
      }

      if (category) {
        if (typeof promisedSettings.__permission_based__[category] === 'undefined') {
          promisedSettings.__permission_based__[category] = {};
        }

        _.set(promisedSettings, `__permission_based__.${category}.${key}`, await this.getPermissionBasedSettingsValue(key, false));
      } else {
        _.set(promisedSettings, `__permission_based__.${key}`, await this.getPermissionBasedSettingsValue(key, false));
      }
    }

    // add command permissions
    if (this._commands.length > 0) {
      promisedSettings._permissions = {};
      for (const command of this._commands) {
        const name = typeof command === 'string' ? command : command.name;
        const pItem = await getRepository(PermissionCommands).findOne({ name });
        if (pItem) {
          promisedSettings._permissions[name] = pItem.permission;
        } else {
          promisedSettings._permissions[name] = command.permission;
        }
      }
    }

    // add status info
    promisedSettings.enabled = this._enabled;
    return promisedSettings;
  }

  public async parsers() {
    if (!this.enabled) {
      return [];
    }

    const parsers: {
      this: any;
      name: string;
      fnc: (opts: ParserOptions) => any;
      permission: string;
      priority: number;
      fireAndForget: boolean;
    }[] = [];
    for (const parser of this._parsers) {
      parser.permission = typeof parser.permission !== 'undefined' ? parser.permission : permission.VIEWERS;
      parser.priority = typeof parser.priority !== 'undefined' ? parser.priority : 3 /* constants.LOW */;

      if (_.isNil(parser.name)) {
        throw Error('Parsers name must be defined');
      }

      if (typeof parser.dependsOn !== 'undefined') {
        for (const dependency of parser.dependsOn) {
          // skip parser if dependency is not enabled
          if (!_.isFunction(dependency.status) || !(await dependency.status())) {
            continue;
          }
        }
      }

      parsers.push({
        this: this,
        name: `${this.constructor.name}.${parser.name}`,
        fnc: this[parser.name],
        permission: parser.permission,
        priority: parser.priority,
        fireAndForget: parser.fireAndForget ? parser.fireAndForget : false,
      });
    }
    return parsers;
  }

  public async rollbacks() {
    if (!this.enabled) {
      return [];
    }

    const rollbacks: {
      this: any;
      name: string;
      fnc: (opts: ParserOptions) => any;
    }[] = [];
    for (const rollback of this._rollback) {
      if (_.isNil(rollback.name)) {
        throw Error('Rollback name must be defined');
      }

      rollbacks.push({
        this: this,
        name: `${this.constructor.name}.${rollback.name}`,
        fnc: this[rollback.name],
      });
    }
    return rollbacks;
  }

  public async commands() {
    if (this.enabled) {
      const commands: {
        this: any;
        id: string;
        command: string;
        fnc: (opts: CommandOptions) => void;
        _fncName: string;
        permission: string | null;
        isHelper: boolean;
      }[] = [];
      for (const command of this._commands) {
        if (_.isNil(command.name)) {
          throw Error('Command name must be defined');
        }

        // if fnc is not set
        if (typeof command.fnc === 'undefined') {
          command.fnc = 'main';
          if (command.name.split(' ').length > 1) {
            command.fnc = '';
            const _fnc = command.name.split(' ')[1].split('-');
            for (const part of _fnc) {
              if (command.fnc.length === 0) {
                command.fnc = part;
              } else {
                command.fnc = command.fnc + part.charAt(0).toUpperCase() + part.slice(1);
              }
            }
          }
        }

        if (command.dependsOn) {
          for (const dependency of command.dependsOn) {
            // skip command if dependency is not enabled
            if (!_.isFunction(dependency.status) || !(await dependency.status())) {
              continue;
            }
          }
        }

        command.permission = typeof command.permission === 'undefined' ? permission.VIEWERS : command.permission;
        command.command = typeof command.command === 'undefined' ? command.name : command.command;
        commands.push({
          this: this,
          id: command.name,
          command: command.command,
          fnc: this[command.fnc],
          _fncName: command.fnc,
          permission: command.permission,
          isHelper: command.isHelper ? command.isHelper : false,
        });
      }

      return commands;
    } else {
      return [];
    }
  }

  public async getUI() {
    // we need to go through all ui and trigger functions and delete attr if false
    const ui: InterfaceSettings.UI = _.cloneDeep(this._ui);
    for (const [k, v] of Object.entries(ui)) {
      if (typeof v !== 'undefined' && typeof v !== 'boolean') {
        if (typeof v.type !== 'undefined') {
          // final object
          if (typeof v.if === 'function') {
            if (!v.if()) {
              delete ui[k];
            }
          }

          if (v.type === 'selector') {
            if (typeof v.values === 'function') {
              v.values = v.values();
            }
          }
        } else {
          for (const [k2, v2] of Object.entries(v)) {
            if (typeof v2 !== 'undefined') {
              if (typeof v2.if === 'function') {
                if (!v2.if()) {
                  delete ui[k][k2];
                }
              }
              if (typeof v2.values === 'function') {
                v2.values = v2.values();
              }
            }
          }
        }
      }
    }
    return ui;
  }

  /*
   * Returns updated value of command if changed by user
   * @param command - default command to serach
  */
  public getCommand(command: string): string {
    const c = this._commands.find((o) => o.name === command);
    if (c && c.command) {
      return c.command;
    } else {
      return command;
    }
  }

  protected async loadCommand(command: string): Promise<void> {
    const cmd = await getRepository(Settings)
      .createQueryBuilder('settings')
      .select('settings')
      .where('namespace = :namespace', { namespace: this.nsp })
      .andWhere('name = :name', { name: 'commands.' + command })
      .getOne();

    if (cmd) {
      const c = this._commands.find((o) => o.name === command);
      if (c) {
        c.command = JSON.parse(cmd.value);
      }
    } else {
      const c = this._commands.find((o) => o.name === command);
      if (c) {
        c.command = c.name;
      }
    }
  }

  /**
   *
   */
  protected async setCommand(command: string, updated: string): Promise<void> {
    const c = this._commands.find((o) => o.name === command);
    if (c) {
      if (c.name === updated) {
        // default value
        await getRepository(Settings).delete({
          namespace: this.nsp,
          name: 'commands.' + command,
        });
        delete c.command;
      } else {
        c.command = updated;
        const savedCommand = await getRepository(Settings).findOne({
          where: {
            namespace: this.nsp,
            name: 'commands.' + command,
          },
        });
        await getRepository(Settings).save({
          ...savedCommand,
          namespace: this.nsp,
          name: 'commands.' + command,
          value: JSON.stringify(updated),
        });
      }
    } else {
      warning(`Command ${command} cannot be updated to ${updated}`);
    }
  }

  protected async getPermissionBasedSettingsValue(key: string, set_default_values = true): Promise<{[permissionId: string]: any}> {
    // current permission settings by user
    const permSet = {};
    let permId = permission.VIEWERS;

    // get current full list of permissions
    const permissions = await getRepository(PermissionsEntity).find({
      cache: true,
      order: {
        order: 'DESC',
      },
    });
    for (const p of permissions) {
      // set proper value for permId or default value
      if (set_default_values || p.id === permission.VIEWERS) {
        if (p.id === permission.VIEWERS) {
          // set default value if viewers
          permSet[p.id] = _.get(this, `__permission_based__${key}.${p.id}`, this[key]);
        } else {
          // set value of permission before if anything else (to have proper waterfall inheriting)
          // we should have correct values as we are desc ordering
          const value = _.get(this, `__permission_based__${key}.${p.id}`, null);
          permSet[p.id] = value === null
            ? _.get(permSet, permId, this[key])
            : value;
        }
        permId = p.id;
      } else {
        permSet[p.id] = _.get(this, `__permission_based__${key}.${p.id}`, null);
      }
    }
    return permSet;
  }
}

export default Module;
export { Module };
