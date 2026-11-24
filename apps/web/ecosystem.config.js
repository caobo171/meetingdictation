// PM2 process for the website. Secrets stay in apps/web/.env (gitignored),
// which Next loads at start; nothing secret belongs in this file.
//
// npm workspaces hoist `next` to the repo root, so the script path climbs
// two levels from apps/web.
module.exports = {
  apps: [
    {
      name: 'meetingdictation.web',
      cwd: __dirname,
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -p 4100 -H 127.0.0.1',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4100,
      },
      max_memory_restart: '768M',
      time: true,
    },
  ],
};
