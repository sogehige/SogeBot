import { getRepository, IsNull } from 'typeorm';

import client from '../api/client';

import { rawDataSymbol } from '~/../node_modules/@twurple/common/lib';
import { TwitchTag, TwitchTagLocalizationDescription, TwitchTagLocalizationName } from '~/database/entity/twitch';
import { error } from '~/helpers/log';
import { setImmediateAwait } from '~/helpers/setImmediateAwait';

export async function getAllStreamTags(opts: any) {
  opts = opts || {};
  try {
    const clientBot = await client('bot');
    const getAllStreamTagsPaginated = await clientBot.tags.getAllStreamTagsPaginated().getAll();
    for(const tag of getAllStreamTagsPaginated) {
      await setImmediateAwait();
      const localizationNames = await getRepository(TwitchTagLocalizationName).find({ tagId: tag.id });
      const localizationDescriptions = await getRepository(TwitchTagLocalizationDescription).find({ tagId: tag.id });
      await getRepository(TwitchTag).save({
        tag_id:             tag.id,
        is_auto:            tag.isAuto,
        localization_names: Object.keys(tag[rawDataSymbol].localization_names).map(key => {
          return {
            id:     localizationNames.find(o => o.locale === key && o.tagId === tag.id)?.id,
            locale: key,
            value:  tag[rawDataSymbol].localization_names[key],
          };
        }),
        localization_descriptions: Object.keys(tag[rawDataSymbol].localization_descriptions).map(key => {
          return {
            id:     localizationDescriptions.find(o => o.locale === key && o.tagId === tag.id)?.id,
            locale: key,
            value:  tag[rawDataSymbol].localization_descriptions[key],
          };
        }),
      });
    }
    await getRepository(TwitchTagLocalizationDescription).delete({ tagId: IsNull() });
    await getRepository(TwitchTagLocalizationName).delete({ tagId: IsNull() });
  } catch (e) {
    if (e instanceof Error) {
      error(e.stack ?? e.message);
    }
  }
  return { state: true, opts };

}