import {MigrationInterface, QueryRunner} from 'typeorm';

export class variableSchemaUpdate1578015076091 implements MigrationInterface {
  name = 'variableSchemaUpdate1578015076091';

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "variable_history" DROP CONSTRAINT "FK_94d39c77652e9c332751a0cee02"`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_url" DROP CONSTRAINT "FK_806e97dff1efce7f8872b6d4500"`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_history" ADD CONSTRAINT "FK_94d39c77652e9c332751a0cee02" FOREIGN KEY ("variableId") REFERENCES "variable"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_url" ADD CONSTRAINT "FK_806e97dff1efce7f8872b6d4500" FOREIGN KEY ("variableId") REFERENCES "variable"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`, undefined);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`ALTER TABLE "variable_url" DROP CONSTRAINT "FK_806e97dff1efce7f8872b6d4500"`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_history" DROP CONSTRAINT "FK_94d39c77652e9c332751a0cee02"`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_url" ADD CONSTRAINT "FK_806e97dff1efce7f8872b6d4500" FOREIGN KEY ("variableId") REFERENCES "variable"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
    await queryRunner.query(`ALTER TABLE "variable_history" ADD CONSTRAINT "FK_94d39c77652e9c332751a0cee02" FOREIGN KEY ("variableId") REFERENCES "variable"("id") ON DELETE CASCADE ON UPDATE CASCADE`, undefined);
  }

}
