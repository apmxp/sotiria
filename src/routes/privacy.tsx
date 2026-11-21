import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/privacy')({ head: () => pageHead('Sotiría Privacy and Child Data', 'Read how Sotiría protects children’s private feelings and reflections while giving parents screen-time and wellbeing guidance.', { path: '/privacy', indexable: true }), component: PrivacyPage });
