import { createFileRoute } from '@tanstack/react-router';
import { HomePage } from '@/components/sotiria/marketing';
import { DEVELOPER_NAME, pageHead, SOTIRIA_STRUCTURED_DATA } from '@/lib/metadata';
export const Route = createFileRoute('/')({ head: () => pageHead('Sotiría App for Child Digital Wellbeing', 'Sotiría is an Android app for child digital wellbeing, helping children and families build balanced screen-time habits, stay safe online, and make room for offline life.', { path: '/', indexable: true, author: DEVELOPER_NAME, structuredData: SOTIRIA_STRUCTURED_DATA }), component: HomePage });
