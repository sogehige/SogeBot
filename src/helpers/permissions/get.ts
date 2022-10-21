import { Permissions } from '@entity/permissions';

async function get(identifier: string): Promise<Permissions | undefined> {
  const uuidRegex = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
  if (identifier.search(uuidRegex) >= 0) {
    return Permissions.findOne({ id: identifier });
  } else {
    // get first name-like
    return (await Permissions.find()).find((o) => {
      return o.name.toLowerCase() === identifier.toLowerCase();
    }) || undefined;
  }
}

export { get };