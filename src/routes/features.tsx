import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/features')({ head: () => pageHead('Features', 'Five thoughtful ways Sotiría helps children build balanced digital habits: screen-time balance, mood check-ins, online safety, offline adventures, and parent guidance.'), component: () => <MarketingPage type="features" /> });
