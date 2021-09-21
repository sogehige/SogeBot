import { SECOND } from '@sogebot/ui-helpers/constants';
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Response,
  Route,
  Security,
  SuccessResponse,
  Tags,
} from 'tsoa';
import { getRepository } from 'typeorm';

import {
  OverlayMapper, OverlayMapperAlerts, OverlayMapperClips, OverlayMapperClipsCarousel, OverlayMapperCountdown, OverlayMapperCredits, OverlayMapperEmotes, OverlayMapperEmotesCombo, OverlayMapperEmotesExplode, OverlayMapperEmotesFireworks, OverlayMapperEventlist, OverlayMapperGroup, OverlayMapperHypeTrain, OverlayMapperInterface, OverlayMapperMarathon, OverlayMapperOBSWebsocket, OverlayMapperPolls, OverlayMappers, OverlayMapperStopwatch, OverlayMapperTTS,
} from '../../database/entity/overlay';
import { isBotStarted } from '../../helpers/database.js';
import { cachedOverlays } from '../../overlays/marathon.js';

const ticks: string[] = [];

const isGroupOverlay = (o: any): o is OverlayMapperGroup => {
  return o.value === 'group';
};

setInterval(async () => {
  if (!isBotStarted) {
    return;
  }

  while(ticks.length > 0) {
    let id = ticks.shift() as string;
    let time: number | string = 1000;
    if (id.includes('|')) {
      [id, time] = id.split('|');
    }
    // check if it is without group
    const item = await getRepository(OverlayMapper).findOne({ id });
    if (item) {
      if (item.value === 'countdown' && item.opts) {
        await getRepository(OverlayMapper).update(id, {
          opts: {
            ...item.opts,
            currentTime: Number(time) > 0 ? Number(time) : item.opts.currentTime - Number(time),
          },
        });
      }else if (item.value === 'stopwatch' && item.opts) {
        await getRepository(OverlayMapper).update(id, {
          opts: {
            ...item.opts,
            currentTime: Number(time) > 0 ? Number(time) : item.opts.currentTime - Number(time),
          },
        });
      }
    } else {
      // go through groups and find id
      for(const group of await getRepository(OverlayMapper).find({ value: 'group' })) {
        if (group.value === 'group' && group.opts?.items) {
          group.opts.items.forEach((groupItem, index) => {
            if (groupItem.id === id && groupItem.type === 'countdown') {
              group.opts.items[index].opts.currentTime -= 1000;
            }else if (groupItem.id === id && groupItem.type === 'stopwatch') {
              group.opts.items[index].opts.currentTime += 1000;
            }
          });
        }

        // resave
        await getRepository(OverlayMapper).save(group);
      }
    }
  }
}, SECOND * 1);

@Route('/api/v1/overlay')
@Tags('Registries / Overlay')
export class RegistryOverlayController extends Controller {
  /**
  * Retrieves the quick actions of an authenticated user.
  */
  @Get()
  @Security('bearerAuth', [])
  public async getAll(): Promise<{ data: OverlayMappers[], paging: null}> {
    const items = await getRepository(OverlayMapper).find();
    return {
      data:   items,
      paging: null,
    };
  }
  @Response('404', 'Not Found')
  @Get('/{id}')
  public async getOne(@Path() id: string): Promise<OverlayMappers | void> {
    try {
      const item = await getRepository(OverlayMapper).findOneOrFail({ id });
      return item;
    } catch (e: any) {
      this.setStatus(404);
    }
    return;
  }

  @Post('/{id}/tick')
  public async triggerTick(@Path() id: string, @Body() millis: { time: number }): Promise<void> {
    ticks.push(`${id}|${millis.time}`);
    this.setStatus(200);
    return;
  }

  @SuccessResponse('201', 'Created')
  @Response('401', 'Unauthorized')
  @Security('bearerAuth', [])
  @Post()
  public async post(@Body() requestBody: OverlayMappers): Promise<void> {
    try {
      await getRepository(OverlayMapper).save(requestBody);
      this.setStatus(201);

    } catch (e: any) {
      this.setStatus(400);
    }
    return;
  }

  @SuccessResponse('200', 'Ok')
  @Response('401', 'Unauthorized')
  @Security('bearerAuth', [])
  @Patch('/{id}')
  public async patch(
    @Path() id: string,
      @Body() data:
      Partial<OverlayMapperGroup>
      | Partial<OverlayMapperMarathon>
      | Partial<OverlayMapperStopwatch>
      | Partial<OverlayMapperCountdown>
      | Partial<OverlayMapperHypeTrain>
      | Partial<OverlayMapperAlerts>
      | Partial<OverlayMapperEventlist>
      | Partial<OverlayMapperEmotesCombo>
      | Partial<OverlayMapperCredits>
      | Partial<OverlayMapperClips>
      | Partial<OverlayMapperEmotes>
      | Partial<OverlayMapperEmotesExplode>
      | Partial<OverlayMapperEmotesFireworks>
      | Partial<OverlayMapperClipsCarousel>
      | Partial<OverlayMapperPolls>
      | Partial<OverlayMapperInterface>
      | Partial<OverlayMapperOBSWebsocket>
      | Partial<OverlayMapperTTS>): Promise<void> {
    try {
      if (data.value === 'marathon') {
        // remove endTime from PATCH, we must not change that value with this patch
        const marathon = require('../../overlays/marathon.js').default;
        await marathon.updateCache();

        // get key
        const key = Array.from(cachedOverlays.keys()).find(o => o.includes(id));
        if (!key) {
          throw new Error();
        }
        const item = cachedOverlays.get(key);
        if (item) {
          delete (data as any).opts.endTime;
          cachedOverlays.set(key, {
            ...item,
            opts: {
              ...item.opts,
              ...data.opts,
            },
          });
          marathon.flushCache();
        }
      } else {
        if (isGroupOverlay(data) && data.opts) {
          const marathon = require('../../overlays/marathon.js').default;
          await marathon.flushCache();

          // get original values
          const orig = await getRepository(OverlayMapper).findOne(id);

          if (orig && isGroupOverlay(orig)) {
            for (const item of data.opts.items.filter(o => o.type === 'marathon')) {
              // update back original values of endTime
              const found = orig.opts.items.find(o => o.id === item.id);
              if (found) {
                item.opts.endTime = found.opts.endTime;
              }
            }
            for (const item of data.opts.items.filter(o => o.type === 'stopwatch' || o.type === 'countdown')) {
              // update back original values of currentTime
              const found = orig.opts.items.find(o => o.id === item.id);
              if (found) {
                item.opts.currentTime = found.opts.currentTime;
              }
            }
          }
        }

        // normal update
        await getRepository(OverlayMapper).update({ id }, data);
        cachedOverlays.clear();
      }

      this.setStatus(200);
    } catch (e: any) {
      this.setStatus(400);
    }
    return;
  }
  @SuccessResponse('404', 'Not Found')
  @Security('bearerAuth', [])
  @Delete('/{id}')
  public async delete(@Path() id: string): Promise<void> {
    const item = await getRepository(OverlayMapper).findOne({ id });
    if (item) {
      await getRepository(OverlayMapper).remove(item);
    }
    this.setStatus(404);
    return;
  }
}