import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { content: 'src/content.ts', background: 'src/background.ts', connect: 'src/connect.content.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife', // content scripts are not ES modules
  target: 'chrome110',
  logLevel: 'info',
  define: { __MD_APP_URL__: JSON.stringify(process.env.MD_APP_URL ?? 'http://localhost:4100') },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
