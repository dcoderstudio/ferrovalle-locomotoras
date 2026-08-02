import type { Locomotora, Phase } from '../types';
import { emptyPhotosByPhase } from '../types';

export function isConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function loadLocomotoras(): Promise<Locomotora[] | null> {
  try {
    const res = await fetch('/api/locomotoras', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (e) {
    console.error('[sync] load error:', e);
    return null;
  }
}

async function saveLocomotoraPhotos(
  id: string,
  photosByPhase: Record<Phase, string[]>
): Promise<boolean> {
  try {
    const res = await fetch('/api/locomotoras', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, photosByPhase }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.ok === true;
  } catch (e) {
    console.error('[sync] photo save error:', e);
    return false;
  }
}

export async function saveLocomotoras(list: Locomotora[]): Promise<boolean> {
  // 1. Save photos per-locomotora first (each request is one record — no size limit issues)
  const withPhotos = list.filter(l => Object.values(l.photosByPhase).some(arr => arr.length));
  const photoResults = await Promise.all(
    withPhotos.map(l => saveLocomotoraPhotos(l.id, l.photosByPhase))
  );

  // 2. Save structural list with photos stripped (small payload)
  const stripped = list.map(l => ({ ...l, photosByPhase: emptyPhotosByPhase() }));
  try {
    const res = await fetch('/api/locomotoras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stripped),
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json.ok === true && photoResults.every(Boolean);
  } catch (e) {
    console.error('[sync] save error:', e);
    return false;
  }
}
