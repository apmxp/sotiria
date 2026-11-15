import { createFileRoute } from '@tanstack/react-router';
import { ParentSettingsPage } from '@/components/sotiria/parent';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_authenticated/parent/settings')({ head: () => pageHead('Settings & Privacy', 'Shape how Sotiría works for your family: notifications, consent, and privacy by design.'), component: ParentSettingsPage });
