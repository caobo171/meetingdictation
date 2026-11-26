import Link from 'next/link';

import { auth } from '@/auth';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';

/** The public site's top bar: the landing page, the blog and the privacy page. */
export async function SiteHeader({ blogHref = '/blog' }: { blogHref?: string }) {
  const session = await auth();
  const signedIn = !!session?.user;
  return (
    <>
    <AnnouncementBanner audience="public" />
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="MeetingDictation home">
          <Logo size={26} />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={blogHref}>Blog</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <Link href="/app/extension">Extension</Link>
          </Button>
          {signedIn ? (
            <Button asChild size="sm">
              <Link href="/app">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
    </>
  );
}

export function SiteFooter({ blogHref = '/blog' }: { blogHref?: string }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:px-6">
        <Logo size={20} />
        <span className="flex flex-wrap items-center gap-4">
          <Link className="hover:text-foreground" href={blogHref}>
            Blog
          </Link>
          <Link className="hover:text-foreground" href="/app/extension">
            Extension
          </Link>
          <Link className="hover:text-foreground" href="/privacy">
            Privacy
          </Link>
          <span>© {new Date().getFullYear()} MeetingDictation</span>
        </span>
      </div>
    </footer>
  );
}
