import { ApiClient } from '@twurple/api';
import { StaticAuthProvider } from '@twurple/auth';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class updateRewardsToIds1651671003485 implements MigrationInterface {
  name = 'updateRewardsToIds1651671003485';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const accessToken = (await queryRunner.query(`SELECT * from settings `)).find((o: any) => {
      return o.namespace === '/services/twitch' && o.name === 'broadcasterAccessToken';
    })?.value;
    const broadcasterId = (await queryRunner.query(`SELECT * from settings `)).find((o: any) => {
      return o.namespace === '/services/twitch' && o.name === 'broadcasterId';
    })?.value;
    const clientId = (await queryRunner.query(`SELECT * from settings `)).find((o: any) => {
      return o.namespace === '/services/twitch' && o.name === 'broadcasterClientId';
    })?.value;

    if (!accessToken || !clientId || !broadcasterId) {
      console.log('Missing broadcaster access token or client ID or broadcaster ID');
      return;
    }

    try {
      const authProvider = new StaticAuthProvider(JSON.parse<string>(clientId), JSON.parse<string>(accessToken));
      const client = new ApiClient({ authProvider });
      const rewardsList = await client.channelPoints.getCustomRewards(JSON.parse<string>(broadcasterId));

      const rewardAlerts = await queryRunner.query(`SELECT * from "alert_reward_redeem"`);
      for (const alert of rewardAlerts) {
        const reward = rewardsList.find(o => o.title === alert.rewardId);
        if (reward) {
          console.log(`Changing reward name ${alert.rewardId} to ${reward.id}`);
          await queryRunner.query(`UPDATE "alert_reward_redeem" SET "rewardId"='${reward.id}' WHERE "id"='${alert.id}'`);
        }
      }

      const events = await queryRunner.query(`SELECT * from "event"`);
      for (const event of events) {
        if (event.name === 'reward-redeemed') {
          let definitions = JSON.parse<any>(event.definitions);
          const reward = rewardsList.find(o => o.title === definitions.titleOfReward);

          if (reward) {
            console.log(`Changing reward name titleOfReward ${definitions.titleOfReward} to rewardId ${reward.id}`);
            definitions = { rewardId: reward.id };
            await queryRunner.query(`UPDATE "event" SET "definitions"='${JSON.stringify(definitions)}' WHERE "id"='${event.id}'`);
          }
        }
      }
    } catch (e) {
      console.log('If migration failed due to invalid token, please start up previous version (wait for full startup) and then proceed to upgrade again.');
      throw e;
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return;
  }

}
