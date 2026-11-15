import { Check, LockKeyhole } from 'lucide-react';
import { exportExcludes, exportIncludes } from '@/lib/wellbeing';

/** One shared explanation of what the parent view can and cannot see. */
export function PrivacyColumns({ audience }: { audience: 'child' | 'parent' }) {
  return (
    <div className="privacy-columns">
      <div>
        <h3>{audience === 'child' ? 'Your family can see' : 'You can see'}</h3>
        <ul>{exportIncludes.map(item => <li key={item}><Check aria-hidden="true" className="text-accent-foreground" />{item}</li>)}</ul>
      </div>
      <div>
        <h3>{audience === 'child' ? 'Stays just for you' : 'Always private to your child'}</h3>
        <ul>{exportExcludes.map(item => <li key={item}><LockKeyhole aria-hidden="true" className="text-primary" />{item}</li>)}</ul>
      </div>
    </div>
  );
}
