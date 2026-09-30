'use client';

import { AuthProvider } from '../lib/AuthContext';
import { BrandProvider } from './BrandProvider';
import type { BrandConfig } from '../lib/brand';
import AwevoFooter from './AwevoFooter';

export default function ClientLayout({ children, brand }: { children: React.ReactNode; brand: BrandConfig }) {
  return <BrandProvider brand={brand}><AuthProvider><div className="app-root">{children}<AwevoFooter /></div></AuthProvider></BrandProvider>;
}
