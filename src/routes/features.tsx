import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/features')({ head: () => pageHead('Sotiría Features for Child Wellbeing', 'Explore Sotiría app features for children’s digital wellbeing, including Android screen-time insights, private mood reflections, online safety, offline activities, and parent guidance.', { path: '/features', indexable: true }), component: () => <MarketingPage type="features" /> });
