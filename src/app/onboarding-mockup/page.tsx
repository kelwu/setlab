// TEMPORARY mockup route for screenshot review only. Not for merge.
import { MockupScreens } from './MockupScreens';
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  return <MockupScreens screen={p.screen ?? 'library'} />;
}
