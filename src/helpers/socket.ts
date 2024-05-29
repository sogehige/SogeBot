import jwt from 'jsonwebtoken';
import { isEqual } from 'lodash-es';
import { Socket } from 'socket.io';

import { check } from './permissions/check.js';
import defaultPermissions from './permissions/defaultPermissions.js';
import { getUserHighestPermission } from './permissions/getUserHighestPermission.js';

import type { Fn, ClientToServerEventsWithNamespace, NestedFnParams } from '~/../d.ts/src/helpers/socket.js';
import { debug } from '~/helpers/log.js';

const endpoints: {
  type: 'admin' | 'viewer' | 'public';
  on: any;
  nsp: any;
  callback: any;
}[] = [];

const newEndpoints: {
  scopes: string[];
  on: any;
  nsp: any;
  callback: any;
}[] = [];

const scopes: Set<string> = new Set();
function addScope(scope: string) {
  scopes.add(scope);
}
// Add default scopes
addScope('dashboard:read');
addScope('dashboard:manage');

const getPrivileges = async(userId: string): Promise<{
  haveAdminPrivileges: boolean;
  excludeSensitiveScopes: boolean;
  scopes:             string[];
}> => {
  try {
    const isAdmin = await check(userId, defaultPermissions.CASTERS, true);
    if (isAdmin.access) {
      return {
        haveAdminPrivileges:    true,
        excludeSensitiveScopes: false,
        scopes:                 Array.from(scopes), // allow all scopes for admin
      };
    }
    const userPermission = await getUserHighestPermission(userId);
    const privileges = {
      haveAdminPrivileges:    userPermission.haveAllScopes,
      excludeSensitiveScopes: userPermission.excludeSensitiveScopes,
      scopes:                 userPermission.scopes ?? [],
    };
    return privileges;
  } catch (e: any) {
    return {
      haveAdminPrivileges:    false,
      excludeSensitiveScopes: true,
      scopes:                 [],
    };
  }
};

const initEndpoints = (socket: Socket, privileges: Unpacked<ReturnType<typeof getPrivileges>>) => {
  socket.offAny(); // remove all listeners in case we call this twice
  for (const key of [...new Set(endpoints.filter(o => o.nsp === socket.nsp.name).map(o => o.nsp + '||' + o.on))]) {
    const [nsp, on] = key.split('||');
    const endpointsToInit = endpoints.filter(o => o.nsp === nsp && o.on === on);
    if (endpointsToInit.length > 0) {
      socket.on(on, async (opts: any, cb: (error: Error | string | null, ...response: any) => void) => {
      // initialize all endpoints given by privileges scopes
        const adminEndpointInit = endpointsToInit.find(o => o.type === 'admin');
        const viewerEndpoint = endpointsToInit.find(o => o.type === 'viewer');
        const publicEndpoint = endpointsToInit.find(o => o.type === 'public');
        if (adminEndpointInit && privileges.haveAdminPrivileges) {
          adminEndpointInit.callback(opts, cb ?? socket, socket);
          return;
        } else if (!viewerEndpoint && !publicEndpoint) {
          debug('socket', `User dont have admin access to ${socket.nsp.name}`);
          debug('socket', privileges);
          cb && cb('User doesn\'t have access to this endpoint', null);
          return;
        }

        if (viewerEndpoint) {
          viewerEndpoint.callback(opts, cb ?? socket, socket);
          return;
        } else if (!publicEndpoint) {
          debug('socket', `User dont have viewer access to ${socket.nsp.name}`);
          debug('socket', privileges);
          cb && cb('User doesn\'t have access to this endpoint', null);
          return;
        }

        publicEndpoint.callback(opts, cb ?? socket, socket);
      });
    }
  }
  // new code for new endpoints with scopes
  for (const key of [...new Set(newEndpoints.filter(o => o.nsp === socket.nsp.name).map(o => o.nsp + '||' + o.on))]) {
    const [nsp, on] = key.split('||');
    const scopedEndpoints = newEndpoints.filter(o => o.nsp === nsp && o.on === on);
    if (newEndpoints.length > 0) {
      socket.on(on, async (opts: any, cb: (error: Error | string | null, ...response: any) => void) => {
        for (const scopedEndpoint of scopedEndpoints) {
          if (scopedEndpoint.scopes.some(scope => privileges.scopes.includes(scope))) {
            scopedEndpoint.callback(opts, cb ?? socket, socket);
          }
        }
        cb && cb('User doesn\'t have access to this endpoint', null);
      });
    }
  }
};

function endpoint<K0 extends keyof O, K1 extends keyof O[K0], O extends Record<PropertyKey, Record<PropertyKey, Fn>> = ClientToServerEventsWithNamespace>(allowedScopes: string[], nsp: K0, on: K1, callback: (...args: NestedFnParams<O, K0, K1>) => void): void {
  if (!newEndpoints.find(o => isEqual(o.scopes, allowedScopes) && o.nsp === nsp && o.on === on)) {
    newEndpoints.push({
      scopes: allowedScopes, nsp, on, callback,
    });
  }
}

function adminEndpoint<K0 extends keyof O, K1 extends keyof O[K0], O extends Record<PropertyKey, Record<PropertyKey, Fn>> = ClientToServerEventsWithNamespace>(nsp: K0, on: K1, callback: (...args: NestedFnParams<O, K0, K1>) => void): void {
  if (!endpoints.find(o => o.type === 'admin' && o.nsp === nsp && o.on === on)) {
    endpoints.push({
      nsp, on, callback, type: 'admin',
    });
  }
}

const viewerEndpoint = (nsp: string, on: string, callback: (opts: any, cb: (error: Error | string | null, ...response: any) => void) => void, socket?: Socket) => {
  if (!endpoints.find(o => o.type === 'viewer' && o.nsp === nsp && o.on === on)) {
    endpoints.push({
      nsp, on, callback, type: 'viewer',
    });
  }
};

const withScope = (allowedScopes: string[], isPublic: boolean = false) => {
  return async (req: { headers: { [x: string]: any; }; }, res: { sendStatus: (arg0: number) => any; }, next: () => void) => {
    try {
      const authHeader = req.headers.authorization;
      const authToken = authHeader && authHeader.split(' ')[1];

      const socket = (await import('../socket.js')).default;

      if (authToken === socket.socketToken || isPublic) {
        return next();
      }

      if (authToken == null) {
        res.sendStatus(401);
        return;
      }

      const token = jwt.verify(authToken, socket.JWTKey) as {
        userId: string; userName: string; privileges: Unpacked<ReturnType<typeof getPrivileges>>;
      };

      token.privileges.scopes = token.privileges.scopes || [];
      req.headers.scopes = token.privileges.scopes.sort();
      req.headers.authUser = { userId: token.userId, userName: token.userName };

      for (const allowed of allowedScopes) {
        // allow manage also if read is allowed
        if (allowed.includes(':read')) {
          if (token.privileges.scopes.includes(allowed.replace(':read', ':manage'))) {
            return next();
          }
        }

        // check if user have the scope
        if (token.privileges.scopes.includes(allowed)) {
          return next();
        }
      }

      res.sendStatus(401);
    } catch (e) {
      res.sendStatus(500);
      return ;
    }
  };
};

export {
  endpoints, adminEndpoint, viewerEndpoint, endpoint, scopes, newEndpoints, addScope, withScope, getPrivileges, initEndpoints,
};