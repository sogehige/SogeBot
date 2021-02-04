require('dotenv').config();

const fs = require('fs');

const { createConnection, getConnectionOptions, getManager } = require('typeorm');
const argv = require('yargs') // eslint-disable-line
  .usage('node tools/backup.js')
  .example('node tools/backup.js list')
  .example('node save alerts ./backup-alerts.json')
  .example('node load alerts ./backup-alerts.json')
  .command('list', 'list of tables')
  .command('save [table] [path]', 'save backup of [table] to [path]', (yargs) => {
    yargs.demandOption(['table'], 'Please provide table to backup');
    yargs.demandOption(['path'], 'Please provide path to your backup JSON file');
    yargs.positional('table', {
      type:     'string',
      describe: 'table in database, e.g. settings, alert, etc.',
    });
    yargs.positional('path', {
      type:     'string',
      describe: '/path/to/your/backup/file.json',
    });
  })
  .command('load [table] [path]', 'load backup of [table] from [path]', (yargs) => {
    yargs.demandOption(['table'], 'Please provide table to backup');
    yargs.demandOption(['path'], 'Please provide path to your backup JSON file');
    yargs.positional('table', {
      type:     'string',
      describe: 'table in database, e.g. settings, alert, etc.',
    });
    yargs.positional('path', {
      type:     'string',
      describe: '/path/to/your/backup/file.json',
    });
  })
  .demandCommand()
  .help()
  .argv;

async function main() {
  const type = process.env.TYPEORM_CONNECTION;
  const connectionOptions = await getConnectionOptions();
  let connection;

  if (type === 'mysql' || type === 'mariadb') {
    connection = await createConnection({
      ...connectionOptions,
      synchronize:   false,
      migrationsRun: false,
      charset:       'UTF8MB4_GENERAL_CI',
    });
  } else {
    connection = await createConnection({
      ...connectionOptions,
      synchronize:   false,
      migrationsRun: false,
    });
  }

  if (argv._[0] === 'list') {
    console.log('Available tables:\n');
    const entities = await getManager().connection.entityMetadatas;
    const tables = entities
      .map(o => o.tableName);

    console.log(tables.join('\n'));
  }

  if (argv._[0] === 'save') {
    const entity = await getManager().connection.entityMetadatas.find(o => o.tableName === argv.table);
    const relations = entity.ownRelations.map(o => o.propertyName);
    const backupData = await connection.getRepository(entity.tableName).find({ relations });
    fs.writeFileSync(argv.path, JSON.stringify(backupData));
  }

  if (argv._[0] === 'load') {
    const backupData = JSON.parse(fs.readFileSync(argv.path));
    const entity = await getManager().connection.entityMetadatas.find(o => o.tableName === argv.table);
    const relations = entity.ownRelations.map(o => o.type);
    if (type === 'mysql' || type === 'mariadb') {
      await connection.getRepository(entity.tableName).query(`DELETE FROM \`${entity.tableName}\` WHERE 1=1`);
      for (const relation of relations) {
        await connection.getRepository(entity.tableName).query(`DELETE FROM \`${relation}\` WHERE 1=1`);
      }
    } else {
      await connection.getRepository(entity.tableName).query(`DELETE FROM "${entity.tableName}" WHERE 1=1`);
      for (const relation of relations) {
        await connection.getRepository(entity.tableName).query(`DELETE FROM "${relation}" WHERE 1=1`);
      }
    }
    await connection.getRepository(entity.tableName).save(backupData);
  }
}
main();