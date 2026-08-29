import type { Metadata } from 'next';
import { ProfilesView } from '@/features/profiles/profiles-view';

export const metadata: Metadata = { title: 'Profiles' };

export default function Page() {
  return <ProfilesView />;
}
