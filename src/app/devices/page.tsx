import type { Metadata } from 'next';
import { DevicesView } from '@/features/devices/devices-view';

export const metadata: Metadata = { title: 'Devices' };

export default function Page() {
  return <DevicesView />;
}
