'use client';

import { usePathname } from 'next/navigation';
import { Nav } from './shared';
import { HeardAboutPrompt } from './HeardAboutPrompt';

const HIDE_NAV_PREFIXES = ['/', '/login', '/set/', '/privacy', '/terms', '/invoice', '/help', '/serato-to-rekordbox'];

export function NavWrapper() {
  const pathname = usePathname();
  const hide = HIDE_NAV_PREFIXES.some(p =>
    p === '/' ? pathname === '/' : pathname.startsWith(p)
  );
  if (hide) return null;
  return (
    <>
      <Nav />
      <HeardAboutPrompt />
    </>
  );
}
