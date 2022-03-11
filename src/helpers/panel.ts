import fs from 'fs';
import http, { Server } from 'http';
import https from 'https';
import { normalize } from 'path';

import express from 'express';
import { Server as io } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

import type { Module } from '../_interface';
import { ClientToServerEventsWithNamespace } from './socket';

import { info } from '~/helpers/log';

export const menu: { category?: string; name: string; id: string; this: Module | null }[] = [];
export const menuPublic: { name: string; id: string }[] = [];

menu.push({
  category: 'main', name: 'dashboard', id: '', this: null,
});

menu.push({
  category: 'stats', name: 'api-explorer', id: 'stats/api-explorer', this: null,
});

export let ioServer: io | null = null;
export let app: express.Application | null = null;
export let server: Server;
export let serverSecure: Server;

/*export interface ClientToServerEvents {
  'eventlist::removeById': (idList: string[] | string, cb: (error: Error | string | null) => void) => void,
  'eventlist::get': (count: number) => void,
  'skip': () => void,
  'cleanup': () => void,
  'eventlist::resend': (id: string) => void,

  'generic::getCoreCommands': (cb: (error: Error | string | null, commands: import('../general').Command[]) => Promise<void>) => void,
  'generic::setCoreCommand': (commands: import('../general').Command, cb: (error: Error | string | null) => Promise<void>) => void,
};
// export type EventNames = keyof ClientToServerEvents & (string | symbol);
*/

export const addMenu = (menuArg: typeof menu[number]) => {
  if (!menu.find(o => o.id === menuArg.id)) {
    menu.push(menuArg);
  }
};

export const addMenuPublic = (menuArg: typeof menuPublic[number]) => {
  if (!menuPublic.find(o => o.id === menuArg.id)) {
    menuPublic.push(menuArg);
  }
};

export const setApp = (_app: express.Application) => {
  app = _app;
};

export const setServer = () => {
  if (app) {
    server = http.createServer(app);
    if (process.env.CORS) {
      ioServer = new io<DefaultEventsMap, ClientToServerEventsWithNamespace>(server, {
        cors: {
          origin:  process.env.CORS,
          methods: ['GET', 'POST'],
        },
      });
    } else {
      ioServer = new io(server);
    }
    ioServer.sockets.setMaxListeners(200);

    if (process.env.CA_CERT && process.env.CA_KEY) {
      info(`Using ${process.env.CA_CERT} certificate for HTTPS`);
      serverSecure = https.createServer({
        key:  fs.readFileSync(normalize(process.env.CA_KEY)),
        cert: fs.readFileSync(normalize(process.env.CA_CERT)),
      }, app);
      if (ioServer) {
        ioServer.attach(serverSecure);
      }
    } else {
      info(`No certificates were provided, serving only HTTP.`);
    }
  }
};
