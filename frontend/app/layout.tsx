import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zoom Workplace',
  description:
    'Zoom Workplace modern video meeting, team chat, calendar, and collaboration workspace.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
