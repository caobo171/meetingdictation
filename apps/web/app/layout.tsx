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
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
