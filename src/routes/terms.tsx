import { createFileRoute } from '@tanstack/react-router';
import { TermsPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/terms')({ head: () => pageHead('Terms of Use', 'A short, human summary of how to enjoy the Sotiría demo.'), component: TermsPage });
