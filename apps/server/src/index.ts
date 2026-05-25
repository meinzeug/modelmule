import { buildServer } from './app.js';
export { buildServer } from './app.js';

const host = process.env.MODELMULE_HOST ?? '127.0.0.1';
const port = Number(process.env.MODELMULE_PORT ?? 43110);

async function main() {
  const { app } = await buildServer({
    configPath: process.env.MODELMULE_CONFIG_PATH,
    dbPath: process.env.MODELMULE_DB_PATH
  });

  try {
    await app.listen({ host, port });
    console.log(`ModelMule server listening on http://${host}:${port}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
