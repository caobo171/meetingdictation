import 'server-only';

import type { BlogCategory, BlogPost, Prisma } from '@prisma/client';
import { Marked, type Tokens } from 'marked';

import { db } from '@/lib/db';

export const LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v);

export const PAGE_SIZE = 12;
export const SITE_URL = (process.env.AUTH_URL ?? 'https://meetingdictation.com').replace(/\/$/, '');

/** Interface strings of the blog, per locale. */
export const T = {
  vi: {
    language: 'Tiếng Việt',
    dateLocale: 'vi-VN',
    blog: 'Blog',
    blogTitle: 'Blog MeetingDictation: học tiếng Anh qua nghe chép chính tả',
    blogDescription:
      'Lợi ích của nghe chép chính tả, mẹo luyện nghe, lộ trình và hướng dẫn luyện tiếng Anh trên bản ghi cuộc họp, YouTube và podcast.',
    heroLabel: 'Blog',
    heroTitle: 'Học tiếng Anh bằng tai, từng câu một',
    heroBody: 'Lợi ích của nghe chép chính tả, mẹo luyện nghe và lộ trình cụ thể cho người học và người đi làm.',
    readMore: 'Đọc tiếp',
    latest: 'Bài viết mới',
    topics: 'Khám phá chủ đề',
    mostRead: 'Đọc nhiều nhất',
    minRead: (n: number) => `${n} phút đọc`,
    posts: (n: number) => `${n} bài viết`,
    search: 'Tìm bài viết…',
    searchResults: (q: string, n: number) => `${n} kết quả cho “${q}”`,
    tagResults: (tag: string, n: number) => `${n} bài viết gắn thẻ “${tag}”`,
    noResults: 'Không tìm thấy bài viết nào.',
    clear: 'Xoá bộ lọc',
    prev: 'Trước',
    next: 'Sau',
    by: 'Bởi',
    takeaways: 'Điểm chính',
    toc: 'Trong bài này',
    summarise: 'Biến bài này thành một tuần luyện tập',
    summariseBody: 'Trợ lý AI đọc bài, tóm tắt lại và đề xuất vài buổi luyện nghe bạn làm được trong tuần.',
    summariseWith: (ai: string) => `Tóm tắt với ${ai}`,
    summarisePrompt: (url: string) =>
      `Đọc bài viết ${url} rồi tóm tắt các ý chính bằng tiếng Việt và gợi ý một kế hoạch luyện nghe chép chính tả 7 ngày dựa trên bài.`,
    nextPost: 'Bài tiếp',
    prevPost: 'Bài trước',
    related: 'Bài liên quan',
    authorBio:
      'Đội MeetingDictation viết về nghe chép chính tả, luyện nghe trên bản ghi thật và cách giữ thói quen học tiếng Anh khi đi làm.',
    ctaTitle: 'Luyện nghe ngay trên cuộc họp của bạn',
    ctaBody: 'Mở một bản ghi Loom, YouTube, Zoom hay Teams, nghe từng câu và gõ lại. MeetingDictation chỉ ra đúng những từ bạn nghe sót.',
    ctaButton: 'Tạo tài khoản miễn phí',
    ctaSecondary: 'Cài tiện ích trình duyệt',
    allPosts: 'Tất cả bài viết',
    categoryTitle: (name: string) => `${name}: bài viết về học tiếng Anh qua dictation`,
    seeAll: 'Xem tất cả trong chủ đề này',
    home: 'Trang chủ',
  },
  en: {
    language: 'English',
    dateLocale: 'en-GB',
    blog: 'Blog',
    blogTitle: 'MeetingDictation blog: learn English through dictation',
    blogDescription:
      'Why dictation works, listening tips, learning paths and guides for practising English on real meetings, YouTube and podcasts.',
    heroLabel: 'Blog',
    heroTitle: 'Learn English by ear, one sentence at a time',
    heroBody: 'Why dictation works, listening tips and concrete learning paths for learners and working professionals.',
    readMore: 'Read more',
    latest: 'Latest posts',
    topics: 'Explore topics',
    mostRead: 'Most read',
    minRead: (n: number) => `${n} min read`,
    posts: (n: number) => `${n} ${n === 1 ? 'post' : 'posts'}`,
    search: 'Search posts…',
    searchResults: (q: string, n: number) => `${n} results for “${q}”`,
    tagResults: (tag: string, n: number) => `${n} posts tagged “${tag}”`,
    noResults: 'No posts found.',
    clear: 'Clear filter',
    prev: 'Previous',
    next: 'Next',
    by: 'By',
    takeaways: 'Key takeaways',
    toc: 'In this post',
    summarise: 'Turn this post into a week of practice',
    summariseBody: 'An AI assistant reads the post, sums it up and suggests a few listening sessions you can do this week.',
    summariseWith: (ai: string) => `Summarise with ${ai}`,
    summarisePrompt: (url: string) =>
      `Read ${url}, summarise the key points, and suggest a 7-day dictation practice plan based on it.`,
    nextPost: 'Next post',
    prevPost: 'Previous post',
    related: 'Related posts',
    authorBio:
      'The MeetingDictation team writes about dictation, listening practice on real recordings and keeping an English habit while you work.',
    ctaTitle: 'Practise listening on your own meetings',
    ctaBody: 'Open a Loom, YouTube, Zoom or Teams recording, hear it one sentence at a time and type it. MeetingDictation shows exactly which words you missed.',
    ctaButton: 'Create a free account',
    ctaSecondary: 'Get the browser extension',
    allPosts: 'All posts',
    categoryTitle: (name: string) => `${name}: posts on learning English through dictation`,
    seeAll: 'See all in this topic',
    home: 'Home',
  },
} satisfies Record<Locale, Record<string, unknown>>;

export function formatDate(d: Date | null, locale: Locale) {
  if (!d) return '';
  return new Intl.DateTimeFormat(T[locale].dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** "Học tiếng Anh" → "hoc-tieng-anh". */
export function slugify(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function readingTime(markdown: string) {
  const words = markdown.replace(/[#*_`>|\-[\]()]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export const categoryName = (c: Pick<BlogCategory, 'name' | 'nameVi'>, locale: Locale) =>
  (locale === 'vi' && c.nameVi) || c.name;

export const parseList = (json: string): string[] => {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

export type TocItem = { id: string; text: string; depth: number };

/**
 * Markdown to HTML. Headings get stable ids for the table of contents, links that leave the site open in a new tab,
 * and raw HTML in the source is escaped (posts are trusted, but the admin form is a textarea).
 */
export function renderMarkdown(markdown: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const used = new Map<string, number>();
  const md = new Marked({ gfm: true });
  md.use({
    renderer: {
      heading(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, { tokens, depth, text }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const plain = text.replace(/[*_`]/g, '');
        const base = slugify(plain) || 'section';
        const n = used.get(base) ?? 0;
        used.set(base, n + 1);
        const id = n ? `${base}-${n}` : base;
        if (depth === 2 || depth === 3) toc.push({ id, text: plain, depth });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, { href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const external = /^https?:\/\//.test(href) && !href.startsWith(SITE_URL);
        const t = title ? ` title="${title.replace(/"/g, '&quot;')}"` : '';
        return `<a href="${href.replace(/"/g, '%22')}"${t}${external ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
      },
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
      table(this: { parser: { parseInline: (t: Tokens.Generic[]) => string } }, token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td') =>
          `<${tag}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`;
        const rows = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>\n`;
      },
    },
  });
  const html = md.parse(markdown, { async: false });
  return { html, toc };
}

// ── Queries ──────────────────────────────────────────────────────────────────────────────────────────

/** Published and not scheduled for later. */
export const livePosts = (locale: Locale): Prisma.BlogPostWhereInput => ({
  locale,
  status: 'published',
  publishedAt: { lte: new Date() },
});

export const cardSelect = {
  id: true,
  slug: true,
  locale: true,
  title: true,
  excerpt: true,
  image: true,
  publishedAt: true,
  readingTime: true,
  views: true,
  category: { select: { slug: true, name: true, nameVi: true } },
} satisfies Prisma.BlogPostSelect;
export type PostCard = Prisma.BlogPostGetPayload<{ select: typeof cardSelect }>;

export async function listPosts(opts: { locale: Locale; page?: number; q?: string; tag?: string; categoryId?: string }) {
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.BlogPostWhereInput = { ...livePosts(opts.locale) };
  if (opts.categoryId) where.categoryId = opts.categoryId;
  if (opts.tag) where.tags = { contains: JSON.stringify(opts.tag).slice(1, -1) };
  if (opts.q) {
    where.OR = [
      { title: { contains: opts.q, mode: 'insensitive' } },
      { excerpt: { contains: opts.q, mode: 'insensitive' } },
      { tags: { contains: opts.q, mode: 'insensitive' } },
      { body: { contains: opts.q, mode: 'insensitive' } },
    ];
  }
  const [total, posts] = await Promise.all([
    db.blogPost.count({ where }),
    db.blogPost.findMany({
      where,
      select: cardSelect,
      orderBy: { publishedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { posts, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Categories with their number of live posts in this locale, empty ones left out. */
export async function categoriesWithCounts(locale: Locale) {
  const [cats, counts] = await Promise.all([
    db.blogCategory.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] }),
    db.blogPost.groupBy({ by: ['categoryId'], where: livePosts(locale), _count: true }),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c._count]));
  return cats.map((c) => ({ ...c, count: byId.get(c.id) ?? 0 })).filter((c) => c.count > 0);
}

export const popularPosts = (locale: Locale, take = 5) =>
  db.blogPost.findMany({ where: livePosts(locale), select: cardSelect, orderBy: [{ views: 'desc' }, { publishedAt: 'desc' }], take });

/** Locales that have at least one live post. */
export async function activeLocales(): Promise<Locale[]> {
  const rows = await db.blogPost.groupBy({
    by: ['locale'],
    where: { status: 'published', publishedAt: { lte: new Date() } },
  });
  return LOCALES.filter((l) => rows.some((r) => r.locale === l));
}

export async function getPost(locale: Locale, slug: string) {
  return db.blogPost.findFirst({ where: { ...livePosts(locale), slug }, include: { category: true } });
}

export async function postNeighbours(post: Pick<BlogPost, 'id' | 'locale' | 'publishedAt' | 'categoryId'>) {
  const locale = post.locale as Locale;
  const at = post.publishedAt ?? new Date();
  const [older, newer, related] = await Promise.all([
    db.blogPost.findFirst({ where: { ...livePosts(locale), publishedAt: { lt: at } }, select: cardSelect, orderBy: { publishedAt: 'desc' } }),
    db.blogPost.findFirst({ where: { ...livePosts(locale), publishedAt: { gt: at, lte: new Date() } }, select: cardSelect, orderBy: { publishedAt: 'asc' } }),
    db.blogPost.findMany({
      where: { ...livePosts(locale), id: { not: post.id }, categoryId: post.categoryId ?? undefined },
      select: cardSelect,
      orderBy: { publishedAt: 'desc' },
      take: 3,
    }),
  ]);
  return { older, newer, related };
}
