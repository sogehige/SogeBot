import {
  QuickAction, QuickActionInput, QuickActions, SearchResultUnion,
} from '@entity/dashboard';
import { JwtPayload } from 'jsonwebtoken';
import {
  Arg, Authorized, Ctx, Mutation, Query, Resolver,
} from 'type-graphql';
import { getRepository } from 'typeorm';

import { parserReply } from '../../commons';
import { getUserSender } from '../../helpers/commons';
import { setValueOf } from '../../helpers/customvariables/setValueOf';
import { info } from '../../helpers/log';

@Resolver()
export class QuickActionResolver {
  @Authorized()
  @Query(returns => [SearchResultUnion])
  quickAction(@Ctx('user') user: JwtPayload, @Arg('id', { nullable: true }) id?: string) {
    if (id) {
      return getRepository(QuickAction).find({ where: { userId: user.userId, id } });
    } else {
      return getRepository(QuickAction).find({ where: { userId: user.userId } });
    }
  }

  @Authorized()
  @Mutation(returns => [SearchResultUnion])
  async quickActionSave(
  @Ctx('user') user: JwtPayload,
    @Arg('data', type => QuickActionInput) data: QuickActionInput,
  ) {
    const userId = user.userId;

    if (!data) {
      return;
    }

    const items: Readonly<Required<QuickActions.Item>>[] = [];
    for(const key of Object.keys(data)) {
      if ((data as any)[key]) {
        for (const item of (data as any)[key]) {
          // get data
          if (item.order === -1) {
            item.order = await getRepository(QuickAction).count({ userId });
          }
          items.push(await getRepository(QuickAction).save({ ...item, userId }));
        }
      }
    }
    return items;
  }

  @Authorized()
  @Mutation(returns => Boolean)
  async quickActionDelete(@Arg('id') id: string) {
    await getRepository(QuickAction).delete(id);
    return true;
  }

  @Authorized()
  @Mutation(returns => Boolean)
  async quickActionTrigger(@Ctx('user') user: JwtPayload, @Arg('id') id: string, @Arg('value', { nullable: true }) value: string) {
    const item = await getRepository(QuickAction).findOneOrFail({ where: { id, userId: user.userId } });
    trigger(item, { userId: user.userId, username: user.username }, value);
    return true;
  }
}

const trigger = async (item: QuickActions.Item, user: { userId: string, username: string }, value?: string) => {
  info(`Quick Action ${item.id} triggered by ${user.username}#${user.userId}`);
  switch (item.type) {
    case 'command': {
      const parser = new (require('../../parser').default)();
      const responses = await parser.command(getUserSender(user.userId, user.username), item.options.command, true);
      for (let i = 0; i < responses.length; i++) {
        await parserReply(responses[i].response, { sender: responses[i].sender, discord: responses[i].discord, attr: responses[i].attr, id: '' });
      }

      break;
    }
    case 'customvariable': {
      setValueOf(item.options.customvariable, value, {});
      break;
    }
  }
};