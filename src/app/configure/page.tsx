import type { Metadata } from 'next';
import { ConfigureView } from '@/features/editor/configure-view';

export const metadata: Metadata = { title: 'Configure' };

export default function Page() {
  return <ConfigureView />;
}
