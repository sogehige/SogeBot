import { template } from '../template';

import type { Node } from '~/../d.ts/src/plugins';
import { sendMessage } from '~/helpers/commons/sendMessage';

export default async function(pluginId: string, currentNode: Node, parameters: Record<string, any>, variablesArg: Record<string, any>, userstate: ChatUser) {
  const message = await template(currentNode.data.value, { parameters, ...variablesArg }, userstate);
  sendMessage(message, userstate, { parameters, ...variablesArg });
  return true;
}