import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import './globals.css';

const inter = Inter({ subsets: ['latin', 'vietnamese'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'MeetingDictation: practise listening on real meetings', template: '%s · MeetingDictation' },
  description:
    'Turn any recorded meeting (Loom, YouTube, Zoom, Teams, Meet) into dictation practice. Blur the transcript, listen one sentence at a time, type what you hear.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Ship or Die hackathon site verification. */}
        <script defer src="https://www.ship-or-die.com/hackathon/verify.js" data-site="0fa79dc4ee3a5766f1e26c743718d75a606c931c" />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
