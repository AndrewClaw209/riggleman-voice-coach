'use client';

import { AuthProvider } from '../lib/AuthContext';
import { BrandProvider } from './BrandProvider';
import type { BrandConfig } from '../lib/brand';

export default function ClientLayout({ children, brand }: { children: React.ReactNode; brand: BrandConfig }) {
  return <BrandProvider brand={brand}><AuthProvider>{children}</AuthProvider></BrandProvider>;
}
