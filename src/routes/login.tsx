import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from '@/components/sotiria/auth';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/login')({ head: () => pageHead('Parent Log In', 'Sign in to your Sotiría family space with your email and password.'), component: LoginPage });
