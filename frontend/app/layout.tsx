import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Zooom | Modern Meeting Workspace',
  description:
    'A polished, Zoom-inspired meeting workspace. Create, schedule, and join meetings with real-time video, audio, and collaboration.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
