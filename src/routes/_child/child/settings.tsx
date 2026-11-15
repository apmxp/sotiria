import { createFileRoute } from '@tanstack/react-router';
import { ChildSettingsPage } from '@/components/sotiria/child';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/_child/child/settings')({ head: () => pageHead('Child Settings', 'Make this space feel like yours: your name, gentle nudges, and privacy.'), component: ChildSettingsPage });
