export type BrandKey = 'consumer' | 'enterprise';

export type BrandConfig = {
  key: BrandKey;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  voiceName: string;
  logoAlt: string;
  domains: string[];
};

export const CONSUMER_BRAND: BrandConfig = {
  key: 'consumer',
  name: 'Curtis AI',
  shortName: 'Curtis',
  tagline: 'Your on-demand AI sales advisor',
  description: "Your on-demand AI sales advisor in Curtis Riggleman's voice",
  voiceName: 'Curtis',
  logoAlt: 'Curtis AI',
  domains: ['curtis.ai', 'app.curtis.ai'],
};

export const ENTERPRISE_BRAND: BrandConfig = {
  key: 'enterprise',
  name: 'R U Ready Sales Coaching AI',
  shortName: 'R U Ready',
  tagline: 'Sales coaching built for dealership teams',
  description: 'AI sales coaching for dealership teams, managers, and leaders',
  voiceName: 'R U Ready Coach',
  logoAlt: 'R U Ready Sales Coaching AI',
  domains: ['rureadysalescoaching.ai', 'app.rureadysalescoaching.ai'],
};

export function getBrandForHost(host = ''): BrandConfig {
  const normalizedHost = host.toLowerCase().split(':')[0];
  const enterprise = normalizedHost.includes('ruready')
    || normalizedHost.includes('r-u-ready')
    || normalizedHost.includes('enterprise');

  return enterprise ? ENTERPRISE_BRAND : CONSUMER_BRAND;
}
