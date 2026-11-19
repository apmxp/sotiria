import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Pencil, ArrowRight, Check, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useIdentity } from '@/components/identity-provider';
import { createChildDevicePairing, getChildDevicePairingStatus, openChildPicker, saveChildProfile, saveParentProfile, setupFamily } from '@/lib/identity.functions';
import { avatarOptions } from '@/data/demo';
import { Panel } from './common';

interface FamilyChild {
  id: string;
  display_name: string;
  avatar: string;
  is_active: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFamilyChild(value: unknown): value is FamilyChild {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && typeof value['display_name'] === 'string'
    && typeof value['avatar'] === 'string'
    && typeof value['is_active'] === 'boolean';
}

interface PairingCreationInput {
  childId: string;
  idempotencyKeyHash: string;
  pairingHash: string;
  pairingKeyId: string;
  requestFingerprint: string;
  timezone: string;
}

interface PairingFlow {
  childId: string;
  childName: string;
  token?: string;
  request?: PairingCreationInput;
  pairingId?: string;
  expiresAt?: string;
  reportingTimezone?: string;
  unavailableStatus?: 'pairing_open' | 'pairing_expired';
}

function withoutPendingPairing(flow: PairingFlow): PairingFlow {
  const updated = { ...flow };
  delete updated.token;
  delete updated.request;
  return updated;
}

function randomPairingToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function FamilyManagement() {
  const { familyData, selected, selectChild, user } = useIdentity();
  const cache = useQueryClient(); const navigate = useNavigate();
  const setup = useServerFn(setupFamily); const save = useServerFn(saveChildProfile); const openPicker = useServerFn(openChildPicker);
  const [familyName, setFamilyName] = useState(() => typeof user?.user_metadata?.['family_name'] === 'string' ? user.user_metadata['family_name'] : ''); const [open, setOpen] = useState(false);
  const [id, setId] = useState<string>(); const [name, setName] = useState(''); const [avatar, setAvatar] = useState('🌱'); const [pinValue, setPin] = useState(''); const [active, setActive] = useState(true);
  const [pairingOpen, setPairingOpen] = useState(false);
  const [pairingFlow, setPairingFlow] = useState<PairingFlow | null>(null);
  const [pairingPreparing, setPairingPreparing] = useState(false);
  const refresh = () => cache.invalidateQueries({ queryKey: ['identity-family'] });
  const setupMutation = useMutation({ mutationFn: () => setup({ data: { name: familyName } }), onSuccess: refresh, onError: () => toast.error('Your family could not be created. Please try again.') });
  const saveMutation = useMutation({ mutationFn: async () => { if (!familyData?.family) throw new Error('Family required'); return save({ data: { id, familyId: familyData.family.id, displayName: name, avatar, pin: pinValue || undefined, active } }); }, onSuccess: () => { setOpen(false); setPin(''); void refresh(); toast.success('Child profile saved.'); }, onError: () => toast.error('Check the nickname and six-digit PIN, then try again.') });
  const pickerMutation = useMutation({ mutationFn: async () => { if (!familyData?.family) throw new Error('Family required'); return openPicker({ data: { familyId: familyData.family.id } }); }, onSuccess: async () => { await cache.cancelQueries(); cache.clear(); await navigate({ to: '/child-login' }); }, onError: () => toast.error('The child space could not be opened.') });
  const createPairing = useServerFn(createChildDevicePairing);
  const getPairingStatus = useServerFn(getChildDevicePairingStatus);
  const pairingMutation = useMutation({
    mutationFn: (data: PairingCreationInput) => createPairing({ data }),
    onSuccess: (result, data) => {
      setPairingFlow(current => {
        if (current?.request?.idempotencyKeyHash !== data.idempotencyKeyHash) return current;
        if (result.status === 'pairing_open') {
          return {
            ...withoutPendingPairing(current),
            expiresAt: result.expiresAt,
            unavailableStatus: 'pairing_open',
          };
        }
        if (result.status === 'pairing_expired') {
          return { ...withoutPendingPairing(current), unavailableStatus: 'pairing_expired' };
        }
        const activatedOrPending = {
          ...withoutPendingPairing(current),
          pairingId: result.pairingId,
          expiresAt: result.expiresAt,
          reportingTimezone: result.reportingTimezone,
        };
        delete activatedOrPending.unavailableStatus;
        return activatedOrPending;
      });
    },
    onError: () => toast.error('Phone pairing could not be started. Please try again.'),
  });
  const pairingStatusQuery = useQuery({
    queryKey: ['android-pairing-status', pairingFlow?.childId, pairingFlow?.pairingId],
    queryFn: async () => {
      if (!pairingFlow?.pairingId) throw new Error('Pairing has not been created.');
      return getPairingStatus({ data: { childId: pairingFlow.childId, pairingId: pairingFlow.pairingId } });
    },
    enabled: pairingOpen && Boolean(pairingFlow?.pairingId),
    refetchInterval: query => (
      query.state.data?.status === 'activated'
      || query.state.data?.status === 'expired'
      || query.state.data?.status === 'cancelled'
        ? false
        : 2000
    ),
  });
  useEffect(() => {
    if (['activated', 'expired', 'cancelled'].includes(pairingStatusQuery.data?.status ?? '')) {
      setPairingFlow(current => current
        ? withoutPendingPairing(current)
        : current);
    }
  }, [pairingStatusQuery.data?.status]);
  const startPairing = async (child: FamilyChild, forceNew = false) => {
    const currentStatus = pairingStatusQuery.data?.status;
    if (
      !forceNew
      && pairingFlow?.childId === child.id
      && pairingFlow.token
      && currentStatus !== 'expired'
      && currentStatus !== 'cancelled'
      && currentStatus !== 'activated'
    ) {
      setPairingOpen(true);
      return;
    }

    setPairingOpen(true);
    setPairingPreparing(true);
    try {
      const token = randomPairingToken();
      const idempotencyToken = randomPairingToken();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const [pairingHash, idempotencyKeyHash, requestFingerprint] = await Promise.all([
        sha256Hex(token),
        sha256Hex(idempotencyToken),
        sha256Hex(`${child.id}\u0000${timezone}`),
      ]);
      const request: PairingCreationInput = {
        childId: child.id,
        idempotencyKeyHash,
        pairingHash,
        pairingKeyId: 'v1',
        requestFingerprint,
        timezone,
      };
      setPairingFlow({ childId: child.id, childName: child.display_name, token, request });
      pairingMutation.mutate(request);
    } catch {
      toast.error('A secure pairing code could not be created in this browser.');
      setPairingOpen(false);
    } finally {
      setPairingPreparing(false);
    }
  };
  const retryPairing = () => {
    if (pairingFlow?.request) pairingMutation.mutate(pairingFlow.request);
  };
  if (!familyData) return <p role="status">Loading your family…</p>;
  if (!familyData.family) return <Panel title="Create your family"><p className="panel-subtitle mb-4">Welcome! Name your family to start adding your children’s profiles.</p><form className="space-y-4" onSubmit={e => { e.preventDefault(); setupMutation.mutate(); }}><label className="field">Family name<input required maxLength={80} value={familyName} onChange={e => setFamilyName(e.target.value)} /></label><Button type="submit" disabled={setupMutation.isPending}>Create family <ArrowRight /></Button></form></Panel>;
  const children = Array.isArray(familyData.children) ? familyData.children.filter(isFamilyChild) : [];
  const pairingExpired = ['expired', 'cancelled'].includes(pairingStatusQuery.data?.status ?? '');
  const startNewPairing = () => {
    const child = children.find(candidate => candidate.id === pairingFlow?.childId);
    if (child) void startPairing(child, true);
  };
  return <Panel title={familyData.family.name} action={<Button variant="ghost" size="sm" onClick={() => { setId(undefined); setName(''); setAvatar('🌱'); setPin(''); setActive(true); setOpen(true); }}><Plus />Add child</Button>}>
    {children.length > 0 && <label className="field">Child in your overview<select aria-label="Child in your overview" value={selected ?? children[0]?.id} onChange={e => selectChild(e.target.value)}>{children.map(c => <option key={c.id} value={c.id}>{c.display_name}{!c.is_active ? ' · inactive' : ''}</option>)}</select></label>}
    {children.map(c => <div className="history-row" key={c.id}><span className="avatar">{c.avatar}</span><div className="min-w-0 flex-1"><strong>{c.display_name}</strong><p>{c.is_active ? 'Active profile' : 'Inactive profile'}</p></div>{c.is_active && <Button variant="outline" size="sm" onClick={() => void startPairing(c)} disabled={pairingPreparing || (pairingMutation.isPending && pairingFlow?.childId !== c.id)}><Smartphone />Connect phone</Button>}<Button variant="ghost" size="icon" aria-label={`Edit ${c.display_name}`} onClick={() => { setId(c.id); setName(c.display_name); setAvatar(c.avatar); setPin(''); setActive(c.is_active); setOpen(true); }}><Pencil /></Button></div>)}
    {!children.length && <p className="panel-subtitle">Add your child’s nickname and PIN.</p>}
    <Button className="mt-4" variant="wellbeing" disabled={!children.some(c => c.is_active) || pickerMutation.isPending} onClick={() => pickerMutation.mutate()}>Open child space <ArrowRight /></Button>
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setPin(''); }}><DialogContent><DialogHeader><DialogTitle>{id ? 'Edit child profile' : 'Add child profile'}</DialogTitle><DialogDescription>A nickname is enough. Keep the PIN between you and your child.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }}><label className="field">Nickname<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label><label className="field">Avatar<select value={avatar} onChange={e => setAvatar(e.target.value)}>{avatarOptions.map(a => <option key={a}>{a}</option>)}</select></label><label className="field">{id ? 'New PIN (leave blank to keep it)' : 'Six-digit PIN'}<input type="password" inputMode="numeric" autoComplete="new-password" required={!id} pattern="[0-9]{6}" maxLength={6} value={pinValue} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label><label className="flex gap-2 items-center"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active profile</label><Button type="submit" disabled={saveMutation.isPending}>Save profile <Check /></Button></form></DialogContent></Dialog>
    <Dialog open={pairingOpen} onOpenChange={setPairingOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect {pairingFlow?.childName ?? 'your child'}’s phone</DialogTitle>
          <DialogDescription>
            This code authorizes one phone for this profile and expires after 10 minutes. A replacement phone does not replace the current one until activation succeeds.
          </DialogDescription>
        </DialogHeader>
        {pairingFlow?.token && !pairingExpired && pairingStatusQuery.data?.status !== 'activated' && <>
          <div className="space-y-3">
            <p className="panel-subtitle">On the Android companion, enter this one-time code:</p>
            <code className="block break-all rounded-lg bg-muted p-3 text-sm">{pairingFlow.token}</code>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => {
                const token = pairingFlow.token;
                if (!token) return;
                void navigator.clipboard.writeText(token).then(
                  () => toast.success('Pairing code copied.'),
                  () => toast.error('The pairing code could not be copied.'),
                );
              }}>Copy code</Button>
            </div>
            {pairingFlow.expiresAt && <p className="panel-subtitle">Expires {new Date(pairingFlow.expiresAt).toLocaleTimeString()} · reporting time zone {pairingFlow.reportingTimezone}</p>}
            {!pairingFlow.pairingId && <div role="status" className="panel-subtitle">{pairingMutation.isPending ? 'Creating a secure pairing…' : 'Pairing could not be confirmed yet.'}{!pairingMutation.isPending && <Button variant="link" onClick={retryPairing}>Retry</Button>}</div>}
            {pairingFlow.pairingId && pairingStatusQuery.data?.status === 'redeemed' && <p role="status" className="panel-subtitle">The phone is verifying its secure credential…</p>}
            {pairingFlow.pairingId && pairingStatusQuery.data?.status === 'pending' && <p role="status" className="panel-subtitle">Waiting for the Android phone to use this code…</p>}
            {pairingFlow.pairingId && ['expired', 'cancelled'].includes(pairingStatusQuery.data?.status ?? '') && <p role="status" className="panel-subtitle">This pairing code is no longer active. Close this window and start a new pairing.</p>}
            {pairingFlow.pairingId && pairingStatusQuery.isError && <p role="status" className="panel-subtitle">Pairing status is temporarily unavailable. This window will keep checking.</p>}
          </div>
        </>}
        {pairingFlow?.unavailableStatus === 'pairing_open' && <>
          <p role="status" className="panel-subtitle">Another pairing is already open for this profile until {pairingFlow.expiresAt ? new Date(pairingFlow.expiresAt).toLocaleTimeString() : 'it expires'}.</p>
          <Button variant="outline" disabled={pairingPreparing || pairingMutation.isPending} onClick={startNewPairing}>Try a new code</Button>
        </>}
        {pairingFlow?.unavailableStatus === 'pairing_expired' && <>
          <p role="status" className="panel-subtitle">That pairing attempt expired. Create a new code to try again.</p>
          <Button variant="outline" disabled={pairingPreparing || pairingMutation.isPending} onClick={startNewPairing}>Create a new code</Button>
        </>}
        {pairingFlow?.pairingId && pairingStatusQuery.data?.status === 'activated' && <p role="status" className="positive-note">Phone paired successfully{pairingStatusQuery.data.device_name ? `: ${pairingStatusQuery.data.device_name}` : ''}.</p>}
        {pairingFlow && pairingExpired && <>
          <p role="status" className="panel-subtitle">This pairing code is no longer active.</p>
          <Button variant="outline" disabled={pairingPreparing || pairingMutation.isPending} onClick={startNewPairing}>Create a new code</Button>
        </>}
        {!pairingFlow && <p role="status" className="panel-subtitle">Preparing a secure one-time code…</p>}
      </DialogContent>
    </Dialog>
  </Panel>;
}
export function ParentNameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial); const fn = useServerFn(saveParentProfile); const cache = useQueryClient();
  const mutation = useMutation({ mutationFn: () => fn({ data: { name } }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ['identity-family'] }); toast.success('Your name is updated.'); }, onError: () => toast.error('Your name could not be saved.') });
  return <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }}><label className="field">Your first name<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label><Button type="submit" variant="wellbeing" disabled={mutation.isPending}>Save <Check /></Button></form>;
}