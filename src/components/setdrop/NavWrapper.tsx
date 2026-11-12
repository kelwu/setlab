'use client';

import { usePathname } from 'next/navigation';
import { Nav } from './shared';

const HIDE_NAV_PREFIXES = ['/', '/login', '/set/', '/privacy', '/terms', '/invoice', '/help'];

export function NavWrapper() {
  const pathname = usePathname();
  const hide = HIDE_NAV_PREFIXES.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  );
  if (hide) return null;
  return <Nav />;
}
