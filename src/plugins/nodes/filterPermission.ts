import type { Node } from '~/../d.ts/src/plugins';
import { check } from '~/helpers/permissions/index';

export default async function(pluginId: string, currentNode: Node<string[]>, parameters: Record<string, any>, variables: Record<string, any>, userstate: ChatUser) {
  const permissionsAccessList = currentNode.data.value;
  let haveAccess = false;
  for (const permId of permissionsAccessList) {
    if (haveAccess) {
      break;
    }
    const status = await check(userstate.userId, permId);
    haveAccess = status.access;
  }
  return haveAccess;
}