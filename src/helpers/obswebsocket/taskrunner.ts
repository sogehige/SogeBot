import { createHash } from 'crypto';

import type ObsWebSocket from 'obs-websocket-js';
import safeEval from 'safe-eval';

import { Events } from '../../database/entity/event.js';
import { OBSWebsocketInterface, simpleModeTasks } from '../../database/entity/obswebsocket';
import { setImmediateAwait } from '../setImmediateAwait';
import { availableActions } from './actions';

const runningTasks: string[] = [];

const taskRunner = async (obs: ObsWebSocket, opts: { tasks: OBSWebsocketInterface['simpleModeTasks'] | string, hash?: string, attributes?: Events.Attributes }): Promise<void> => {
  const hash = opts.hash ?? createHash('sha256').update(JSON.stringify(opts.tasks)).digest('base64');
  const tasks = opts.tasks;
  if (runningTasks.includes(hash)) {
    // we need to have running only one
    await setImmediateAwait();
    return taskRunner(obs, opts);
  }

  runningTasks.push(hash);

  try {
    if (typeof tasks === 'string') {
      // advanced mode
      const toEval = `(async function evaluation () { ${tasks} })()`;
      await safeEval(toEval, {
        event:  opts.attributes,
        obs,
        waitMs: (ms: number) => {
          return new Promise((resolve) => setTimeout(resolve, ms, null));
        },
        // we are using error on code so it will be seen in OBS Log Viewer
        log: (process.env.BUILD === 'web') ? console.error : require('../log').info,
      });
    } else {
      for (const task of tasks) {
        let args;
        const event = task.event as keyof typeof availableActions;
        switch(event) {
          case 'Log':
            args = task.args as simpleModeTasks.TaskLog['args'];
            await availableActions[event](obs, args.logMessage);
            break;
          case 'WaitMs':
            args = task.args as simpleModeTasks.WaitMS['args'];
            await availableActions[event](obs, args.miliseconds);
            break;
          case 'SetCurrentScene':
            args = task.args as simpleModeTasks.SetCurrentScene['args'];
            await availableActions[event](obs, args.sceneName);
            break;
          case 'SetMute':
            args = task.args as simpleModeTasks.SetMute['args'];
            await availableActions[event](obs, args.source, args.mute);
            break;
          case 'SetVolume':
            args = task.args as simpleModeTasks.SetVolume['args'];
            await availableActions[event](obs, args.source, args.volume);
            break;
          default:
            await availableActions[event](obs);
        }
      }
    }
  } catch (e: any) {
    if (process.env.BUILD === 'web') {
      console.error(e);
    } else {
      require('../log').error(e);
    }
    throw e;
  } finally {
    runningTasks.splice(runningTasks.indexOf(hash), 1);
  }
};

export { taskRunner };