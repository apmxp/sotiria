import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/components/sotiria/marketing';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/')({ head: () => pageHead('Your digital world, in balance', 'Discover healthier digital habits, understand your feelings, stay safe online, and make room for the things you love offline.'), component: HomePage });
