import { MigrationInterface, QueryRunner } from 'typeorm';

// npx typeorm migration:generate -d dest/database.js sqlite
export class initialize1000000000001 implements MigrationInterface {
  name = 'initialize1000000000001';

  public async up(queryRunner: QueryRunner): Promise<any> {
    const migrations = await queryRunner.query(`SELECT * FROM "migrations"`);
    if (migrations.length > 0) {
      console.log('Skipping migration zero, migrations are already in bot');
    }
    await queryRunner.query(`CREATE TABLE "alias" ("id" varchar PRIMARY KEY NOT NULL, "alias" varchar NOT NULL, "command" text NOT NULL, "enabled" boolean NOT NULL, "visible" boolean NOT NULL, "permission" varchar, "group" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_6a8a594f0a5546f8082b0c405c" ON "alias" ("alias") `);
    await queryRunner.query(`CREATE TABLE "alias_group" ("name" varchar PRIMARY KEY NOT NULL, "options" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_alias_group_unique_name" ON "alias_group" ("name") `);
    await queryRunner.query(`CREATE TABLE "alert" ("id" varchar PRIMARY KEY NOT NULL, "updatedAt" varchar(30), "name" varchar NOT NULL, "alertDelayInMs" integer NOT NULL, "profanityFilterType" varchar NOT NULL, "loadStandardProfanityList" text NOT NULL, "parry" text NOT NULL, "tts" text, "fontMessage" text NOT NULL, "font" text NOT NULL, "customProfanityList" varchar NOT NULL, "items" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "bets" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" varchar(30) NOT NULL, "endedAt" varchar(30) NOT NULL, "isLocked" boolean NOT NULL DEFAULT (0), "arePointsGiven" boolean NOT NULL DEFAULT (0), "options" text NOT NULL, "title" varchar NOT NULL, "participants" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "commands" ("id" varchar PRIMARY KEY NOT NULL, "command" varchar NOT NULL, "enabled" boolean NOT NULL, "visible" boolean NOT NULL, "group" varchar, "areResponsesRandomized" boolean NOT NULL DEFAULT (0), "responses" text NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_1a8c40f0a581447776c325cb4f" ON "commands" ("command") `);
    await queryRunner.query(`CREATE TABLE "commands_group" ("name" varchar PRIMARY KEY NOT NULL, "options" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_commands_group_unique_name" ON "commands_group" ("name") `);
    await queryRunner.query(`CREATE TABLE "commands_count" ("id" varchar PRIMARY KEY NOT NULL, "command" varchar NOT NULL, "timestamp" varchar(30) NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_2ccf816b1dd74e9a02845c4818" ON "commands_count" ("command") `);
    await queryRunner.query(`CREATE TABLE "cooldown" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "miliseconds" integer NOT NULL, "type" varchar(10) NOT NULL, "timestamp" varchar(30) NOT NULL, "isEnabled" boolean NOT NULL, "isErrorMsgQuiet" boolean NOT NULL, "isOwnerAffected" boolean NOT NULL, "isModeratorAffected" boolean NOT NULL, "isSubscriberAffected" boolean NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_aa85aa267ec6eaddf7f93e3665" ON "cooldown" ("name") `);
    await queryRunner.query(`CREATE TABLE "highlight" ("id" varchar PRIMARY KEY NOT NULL, "videoId" varchar NOT NULL, "game" varchar NOT NULL, "title" varchar NOT NULL, "expired" boolean NOT NULL DEFAULT (0), "timestamp" text NOT NULL, "createdAt" varchar(30) NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "how_long_to_beat_game" ("id" varchar PRIMARY KEY NOT NULL, "game" varchar NOT NULL, "startedAt" varchar(30) NOT NULL, "updatedAt" varchar(30) NOT NULL, "gameplayMain" float NOT NULL DEFAULT (0), "gameplayMainExtra" float NOT NULL DEFAULT (0), "gameplayCompletionist" float NOT NULL DEFAULT (0), "offset" bigint NOT NULL DEFAULT (0), "streams" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_301758e0e3108fc902d5436527" ON "how_long_to_beat_game" ("game") `);
    await queryRunner.query(`CREATE TABLE "keyword" ("id" varchar PRIMARY KEY NOT NULL, "keyword" varchar NOT NULL, "enabled" boolean NOT NULL, "group" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_35e3ff88225eef1d85c951e229" ON "keyword" ("keyword") `);
    await queryRunner.query(`CREATE TABLE "keyword_responses" ("id" varchar PRIMARY KEY NOT NULL, "order" integer NOT NULL, "response" text NOT NULL, "stopIfExecuted" boolean NOT NULL, "permission" varchar, "filter" varchar NOT NULL, "keywordId" varchar)`);
    await queryRunner.query(`CREATE TABLE "keyword_group" ("name" varchar PRIMARY KEY NOT NULL, "options" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_keyword_group_unique_name" ON "keyword_group" ("name") `);
    await queryRunner.query(`CREATE TABLE "overlay" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "canvas" text NOT NULL, "items" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "obswebsocket" ("id" varchar(14) PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "code" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "permissions" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "order" integer NOT NULL, "isCorePermission" boolean NOT NULL, "isWaterfallAllowed" boolean NOT NULL, "automation" varchar(12) NOT NULL, "userIds" text NOT NULL, "excludeUserIds" text NOT NULL, "filters" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "permission_commands" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "permission" varchar(36))`);
    await queryRunner.query(`CREATE INDEX "IDX_ba6483f5c5882fa15299f22c0a" ON "permission_commands" ("name") `);
    await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d8a83b9ffce680092c8dfee37d" ON "settings" ("namespace", "name") `);
    await queryRunner.query(`CREATE TABLE "plugin" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "enabled" boolean NOT NULL, "workflow" text NOT NULL, "settings" text)`);
    await queryRunner.query(`CREATE TABLE "plugin_variable" ("variableName" varchar NOT NULL, "pluginId" varchar NOT NULL, "value" text NOT NULL, PRIMARY KEY ("variableName", "pluginId"))`);
    await queryRunner.query(`CREATE TABLE "poll" ("id" varchar PRIMARY KEY NOT NULL, "type" varchar(7) NOT NULL, "title" varchar NOT NULL, "openedAt" varchar(30) NOT NULL, "closedAt" varchar(30), "options" text NOT NULL, "votes" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "price" ("id" varchar PRIMARY KEY NOT NULL, "command" varchar NOT NULL, "enabled" boolean NOT NULL DEFAULT (1), "emitRedeemEvent" boolean NOT NULL DEFAULT (0), "price" integer NOT NULL, "priceBits" integer NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d12db23d28020784096bcb41a3" ON "price" ("command") `);
    await queryRunner.query(`CREATE TABLE "quotes" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tags" text NOT NULL, "quote" varchar NOT NULL, "quotedBy" varchar NOT NULL, "createdAt" varchar(30) NOT NULL DEFAULT ('1970-01-01T00:00:00.000Z'))`);
    await queryRunner.query(`CREATE TABLE "rank" ("id" varchar PRIMARY KEY NOT NULL, "value" integer NOT NULL, "rank" varchar NOT NULL, "type" varchar NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_93c78c94804a13befdace81904" ON "rank" ("type", "value") `);
    await queryRunner.query(`CREATE TABLE "randomizer" ("id" varchar PRIMARY KEY NOT NULL, "items" text NOT NULL, "createdAt" varchar(30) NOT NULL, "command" varchar NOT NULL, "permissionId" varchar NOT NULL, "name" varchar NOT NULL, "isShown" boolean NOT NULL DEFAULT (0), "shouldPlayTick" boolean NOT NULL, "tickVolume" integer NOT NULL, "widgetOrder" integer NOT NULL, "type" varchar(20) NOT NULL DEFAULT ('simple'), "position" text NOT NULL, "customizationFont" text NOT NULL, "tts" text NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_randomizer_cmdunique" ON "randomizer" ("command") `);
    await queryRunner.query(`CREATE TABLE "song_ban" ("videoId" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "song_playlist" ("videoId" varchar PRIMARY KEY NOT NULL, "lastPlayedAt" varchar(30) NOT NULL DEFAULT ('1970-01-01T00:00:00.000Z'), "title" varchar NOT NULL, "seed" float NOT NULL, "loudness" float NOT NULL, "tags" text NOT NULL, "length" integer NOT NULL, "volume" integer NOT NULL, "startTime" integer NOT NULL, "endTime" integer NOT NULL, "forceVolume" boolean NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE TABLE "song_request" ("id" varchar PRIMARY KEY NOT NULL, "videoId" varchar NOT NULL, "addedAt" varchar(30) NOT NULL, "title" varchar NOT NULL, "loudness" float NOT NULL, "length" integer NOT NULL, "username" varchar NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "spotify_song_ban" ("spotifyUri" varchar PRIMARY KEY NOT NULL, "title" varchar NOT NULL, "artists" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "timer" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "isEnabled" boolean NOT NULL, "tickOffline" boolean NOT NULL DEFAULT (0), "triggerEveryMessage" integer NOT NULL, "triggerEverySecond" integer NOT NULL, "triggeredAtTimestamp" varchar(30) NOT NULL DEFAULT ('1970-01-01T00:00:00.000Z'), "triggeredAtMessages" integer NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE TABLE "timer_response" ("id" varchar PRIMARY KEY NOT NULL, "timestamp" varchar(30) NOT NULL DEFAULT ('1970-01-01T00:00:00.000Z'), "isEnabled" boolean NOT NULL DEFAULT (1), "response" text NOT NULL, "timerId" varchar)`);
    await queryRunner.query(`CREATE TABLE "variable_watch" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "variableId" varchar NOT NULL, "order" integer NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "variable" ("id" varchar PRIMARY KEY NOT NULL, "history" text NOT NULL, "urls" text NOT NULL, "variableName" varchar NOT NULL, "description" varchar NOT NULL DEFAULT (''), "type" varchar NOT NULL, "currentValue" varchar, "evalValue" text NOT NULL, "runEvery" integer NOT NULL DEFAULT (60000), "responseType" integer NOT NULL, "responseText" varchar NOT NULL DEFAULT (''), "permission" varchar NOT NULL, "readOnly" boolean NOT NULL DEFAULT (0), "usableOptions" text NOT NULL, "runAt" varchar(30) NOT NULL, CONSTRAINT "UQ_dd084634ad76dbefdca837b8de4" UNIQUE ("variableName"))`);
    await queryRunner.query(`CREATE TABLE "cache_games" ("id" integer PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "thumbnail" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_f37be3c66dbd449a8cb4fe7d59" ON "cache_games" ("name") `);
    await queryRunner.query(`CREATE TABLE "cache_titles" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "game" varchar NOT NULL, "title" varchar NOT NULL, "tags" text NOT NULL, "timestamp" bigint NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_a0c6ce833b5b3b13325e6f49b0" ON "cache_titles" ("game") `);
    await queryRunner.query(`CREATE TABLE "carousel" ("id" varchar PRIMARY KEY NOT NULL, "order" integer NOT NULL, "type" varchar NOT NULL, "waitAfter" integer NOT NULL, "waitBefore" integer NOT NULL, "duration" integer NOT NULL, "animationIn" varchar NOT NULL, "animationInDuration" integer NOT NULL, "animationOut" varchar NOT NULL, "animationOutDuration" integer NOT NULL, "showOnlyOncePerStream" boolean NOT NULL, "base64" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "checklist" ("id" varchar PRIMARY KEY NOT NULL, "isCompleted" boolean NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "quickaction" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "order" integer NOT NULL, "type" varchar NOT NULL, "options" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "discord_link" ("id" varchar PRIMARY KEY NOT NULL, "tag" varchar NOT NULL, "discordId" varchar NOT NULL, "createdAt" bigint NOT NULL, "userId" varchar)`);
    await queryRunner.query(`CREATE TABLE "duel" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "tickets" integer NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "event" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "isEnabled" boolean NOT NULL, "triggered" text NOT NULL, "definitions" text NOT NULL, "filter" varchar NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_b535fbe8ec6d832dde22065ebd" ON "event" ("name") `);
    await queryRunner.query(`CREATE TABLE "event_operation" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "definitions" text NOT NULL, "eventId" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_daf6b97e1e5a5c779055fbb22d" ON "event_operation" ("name") `);
    await queryRunner.query(`CREATE TABLE "event_list" ("id" varchar PRIMARY KEY NOT NULL, "event" varchar NOT NULL, "userId" varchar NOT NULL, "timestamp" bigint NOT NULL, "isTest" boolean NOT NULL, "isHidden" boolean NOT NULL DEFAULT (0), "values_json" text NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_8a80a3cf6b2d815920a390968a" ON "event_list" ("userId") `);
    await queryRunner.query(`CREATE TABLE "gallery" ("id" varchar PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "data" text NOT NULL, "name" varchar NOT NULL, "folder" varchar NOT NULL DEFAULT ('/'))`);
    await queryRunner.query(`CREATE TABLE "goal_group" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" varchar NOT NULL, "name" varchar NOT NULL, "display" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "goal" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "groupId" varchar, "type" varchar(20) NOT NULL, "countBitsAsTips" boolean NOT NULL, "display" varchar(20) NOT NULL, "timestamp" varchar, "interval" varchar NOT NULL DEFAULT ('hour'), "tiltifyCampaign" integer, "goalAmount" float NOT NULL DEFAULT (0), "currentAmount" float NOT NULL DEFAULT (0), "endAfter" varchar NOT NULL, "endAfterIgnore" boolean NOT NULL, "customizationBar" text NOT NULL, "customizationFont" text NOT NULL, "customizationHtml" text NOT NULL, "customizationJs" text NOT NULL, "customizationCss" text NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_a1a6bd23cb8ef7ddf921f54c0b" ON "goal" ("groupId") `);
    await queryRunner.query(`CREATE TABLE "google_private_keys" ("id" varchar PRIMARY KEY NOT NULL, "clientEmail" varchar NOT NULL, "privateKey" text NOT NULL, "createdAt" varchar NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "heist_user" ("userId" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "points" bigint NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "moderation_warning" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "timestamp" bigint NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE INDEX "IDX_f941603aef2741795a9108d0d2" ON "moderation_warning" ("userId") `);
    await queryRunner.query(`CREATE TABLE "moderation_permit" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_69499e78c9ee1602baee77b97d" ON "moderation_permit" ("userId") `);
    await queryRunner.query(`CREATE TABLE "points_changelog" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "userId" varchar NOT NULL, "originalValue" integer NOT NULL, "updatedValue" integer NOT NULL, "updatedAt" bigint NOT NULL, "command" varchar NOT NULL)`);
    await queryRunner.query(`CREATE INDEX "IDX_points_changelog_userId" ON "points_changelog" ("userId") `);
    await queryRunner.query(`CREATE TABLE "queue" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "createdAt" bigint NOT NULL, "username" varchar NOT NULL, "isModerator" boolean NOT NULL, "isSubscriber" boolean NOT NULL, "message" varchar)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_7401b4e0c30f5de6621b38f7a0" ON "queue" ("username") `);
    await queryRunner.query(`CREATE TABLE "raffle" ("id" varchar PRIMARY KEY NOT NULL, "winner" text, "timestamp" bigint NOT NULL DEFAULT (0), "keyword" varchar NOT NULL, "minTickets" bigint NOT NULL DEFAULT (0), "maxTickets" bigint NOT NULL DEFAULT (0), "type" integer NOT NULL, "forSubscribers" boolean NOT NULL, "isClosed" boolean NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE INDEX "IDX_e83facaeb8fbe8b8ce9577209a" ON "raffle" ("keyword") `);
    await queryRunner.query(`CREATE INDEX "IDX_raffleIsClosed" ON "raffle" ("isClosed") `);
    await queryRunner.query(`CREATE TABLE "raffle_participant" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "tickets" integer NOT NULL, "isEligible" boolean NOT NULL, "isSubscriber" boolean NOT NULL, "raffleId" varchar)`);
    await queryRunner.query(`CREATE TABLE "raffle_participant_message" ("id" varchar PRIMARY KEY NOT NULL, "timestamp" bigint NOT NULL DEFAULT (0), "text" text NOT NULL, "participantId" varchar)`);
    await queryRunner.query(`CREATE TABLE "scrim_match_id" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "matchId" varchar NOT NULL)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_5af6da125c1745151e0dfaf087" ON "scrim_match_id" ("username") `);
    await queryRunner.query(`CREATE TABLE "text" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "text" text NOT NULL, "css" text NOT NULL, "js" text NOT NULL, "external" text NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "translation" ("name" varchar PRIMARY KEY NOT NULL, "value" varchar NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "twitch_stats" ("whenOnline" bigint PRIMARY KEY NOT NULL, "currentViewers" integer NOT NULL DEFAULT (0), "currentSubscribers" integer NOT NULL DEFAULT (0), "chatMessages" bigint NOT NULL, "currentFollowers" integer NOT NULL DEFAULT (0), "maxViewers" integer NOT NULL DEFAULT (0), "newChatters" integer NOT NULL DEFAULT (0), "currentBits" bigint NOT NULL, "currentTips" float NOT NULL, "currentWatched" bigint NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "twitch_clips" ("clipId" varchar PRIMARY KEY NOT NULL, "isChecked" boolean NOT NULL, "shouldBeCheckedAt" bigint NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "user" ("userId" varchar PRIMARY KEY NOT NULL, "userName" varchar NOT NULL, "displayname" varchar NOT NULL DEFAULT (''), "profileImageUrl" varchar NOT NULL DEFAULT (''), "isOnline" boolean NOT NULL DEFAULT (0), "isVIP" boolean NOT NULL DEFAULT (0), "isModerator" boolean NOT NULL DEFAULT (0), "isSubscriber" boolean NOT NULL DEFAULT (0), "haveSubscriberLock" boolean NOT NULL DEFAULT (0), "haveSubscribedAtLock" boolean NOT NULL DEFAULT (0), "rank" varchar NOT NULL DEFAULT (''), "haveCustomRank" boolean NOT NULL DEFAULT (0), "subscribedAt" varchar(30), "seenAt" varchar(30), "createdAt" varchar(30), "watchedTime" bigint NOT NULL DEFAULT (0), "chatTimeOnline" bigint NOT NULL DEFAULT (0), "chatTimeOffline" bigint NOT NULL DEFAULT (0), "points" bigint NOT NULL DEFAULT (0), "pointsOnlineGivenAt" bigint NOT NULL DEFAULT (0), "pointsOfflineGivenAt" bigint NOT NULL DEFAULT (0), "pointsByMessageGivenAt" bigint NOT NULL DEFAULT (0), "subscribeTier" varchar NOT NULL DEFAULT ('0'), "subscribeCumulativeMonths" integer NOT NULL DEFAULT (0), "subscribeStreak" integer NOT NULL DEFAULT (0), "giftedSubscribes" bigint NOT NULL DEFAULT (0), "messages" bigint NOT NULL DEFAULT (0), "extra" text)`);
    await queryRunner.query(`CREATE INDEX "IDX_78a916df40e02a9deb1c4b75ed" ON "user" ("userName") `);
    await queryRunner.query(`CREATE TABLE "user_tip" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "amount" float NOT NULL, "sortAmount" float NOT NULL, "exchangeRates" text NOT NULL, "currency" varchar NOT NULL, "message" text NOT NULL, "tippedAt" bigint NOT NULL DEFAULT (0), "userId" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_user_tip_userId" ON "user_tip" ("userId") `);
    await queryRunner.query(`CREATE TABLE "user_bit" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "amount" bigint NOT NULL, "message" text NOT NULL, "cheeredAt" bigint NOT NULL DEFAULT (0), "userId" varchar)`);
    await queryRunner.query(`CREATE INDEX "IDX_user_bit_userId" ON "user_bit" ("userId") `);
    await queryRunner.query(`CREATE TABLE "widget_custom" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "url" varchar NOT NULL, "name" varchar NOT NULL)`);
    await queryRunner.query(`CREATE TABLE "widget_social" ("id" varchar PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "hashtag" varchar NOT NULL, "text" text NOT NULL, "username" varchar NOT NULL, "displayname" varchar NOT NULL, "url" varchar NOT NULL, "timestamp" bigint NOT NULL DEFAULT (0))`);
    await queryRunner.query(`CREATE TABLE "temporary_keyword_responses" ("id" varchar PRIMARY KEY NOT NULL, "order" integer NOT NULL, "response" text NOT NULL, "stopIfExecuted" boolean NOT NULL, "permission" varchar, "filter" varchar NOT NULL, "keywordId" varchar, CONSTRAINT "FK_d12716a3805d58dd75ab09c8c67" FOREIGN KEY ("keywordId") REFERENCES "keyword" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_keyword_responses"("id", "order", "response", "stopIfExecuted", "permission", "filter", "keywordId") SELECT "id", "order", "response", "stopIfExecuted", "permission", "filter", "keywordId" FROM "keyword_responses"`);
    await queryRunner.query(`DROP TABLE "keyword_responses"`);
    await queryRunner.query(`ALTER TABLE "temporary_keyword_responses" RENAME TO "keyword_responses"`);
    await queryRunner.query(`CREATE TABLE "temporary_timer_response" ("id" varchar PRIMARY KEY NOT NULL, "timestamp" varchar(30) NOT NULL DEFAULT ('1970-01-01T00:00:00.000Z'), "isEnabled" boolean NOT NULL DEFAULT (1), "response" text NOT NULL, "timerId" varchar, CONSTRAINT "FK_3192b176b66d4375368c9e960de" FOREIGN KEY ("timerId") REFERENCES "timer" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_timer_response"("id", "timestamp", "isEnabled", "response", "timerId") SELECT "id", "timestamp", "isEnabled", "response", "timerId" FROM "timer_response"`);
    await queryRunner.query(`DROP TABLE "timer_response"`);
    await queryRunner.query(`ALTER TABLE "temporary_timer_response" RENAME TO "timer_response"`);
    await queryRunner.query(`DROP INDEX "IDX_daf6b97e1e5a5c779055fbb22d"`);
    await queryRunner.query(`CREATE TABLE "temporary_event_operation" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "definitions" text NOT NULL, "eventId" varchar, CONSTRAINT "FK_a9f07bd7a9f0b7b9d41f48b476d" FOREIGN KEY ("eventId") REFERENCES "event" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_event_operation"("id", "name", "definitions", "eventId") SELECT "id", "name", "definitions", "eventId" FROM "event_operation"`);
    await queryRunner.query(`DROP TABLE "event_operation"`);
    await queryRunner.query(`ALTER TABLE "temporary_event_operation" RENAME TO "event_operation"`);
    await queryRunner.query(`CREATE INDEX "IDX_daf6b97e1e5a5c779055fbb22d" ON "event_operation" ("name") `);
    await queryRunner.query(`DROP INDEX "IDX_a1a6bd23cb8ef7ddf921f54c0b"`);
    await queryRunner.query(`CREATE TABLE "temporary_goal" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL, "groupId" varchar, "type" varchar(20) NOT NULL, "countBitsAsTips" boolean NOT NULL, "display" varchar(20) NOT NULL, "timestamp" varchar, "interval" varchar NOT NULL DEFAULT ('hour'), "tiltifyCampaign" integer, "goalAmount" float NOT NULL DEFAULT (0), "currentAmount" float NOT NULL DEFAULT (0), "endAfter" varchar NOT NULL, "endAfterIgnore" boolean NOT NULL, "customizationBar" text NOT NULL, "customizationFont" text NOT NULL, "customizationHtml" text NOT NULL, "customizationJs" text NOT NULL, "customizationCss" text NOT NULL, CONSTRAINT "FK_a1a6bd23cb8ef7ddf921f54c0bb" FOREIGN KEY ("groupId") REFERENCES "goal_group" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_goal"("id", "name", "groupId", "type", "countBitsAsTips", "display", "timestamp", "interval", "tiltifyCampaign", "goalAmount", "currentAmount", "endAfter", "endAfterIgnore", "customizationBar", "customizationFont", "customizationHtml", "customizationJs", "customizationCss") SELECT "id", "name", "groupId", "type", "countBitsAsTips", "display", "timestamp", "interval", "tiltifyCampaign", "goalAmount", "currentAmount", "endAfter", "endAfterIgnore", "customizationBar", "customizationFont", "customizationHtml", "customizationJs", "customizationCss" FROM "goal"`);
    await queryRunner.query(`DROP TABLE "goal"`);
    await queryRunner.query(`ALTER TABLE "temporary_goal" RENAME TO "goal"`);
    await queryRunner.query(`CREATE INDEX "IDX_a1a6bd23cb8ef7ddf921f54c0b" ON "goal" ("groupId") `);
    await queryRunner.query(`CREATE TABLE "temporary_raffle_participant" ("id" varchar PRIMARY KEY NOT NULL, "username" varchar NOT NULL, "tickets" integer NOT NULL, "isEligible" boolean NOT NULL, "isSubscriber" boolean NOT NULL, "raffleId" varchar, CONSTRAINT "FK_bc112542267bdd487f4479a94a1" FOREIGN KEY ("raffleId") REFERENCES "raffle" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_raffle_participant"("id", "username", "tickets", "isEligible", "isSubscriber", "raffleId") SELECT "id", "username", "tickets", "isEligible", "isSubscriber", "raffleId" FROM "raffle_participant"`);
    await queryRunner.query(`DROP TABLE "raffle_participant"`);
    await queryRunner.query(`ALTER TABLE "temporary_raffle_participant" RENAME TO "raffle_participant"`);
    await queryRunner.query(`CREATE TABLE "temporary_raffle_participant_message" ("id" varchar PRIMARY KEY NOT NULL, "timestamp" bigint NOT NULL DEFAULT (0), "text" text NOT NULL, "participantId" varchar, CONSTRAINT "FK_e6eda53bcd6ceb62b5edd9e02b5" FOREIGN KEY ("participantId") REFERENCES "raffle_participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE)`);
    await queryRunner.query(`INSERT INTO "temporary_raffle_participant_message"("id", "timestamp", "text", "participantId") SELECT "id", "timestamp", "text", "participantId" FROM "raffle_participant_message"`);
    await queryRunner.query(`DROP TABLE "raffle_participant_message"`);
    await queryRunner.query(`ALTER TABLE "temporary_raffle_participant_message" RENAME TO "raffle_participant_message"`);

    await queryRunner.query(`DROP INDEX "IDX_d8a83b9ffce680092c8dfee37d"`);
    await queryRunner.query(`CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY NOT NULL, "namespace" varchar NOT NULL, "name" varchar NOT NULL, "value" text NOT NULL)`);
    await queryRunner.query(`INSERT INTO "temporary_settings"("id", "namespace", "name", "value") SELECT "id", "namespace", "name", "value" FROM "settings"`);
    await queryRunner.query(`DROP TABLE "settings"`);
    await queryRunner.query(`ALTER TABLE "temporary_settings" RENAME TO "settings"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_d8a83b9ffce680092c8dfee37d" ON "settings" ("namespace", "name") `);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    return;
  }

}
