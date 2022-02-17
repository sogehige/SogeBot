import { MigrationInterface, QueryRunner } from 'typeorm';

export class updateOverlayMappers1645019207858 implements MigrationInterface {
  name = 'updateOverlayMappers1645019207858';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "overlay_mapper" ADD "groupId" character varying`);
    await queryRunner.query(`CREATE INDEX "IDX_overlay_mapper_groupId" ON "overlay_mapper" ("groupId") `);

    // remap group
    const groups = await queryRunner.query('SELECT * FROM "overlay_mapper" WHERE "value"=\'group\'');

    for (const group of groups) {
      const id = group.id;
      const opts: any = JSON.parse(group.opts);

      for (const item of opts.items) {
        const newOverlayItem = {
          id:      item.id,
          groupId: id,
          value:   item.type,
          opts:    JSON.parse(item.opts),
        };

        delete item.type;
        delete item.opts;
        delete item.__typename;
        delete item.groupId;

        await queryRunner.query('INSERT INTO "overlay_mapper"("id", "groupId", "value", "opts") VALUES($1, $2, $3, $4)',
          [newOverlayItem.id, newOverlayItem.groupId, newOverlayItem.value, newOverlayItem.opts ? JSON.stringify(newOverlayItem.opts) : null]);

      }
      await queryRunner.query('UPDATE "overlay_mapper" SET "opts"=$1 WHERE "id"=$2',
        [opts ? JSON.stringify(opts) : null, group.id]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return;
  }

}
