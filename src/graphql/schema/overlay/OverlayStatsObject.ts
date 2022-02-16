import { OverlayMapperInterface } from '@entity/overlay';
import {
  Field, ID, ObjectType,
} from 'type-graphql';

@ObjectType()
export class OverlayStatsObject implements OverlayMapperInterface {
  @Field(type => ID)
    id: string;
  @Field(type => String, { nullable: true })
    groupId: string | null;
  @Field()
    value: 'stats';
  opts: null;
}