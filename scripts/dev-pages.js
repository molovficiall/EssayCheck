const { spawnSync } = require('child_process');

const databaseId = process.env.D1_DATABASE_ID;
if (!databaseId || !/^[0-9a-f-]{36}$/i.test(databaseId)) {
  console.error('Set D1_DATABASE_ID to your D1 database ID before starting local Pages development.');
  process.exit(1);
}

const args = ['wrangler', 'pages', 'dev', 'dist', '--d1', `DB=${databaseId}`, '--r2=MEDIA'];
const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
