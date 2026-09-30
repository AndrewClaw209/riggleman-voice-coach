'use client';

import Image from 'next/image';
import { createContext, useContext } from 'react';
import type { BrandConfig } from '../lib/brand';

const BrandContext = createContext<BrandConfig | null>(null);

export function BrandProvider({ brand, children }: { brand: BrandConfig; children: React.ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export function useBrand(): BrandConfig {
  const brand = useContext(BrandContext);
  if (!brand) throw new Error('useBrand must be used inside BrandProvider');
  return brand;
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const brand = useBrand();

  if (brand.key === 'consumer') {
    return <Image src="/curtis-ai-logo.png" alt={brand.logoAlt} width={178} height={53} className={compact ? 'h-auto w-[140px]' : 'h-auto w-[178px]'} priority />;
  }

  return <Image
    src="/r-u-ready-ai-logo.png"
    alt={brand.logoAlt}
    width={724}
    height={233}
    className={`enterprise-logo${compact ? ' enterprise-logo-compact' : ''}`}
    priority
  />;
}
