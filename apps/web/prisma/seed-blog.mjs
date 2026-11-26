// Loads the blog's categories and posts from content/blog into the database.
//
//   npm run db:seed-blog -w @md/web            create missing posts, update the ones that came from these files
//   npm run db:seed-blog -w @md/web -- --dry   parse and validate only
//
// Posts live in content/blog/<locale>/<slug>.md: a frontmatter block (one `key: value` per line, `tags` and
// `takeaways` as `  - item` lists) and a Markdown body. A post is matched by (locale, slug) and its views are kept.
// A post created or edited in the admin (source "admin") is left alone unless --force is passed, so the files never
// overwrite later edits.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'blog');
const dry = process.argv.includes('--dry');
const LOCALES = ['vi', 'en'];
const REQUIRED = ['title', 'category', 'publishedAt', 'excerpt'];

export function parsePost(source, file) {
  const m = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) throw new Error(`${file}: no frontmatter block`);
  const meta = {};
  let list = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && list) {
      meta[list].push(unquote(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!kv) throw new Error(`${file}: cannot read frontmatter line "${raw}"`);
    const [, key, value] = kv;
    if (value === '') {
      meta[key] = [];
      list = key;
    } else {
      meta[key] = unquote(value);
      list = null;
    }
  }
  for (const k of REQUIRED) if (!meta[k]) throw new Error(`${file}: missing "${k}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.publishedAt)) throw new Error(`${file}: publishedAt must be YYYY-MM-DD`);
  if (/^#\s/m.test(m[2])) throw new Error(`${file}: the body must not contain a "# " heading`);
  return { meta, body: m[2].trim() + '\n' };
}

function unquote(v) {
  const s = v.trim();
  return /^(["']).*\1$/.test(s) ? s.slice(1, -1) : s;
}

export function readingTime(markdown) {
  const words = markdown.replace(/[#*_`>|\-[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

async function main() {
  const categories = JSON.parse(readFileSync(join(root, 'categories.json'), 'utf8'));
  const posts = [];
  for (const locale of LOCALES) {
    let files = [];
    try {
      files = readdirSync(join(root, locale)).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) {
      const { meta, body } = parsePost(readFileSync(join(root, locale, f), 'utf8'), `${locale}/${f}`);
      if (!categories.some((c) => c.slug === meta.category)) throw new Error(`${locale}/${f}: unknown category "${meta.category}"`);
      posts.push({ locale, slug: f.replace(/\.md$/, ''), meta, body });
    }
  }
  console.log(`Read ${categories.length} categories and ${posts.length} posts.`);
  if (dry) return;

  const db = new PrismaClient();
  try {
    const catIds = {};
    for (const c of categories) {
      const row = await db.blogCategory.upsert({
        where: { slug: c.slug },
        update: { name: c.name, nameVi: c.nameVi ?? null, sort: c.sort ?? 0 },
        create: { slug: c.slug, name: c.name, nameVi: c.nameVi ?? null, sort: c.sort ?? 0 },
      });
      catIds[c.slug] = row.id;
    }

    let created = 0;
    let updated = 0;
    let kept = 0;
    for (const { locale, slug, meta, body } of posts) {
      // Noon UTC, so the date reads the same in Vietnam and in Europe.
      const publishedAt = new Date(`${meta.publishedAt}T12:00:00Z`);
      const data = {
        title: meta.title,
        excerpt: meta.excerpt,
        body,
        takeaways: JSON.stringify(Array.isArray(meta.takeaways) ? meta.takeaways : []),
        tags: JSON.stringify(Array.isArray(meta.tags) ? meta.tags : []),
        categoryId: catIds[meta.category],
        status: 'published',
        publishedAt,
        metaTitle: meta.metaTitle || null,
        metaDescription: meta.metaDescription || null,
        focusKeyword: meta.focusKeyword || null,
        readingTime: readingTime(body),
        source: 'file',
      };
      const existing = await db.blogPost.findUnique({ where: { locale_slug: { locale, slug } } });
      if (!existing) {
        await db.blogPost.create({ data: { locale, slug, source: 'file', ...data } });
        created++;
      } else if (existing.source !== 'file' && !process.argv.includes('--force')) {
        kept++; // created or edited in the admin
      } else {
        await db.blogPost.update({ where: { id: existing.id }, data });
        updated++;
      }
    }
    console.log(`Posts: ${created} created, ${updated} updated, ${kept} kept (edited in the admin; --force overwrites).`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
