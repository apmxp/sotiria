import { createFileRoute } from '@tanstack/react-router';
import { MarketingPage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/how-it-works')({ head: () => pageHead('How It Works', 'No pressure, no perfect days. Discover your digital day, build habits that feel right, and make room for real-world joy.'), component: () => <MarketingPage type="how" /> });
