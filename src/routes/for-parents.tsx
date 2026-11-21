import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/for-parents')({ head: () => pageHead('Digital Wellbeing for Parents | Sotiría', 'Learn how Sotiría helps parents support children’s digital wellbeing with screen-time insights, shared routines, and privacy-respecting guidance.', { path: '/for-parents', indexable: true }), component: () => <MarketingPage type="parents" /> });
