import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/for-parents')({ head: () => pageHead('For Parents', 'Guidance, not surveillance. Understand your child’s digital habits and find a balance that works for your family.'), component: () => <MarketingPage type="parents" /> });
