import { MigrationInterface, QueryRunner } from 'typeorm';

export class addTTStemplate1643061611855 implements MigrationInterface {
  name = 'addTTStemplate1643061611855';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "temporary_alert_follow" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_6e7a73361ade12e7e69040a7c07" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_follow"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_follow"`);
    await queryRunner.query(`DROP TABLE "alert_follow"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_follow" RENAME TO "alert_follow"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_sub" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_52aaa81fff666f516b021774b60" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_sub"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_sub"`);
    await queryRunner.query(`DROP TABLE "alert_sub"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_sub" RENAME TO "alert_sub"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_subcommunitygift" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_5cfd9f1ade011e11fd21a2f5bee" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_subcommunitygift"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_subcommunitygift"`);
    await queryRunner.query(`DROP TABLE "alert_subcommunitygift"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_subcommunitygift" RENAME TO "alert_subcommunitygift"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_subgift" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_79f7ce25e52da9ab0085b237c52" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_subgift"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_subgift"`);
    await queryRunner.query(`DROP TABLE "alert_subgift"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_subgift" RENAME TO "alert_subgift"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_host" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_c665ba36c06d60912fdaf8bb9cc" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_host"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_host"`);
    await queryRunner.query(`DROP TABLE "alert_host"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_host" RENAME TO "alert_host"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_raid" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_aa40fffe0016d3700315f5b4c24" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_raid"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "alert_raid"`);
    await queryRunner.query(`DROP TABLE "alert_raid"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_raid" RENAME TO "alert_raid"`);
    await queryRunner.query(`CREATE TABLE "temporary_alert_command_redeem" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOut" varchar NOT NULL, "animationOutDuration" integer NOT NULL DEFAULT (2000), "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "imageOptions" text NOT NULL, "ttsTemplate" varchar NOT NULL DEFAULT ('{message}'), CONSTRAINT "FK_d118fd8e1d7f331372e95b7e235" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_alert_command_redeem"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationInDuration", "animationOut", "animationOutDuration", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationInDuration", "animationOut", "animationOutDuration", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "imageOptions" FROM "alert_command_redeem"`);
    await queryRunner.query(`DROP TABLE "alert_command_redeem"`);
    await queryRunner.query(`ALTER TABLE "temporary_alert_command_redeem" RENAME TO "alert_command_redeem"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "alert_command_redeem" RENAME TO "temporary_alert_command_redeem"`);
    await queryRunner.query(`CREATE TABLE "alert_command_redeem" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOut" varchar NOT NULL, "animationOutDuration" integer NOT NULL DEFAULT (2000), "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "imageOptions" text NOT NULL, CONSTRAINT "FK_d118fd8e1d7f331372e95b7e235" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_command_redeem"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationInDuration", "animationOut", "animationOutDuration", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationInDuration", "animationOut", "animationOutDuration", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "imageOptions" FROM "temporary_alert_command_redeem"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_command_redeem"`);
    await queryRunner.query(`ALTER TABLE "alert_raid" RENAME TO "temporary_alert_raid"`);
    await queryRunner.query(`CREATE TABLE "alert_raid" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_aa40fffe0016d3700315f5b4c24" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_raid"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_raid"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_raid"`);
    await queryRunner.query(`ALTER TABLE "alert_host" RENAME TO "temporary_alert_host"`);
    await queryRunner.query(`CREATE TABLE "alert_host" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_c665ba36c06d60912fdaf8bb9cc" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_host"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_host"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_host"`);
    await queryRunner.query(`ALTER TABLE "alert_subgift" RENAME TO "temporary_alert_subgift"`);
    await queryRunner.query(`CREATE TABLE "alert_subgift" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_79f7ce25e52da9ab0085b237c52" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_subgift"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_subgift"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_subgift"`);
    await queryRunner.query(`ALTER TABLE "alert_subcommunitygift" RENAME TO "temporary_alert_subcommunitygift"`);
    await queryRunner.query(`CREATE TABLE "alert_subcommunitygift" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_5cfd9f1ade011e11fd21a2f5bee" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_subcommunitygift"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_subcommunitygift"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_subcommunitygift"`);
    await queryRunner.query(`ALTER TABLE "alert_sub" RENAME TO "temporary_alert_sub"`);
    await queryRunner.query(`CREATE TABLE "alert_sub" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_52aaa81fff666f516b021774b60" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_sub"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_sub"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_sub"`);
    await queryRunner.query(`ALTER TABLE "alert_follow" RENAME TO "temporary_alert_follow"`);
    await queryRunner.query(`CREATE TABLE "alert_follow" ("id" varchar PRIMARY KEY NOT NULL, "alertId" varchar, "enabled" boolean NOT NULL, "title" varchar NOT NULL, "filter" text, "variantAmount" integer NOT NULL, "messageTemplate" varchar NOT NULL, "layout" varchar NOT NULL, "animationIn" varchar NOT NULL, "animationOut" varchar NOT NULL, "animationText" varchar NOT NULL, "animationTextOptions" text NOT NULL, "imageId" varchar, "soundId" varchar, "soundVolume" integer NOT NULL, "alertDurationInMs" integer NOT NULL, "alertTextDelayInMs" integer NOT NULL, "enableAdvancedMode" boolean NOT NULL, "advancedMode" text NOT NULL, "tts" text NOT NULL, "font" text, "animationInDuration" integer NOT NULL DEFAULT (2000), "animationOutDuration" integer NOT NULL DEFAULT (2000), "imageOptions" text NOT NULL, CONSTRAINT "FK_6e7a73361ade12e7e69040a7c07" FOREIGN KEY ("alertId") REFERENCES "alert" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "alert_follow"("id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions") SELECT "id", "alertId", "enabled", "title", "filter", "variantAmount", "messageTemplate", "layout", "animationIn", "animationOut", "animationText", "animationTextOptions", "imageId", "soundId", "soundVolume", "alertDurationInMs", "alertTextDelayInMs", "enableAdvancedMode", "advancedMode", "tts", "font", "animationInDuration", "animationOutDuration", "imageOptions" FROM "temporary_alert_follow"`);
    await queryRunner.query(`DROP TABLE "temporary_alert_follow"`);
  }

}
