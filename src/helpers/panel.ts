import http, { Server } from 'http';

import express from 'express';
import { Server as io } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

import type { Module } from '../_interface.js';

import type { ClientToServerEventsWithNamespace } from '~/../d.ts/src/helpers/socket.js';

export type MenuItem = {
  id: string;
  category?: string;
  name: string;
};

export const menu: (MenuItem & { this: Module | null, scopeParent?: string })[] = [];
export const menuPublic: { name: string; id: string }[] = [];

menu.push({
  category: 'main', name: 'dashboard', id: '', this: null,
});

export let ioServer: io | null = null;
export let app: express.Application | null = null;
export let server: Server;
export let serverSecure: Server;

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
  }
};
