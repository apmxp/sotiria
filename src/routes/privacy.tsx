import { createFileRoute } from '@tanstack/react-router';
import { PrivacyPage } from '@/components/sotiria/legal';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/privacy')({ head: () => pageHead('Privacy', 'A child’s inner world belongs to them. Learn how Sotiría keeps feelings private and puts guidance before surveillance.'), component: PrivacyPage });
