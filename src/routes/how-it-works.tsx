import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/how-it-works')({ head: () => pageHead('How the Sotiría App Works', 'See how the Sotiría Android app connects with a parent’s Family Space to support screen-time awareness, safer habits, and offline activities.', { path: '/how-it-works', indexable: true }), component: () => <MarketingPage type="how" /> });
