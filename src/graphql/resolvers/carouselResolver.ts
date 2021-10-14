import { Carousel, CarouselInterface } from '@entity/carousel';
import {
  Arg, Authorized, Mutation, Query, Resolver,
} from 'type-graphql';
import { getRepository } from 'typeorm';

import { CarouselObject } from '../schema/carousel/carouselObject';

@Resolver()
export class CarouselResolver {
  @Query(returns => [CarouselObject])
  async carousels(@Arg('id', { nullable: true }) id: string) {
    if (id) {
      return getRepository(Carousel).find({
        where:  { id }, select: [
          'id', 'order', 'waitAfter',
          'waitBefore', 'duration',
          'animationIn', 'animationInDuration',
          'animationOut', 'animationOutDuration', 'showOnlyOncePerStream',
        ],
      });
    } else {
      return getRepository(Carousel).find({
        select: [
          'id', 'order', 'waitAfter',
          'waitBefore', 'duration',
          'animationIn', 'animationInDuration',
          'animationOut', 'animationOutDuration', 'showOnlyOncePerStream',
        ],
        order: { order: 'ASC' },
      });
    }
  }

  @Authorized()
  @Mutation(returns => String)
  async carouselUpload(
  @Arg('data') data_json: string,
  ) {
    const { base64, type } = JSON.parse(data_json);
    const order = await getRepository(Carousel).count();
    const item = await getRepository(Carousel).save({
      type,
      base64,
      // timers in ms
      waitBefore:            0,
      waitAfter:             0,
      duration:              5000,
      // animation
      animationInDuration:   1000,
      animationIn:           'fadeIn',
      animationOutDuration:  1000,
      animationOut:          'fadeOut',
      // order
      order,
      // showOnlyOncePerStream
      showOnlyOncePerStream: false,
    });
    return item.id;
  }

  @Authorized()
  @Mutation(returns => CarouselObject)
  async carouselSave(@Arg('data') data_json: string) {
    const item: CarouselInterface = JSON.parse(data_json);
    return getRepository(Carousel).save(item);
  }

  @Authorized()
  @Mutation(returns => Boolean)
  async carouselRemove(@Arg('id') id: string) {
    const item = await getRepository(Carousel).findOne({ id });
    if (item) {
      await getRepository(Carousel).remove(item);
    }
    return true;
  }
}