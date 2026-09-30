import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { headers } from 'next/headers';
import './globals.css';
import ClientLayout from '../components/ClientLayout';
import { getBrandForHost } from '../lib/brand';

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get('host') || '';
  const brand = getBrandForHost(host);
  return {
    title: brand.name,
    description: brand.description,
    icons: { icon: '/favicon.ico' },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hostPromise = headers();
  return <RootLayoutWithBrand hostPromise={hostPromise}>{children}</RootLayoutWithBrand>;
}

async function RootLayoutWithBrand({ hostPromise, children }: { hostPromise: ReturnType<typeof headers>; children: React.ReactNode }) {
  const host = (await hostPromise).get('host') || '';
  const brand = getBrandForHost(host);
  return (
    <html lang="en">
      <body data-brand={brand.key} className={`${geist.variable} ${geistMono.variable} antialiased`}>
        <ClientLayout brand={brand}>{children}</ClientLayout>
      </body>
    </html>
  );
}
