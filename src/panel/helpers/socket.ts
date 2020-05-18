import io from 'socket.io-client';
import { setTranslations } from './translate';

import type { SocketInterface } from 'src/bot/database/entity/socket';

let authorizeInProgress = false;

const sockets: Map<string, SocketIOClient.Socket> = new Map();

const waitForAuthorization = async () => {
  return new Promise((resolve) => {
    const check = () => {
      if (!authorizeInProgress) {
        resolve();
      } else {
        setTimeout(() => check(), 100);
      }
    };
    check();
  });
};

const authorize = async(cb, namespace: string) => {
  await waitForAuthorization();
  authorizeInProgress = true;
  const token = localStorage.getItem('accessToken') || null;
  console.groupCollapsed('socket::authorize ' + namespace);
  console.debug({token, type: 'access'});
  console.groupEnd();
  cb({token, type: 'access'});
};

const refreshToken = async(cb) => {
  // we expected that access token is invalid
  localStorage.removeItem('accessToken');

  const token = localStorage.getItem('refreshToken') || null;
  const userId = Number(localStorage.getItem('userId') || 0);
  const type = 'refresh';
  console.groupCollapsed('socket::refreshToken');
  console.debug({token, type, userId});
  console.groupEnd();
  cb({token, type, userId});
};

const authorized = async (cb: Readonly<SocketInterface>, namespace: string, resolve?: (value: any) => void) => {
  console.debug(`AUTHORIZED ACCESS(${cb.type}): ${namespace}`);
  localStorage.setItem('accessToken', cb.accessToken || '');
  localStorage.setItem('refreshToken', cb.refreshToken);
  localStorage.setItem('userType', cb.type);
  localStorage.setItem('userId', String(cb.userId));
  authorizeInProgress = false;
  if (resolve) {
    setTimeout(() => resolve('authorized'), 1000);
  }
};

export const redirectLogin = () => {
  if (window.location.href.includes('popout')) {
    window.location.replace(window.location.origin + '/login#error=popout+must+be+logged');
  } else {
    window.location.replace(window.location.origin + '/login');
  }
};

export async function waitForAuthorizationSocket(namespace: string) {
  return new Promise((resolve: (value?: string) => void, reject) => {
    if (!sockets.has(namespace)) {
      const socket = io(namespace, { forceNew: true });
      sockets.set(namespace, socket);
      socket.on('authorize', (cb) => authorize(cb, namespace));
      socket.on('refreshToken', refreshToken);
      socket.on('authorized', (cb: Readonly<SocketInterface>) => authorized(cb, namespace, resolve));
      socket.on('unauthorized', () => {
        // remove accessToken and refreshToken
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.setItem('userType', 'unauthorized');
        authorizeInProgress = false;
        resolve('unauthorized');
      });
    }
  });
};

export function getSocket(namespace: string, continueOnUnauthorized = false) {
  if (!sockets.has(namespace)) {
    const socket = io(namespace, { forceNew: true });
    sockets.set(namespace, socket);
    socket.on('authorize', (cb) => authorize(cb, namespace));
    socket.on('refreshToken', refreshToken);
    socket.on('authorized', (cb: Readonly<SocketInterface>) => authorized(cb, namespace));
    socket.on('unauthorized', (cb) => {
      // remove accessToken and refreshToken
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');

      localStorage.setItem('userType', 'unauthorized');
      if (!continueOnUnauthorized) {
        console.debug(window.location.href);
        console.debug('UNAUTHORIZED ACCESS: ' + namespace);
        redirectLogin();
      }
      console.debug(window.location.href);
      console.debug('UNAUTHORIZED ACCESS (OK): ' + namespace);
      authorizeInProgress = false;
    });
  }
  return sockets.get(namespace) as SocketIOClient.Socket;
}

export const getTranslations = async () => {
  console.debug('Getting translations');
  return new Promise((resolve) => {
    const loop = setInterval(() => {
      getSocket('/', true).emit('translations', (translations) => {
        clearInterval(loop);
        console.debug({translations});
        setTranslations(translations);
        resolve(translations);
      });
    }, 2000);
  });
};

export const getConfiguration = async () => {
  console.debug('Getting configuration');
  return new Promise((resolve) => {
    getSocket('/core/ui', true).emit('configuration', (err, configuration) => {
      if (err) {
        return console.error(err);
      }
      resolve(configuration);
    });
  });
};