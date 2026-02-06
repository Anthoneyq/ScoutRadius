import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ScoutRadius - Find Sports Clubs',
  description: 'Find sports clubs within drive time',
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
