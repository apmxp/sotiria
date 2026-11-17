import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Plus, Pencil, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useIdentity } from '@/components/identity-provider';
import { openChildPicker, saveChildProfile, saveParentProfile, setupFamily } from '@/lib/identity.functions';
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

export function FamilyManagement() {
  const { familyData, selected, selectChild, user } = useIdentity();
  const cache = useQueryClient(); const navigate = useNavigate();
  const setup = useServerFn(setupFamily); const save = useServerFn(saveChildProfile); const openPicker = useServerFn(openChildPicker);
  const [familyName, setFamilyName] = useState(() => typeof user?.user_metadata?.['family_name'] === 'string' ? user.user_metadata['family_name'] : ''); const [open, setOpen] = useState(false);
  const [id, setId] = useState<string>(); const [name, setName] = useState(''); const [avatar, setAvatar] = useState('🌱'); const [pinValue, setPin] = useState(''); const [active, setActive] = useState(true);
  const refresh = () => cache.invalidateQueries({ queryKey: ['identity-family'] });
  const setupMutation = useMutation({ mutationFn: () => setup({ data: { name: familyName } }), onSuccess: refresh, onError: () => toast.error('Your family could not be created. Please try again.') });
  const saveMutation = useMutation({ mutationFn: async () => { if (!familyData?.family) throw new Error('Family required'); return save({ data: { id, familyId: familyData.family.id, displayName: name, avatar, pin: pinValue || undefined, active } }); }, onSuccess: () => { setOpen(false); setPin(''); void refresh(); toast.success('Child profile saved.'); }, onError: () => toast.error('Check the nickname and six-digit PIN, then try again.') });
  const pickerMutation = useMutation({ mutationFn: async () => { if (!familyData?.family) throw new Error('Family required'); return openPicker({ data: { familyId: familyData.family.id } }); }, onSuccess: async () => { await cache.cancelQueries(); cache.clear(); await navigate({ to: '/child-login' }); }, onError: () => toast.error('The child space could not be opened.') });
  if (!familyData) return <p role="status">Loading your family…</p>;
  if (!familyData.family) return <Panel title="Create your family"><p className="panel-subtitle mb-4">Welcome! Name your family to start adding your children’s profiles.</p><form className="space-y-4" onSubmit={e => { e.preventDefault(); setupMutation.mutate(); }}><label className="field">Family name<input required maxLength={80} value={familyName} onChange={e => setFamilyName(e.target.value)} /></label><Button type="submit" disabled={setupMutation.isPending}>Create family <ArrowRight /></Button></form></Panel>;
  const children = Array.isArray(familyData.children) ? familyData.children.filter(isFamilyChild) : [];
  return <Panel title={familyData.family.name} action={<Button variant="ghost" size="sm" onClick={() => { setId(undefined); setName(''); setAvatar('🌱'); setPin(''); setActive(true); setOpen(true); }}><Plus />Add child</Button>}>
    {children.length > 0 && <label className="field">Child in your overview<select aria-label="Child in your overview" value={selected ?? children[0]?.id} onChange={e => selectChild(e.target.value)}>{children.map(c => <option key={c.id} value={c.id}>{c.display_name}{!c.is_active ? ' · inactive' : ''}</option>)}</select></label>}
    {children.map(c => <div className="history-row" key={c.id}><span className="avatar">{c.avatar}</span><div className="min-w-0 flex-1"><strong>{c.display_name}</strong><p>{c.is_active ? 'Active profile' : 'Inactive profile'}</p></div><Button variant="ghost" size="icon" aria-label={`Edit ${c.display_name}`} onClick={() => { setId(c.id); setName(c.display_name); setAvatar(c.avatar); setPin(''); setActive(c.is_active); setOpen(true); }}><Pencil /></Button></div>)}
    {!children.length && <p className="panel-subtitle">Add your child’s nickname and PIN.</p>}
    <Button className="mt-4" variant="wellbeing" disabled={!children.some(c => c.is_active) || pickerMutation.isPending} onClick={() => pickerMutation.mutate()}>Open child space <ArrowRight /></Button>
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setPin(''); }}><DialogContent><DialogHeader><DialogTitle>{id ? 'Edit child profile' : 'Add child profile'}</DialogTitle><DialogDescription>A nickname is enough. Keep the PIN between you and your child.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={e => { e.preventDefault(); saveMutation.mutate(); }}><label className="field">Nickname<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label><label className="field">Avatar<select value={avatar} onChange={e => setAvatar(e.target.value)}>{avatarOptions.map(a => <option key={a}>{a}</option>)}</select></label><label className="field">{id ? 'New PIN (leave blank to keep it)' : 'Six-digit PIN'}<input type="password" inputMode="numeric" autoComplete="new-password" required={!id} pattern="[0-9]{6}" maxLength={6} value={pinValue} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} /></label><label className="flex gap-2 items-center"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />Active profile</label><Button type="submit" disabled={saveMutation.isPending}>Save profile <Check /></Button></form></DialogContent></Dialog>
  </Panel>;
}
export function ParentNameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial); const fn = useServerFn(saveParentProfile); const cache = useQueryClient();
  const mutation = useMutation({ mutationFn: () => fn({ data: { name } }), onSuccess: () => { void cache.invalidateQueries({ queryKey: ['identity-family'] }); toast.success('Your name is updated.'); }, onError: () => toast.error('Your name could not be saved.') });
  return <form onSubmit={e => { e.preventDefault(); mutation.mutate(); }}><label className="field">Your first name<input required maxLength={30} value={name} onChange={e => setName(e.target.value)} /></label><Button type="submit" variant="wellbeing" disabled={mutation.isPending}>Save <Check /></Button></form>;
}