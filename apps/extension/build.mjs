import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: { content: 'src/content.ts', background: 'src/background.ts', connect: 'src/connect.content.ts', frame: 'src/frame.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife', // content scripts are not ES modules
  target: 'chrome110',
  logLevel: 'info',
  jsx: 'automatic',
  minify: !watch, // React makes the content script ~560 KB unminified; it loads on every Loom / YouTube page
  define: {
    __MD_APP_URL__: JSON.stringify(process.env.MD_APP_URL ?? 'http://localhost:4100'),
    'process.env.NODE_ENV': '"production"', // React's production build
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
