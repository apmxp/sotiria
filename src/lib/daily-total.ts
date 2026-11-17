export const SOTIRIA_DAILY_TOTAL_NAMESPACE = 'bd2f9761-59e2-56d3-b9c2-2e3f0a608a5b';

export type DailyTotalRpcArgs = {
  p_id: string;
  p_child_id: string;
  p_usage_date: string;
  p_minutes: number;
};

type DailyTotalRpc = (args: DailyTotalRpcArgs) => PromiseLike<{ error: unknown | null }>;

function uuidBytes(value: string): Uint8Array {
  const hex = value.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('Invalid UUID namespace.');
  return Uint8Array.from({ length: 16 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export async function uuidV5(namespace: string, name: string): Promise<string> {
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(16 + nameBytes.length);
  input.set(uuidBytes(namespace));
  input.set(nameBytes, 16);

  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', input));
  const versionByte = hash[6];
  const variantByte = hash[8];
  if (versionByte === undefined || variantByte === undefined) throw new Error('Could not generate UUID.');
  hash[6] = (versionByte & 0x0f) | 0x50;
  hash[8] = (variantByte & 0x3f) | 0x80;

  const hex = Array.from(hash.subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function dailyTotalId(childId: string, date: string): Promise<string> {
  return uuidV5(SOTIRIA_DAILY_TOTAL_NAMESPACE, `${childId.toLowerCase()}:${date}`);
}

export async function dailyTotalRpcArgs(
  childId: string,
  date: string,
  minutes: number,
): Promise<DailyTotalRpcArgs> {
  return {
    p_id: await dailyTotalId(childId, date),
    p_child_id: childId,
    p_usage_date: date,
    p_minutes: minutes,
  };
}

export async function saveDailyTotal(
  rpc: DailyTotalRpc,
  childId: string,
  date: string,
  minutes: number,
): Promise<{ error: unknown | null }> {
  return rpc(await dailyTotalRpcArgs(childId, date, minutes));
}
