import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Locomotora } from '../../types';

const DATA_KEY = 'locomotoras';
const PHOTO_PREFIX = 'locomotoras-';

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: Request) {
  const db = getClient();
  const { searchParams } = new URL(request.url);

  if (searchParams.get('test') === 'write') {
    if (!db) return NextResponse.json({ error: 'not_configured', service_key: !!process.env.SUPABASE_SERVICE_KEY, anon_key: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
    const { error } = await db
      .from('app_data')
      .upsert({ key: DATA_KEY, value: [{ debug: true, t: Date.now() }], updated_at: new Date().toISOString() });
    return NextResponse.json({ write_error: error?.message ?? null, write_code: error?.code ?? null, ok: !error });
  }

  if (!db) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const { data: listData, error: listError } = await db
    .from('app_data')
    .select('value')
    .eq('key', DATA_KEY);
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 });

  const locomotoraList: Locomotora[] = Array.isArray(listData?.[0]?.value) ? listData[0].value : [];
  if (locomotoraList.length === 0) return NextResponse.json([]);

  const { data: photoRows } = await db
    .from('app_data')
    .select('key, value')
    .like('key', `${PHOTO_PREFIX}%`);

  const photoMap: Record<string, Record<string, string[]>> = {};
  for (const row of photoRows ?? []) {
    const id = row.key.slice(PHOTO_PREFIX.length);
    photoMap[id] = row.value;
  }

  const merged = locomotoraList.map((l: Locomotora) => {
    const photos = photoMap[l.id];
    if (!photos) return l;
    return {
      ...l,
      photosByPhase: { ...l.photosByPhase, ...photos },
    };
  });

  return NextResponse.json(merged);
}

export async function POST(request: Request) {
  const db = getClient();
  if (!db) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const list = await request.json();
    const { error } = await db
      .from('app_data')
      .upsert({ key: DATA_KEY, value: list, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const db = getClient();
  if (!db) return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  try {
    const { id, photosByPhase } = await request.json();
    if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 });
    const { error } = await db
      .from('app_data')
      .upsert({
        key: `${PHOTO_PREFIX}${id}`,
        value: photosByPhase ?? {},
        updated_at: new Date().toISOString(),
      });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
