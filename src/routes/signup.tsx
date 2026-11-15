import { createFileRoute } from '@tanstack/react-router';
import { SignupPage } from '@/components/sotiria/auth';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/signup')({ head: () => pageHead('Create a Parent Account', 'Start your family’s journey toward balanced digital habits with a free Sotiría parent account.'), component: SignupPage });
