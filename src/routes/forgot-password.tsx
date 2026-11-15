import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordPage } from '@/components/sotiria/auth';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/forgot-password')({ head: () => pageHead('Forgot Password', 'Request a link to reset your Sotiría parent account password.'), component: ForgotPasswordPage });
