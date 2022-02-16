import { OverlayMapperEmotesCombo } from '@entity/overlay';
import {
  Field, ID, ObjectType,
} from 'type-graphql';

import { OverlayEmotesComboOptionsObject } from './OverlayEmotesComboOptionsObject';

@ObjectType()
export class OverlayEmotesComboObject implements OverlayMapperEmotesCombo {
  @Field(type => ID)
    id: string;
  @Field(type => String, { nullable: true })
    groupId: string | null;
  @Field()
    value: 'emotescombo';
  @Field(type => OverlayEmotesComboOptionsObject, { nullable: true })
    opts: OverlayMapperEmotesCombo['opts'];
}