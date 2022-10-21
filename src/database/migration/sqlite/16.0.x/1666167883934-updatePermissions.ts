import { MigrationInterface, QueryRunner } from 'typeorm';
import { insertItemIntoTable } from '~/database/insertItemIntoTable';

export class updatePermissions1666167883934 implements MigrationInterface {
  name = 'updatePermissions1666167883934';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableName = 'permissions';
    const items = await queryRunner.query(`SELECT * from "${tableName}"`);
    const items2 = await queryRunner.query(`SELECT * from "permission_filters"`);

    await queryRunner.query(`DROP TABLE "permission_filters"`);
    await queryRunner.query(`DROP TABLE  "${tableName}"`);

    await queryRunner.query(`CREATE TABLE "${tableName}" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "order" integer NOT NULL, "isCorePermission" boolean NOT NULL, "isWaterfallAllowed" boolean NOT NULL, "automation" varchar(12) NOT NULL, "userIds" text NOT NULL, "excludeUserIds" text NOT NULL, "filters" text NOT NULL)`);

    for (const item of items) {
      item.filters = JSON.stringify(items2.filter((o: { permissionId: any; }) => o.permissionId === item.id));
      await insertItemIntoTable(tableName, {
        ...item,
      }, queryRunner);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    return;
  }

}
