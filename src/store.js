// ============================================
// 데이터 저장소
//
// Supabase 연결되면 클라우드 저장, 안되면 localStorage 사용.
// v2: 다중 사용자 + 공유 링크 지원
// ============================================

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { uid } from './utils';

// ─── Supabase 설정 ───
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasSB = url && key && !url.includes('your-project');
export const sb = hasSB ? createClient(url, key) : null;

// ─── 기본 CRUD ───

async function fetchAll(table) {
  if (sb) {
    const { data, error } = await sb.from(table).select('*').order('created_at', { ascending: true });
    if (error) { console.error(`[${table}] 조회:`, error.message); return []; }
    return data || [];
  }
  try { return JSON.parse(localStorage.getItem(`oha_${table}`) || '[]'); }
  catch { return []; }
}

async function insertItem(table, item) {
  if (sb) {
    const { data, error } = await sb.from(table).insert(item).select().single();
    if (error) { console.error(`[${table}] 추가:`, error.message); return null; }
    return data;
  }
  try {
    const items = JSON.parse(localStorage.getItem(`oha_${table}`) || '[]');
    items.push({ ...item, created_at: new Date().toISOString() });
    localStorage.setItem(`oha_${table}`, JSON.stringify(items));
    return item;
  } catch { return null; }
}

async function deleteItem(table, id) {
  if (sb) {
    const { error } = await sb.from(table).delete().eq('id', id);
    if (error) { console.error(`[${table}] 삭제:`, error.message); return false; }
    return true;
  }
  try {
    const items = JSON.parse(localStorage.getItem(`oha_${table}`) || '[]').filter(i => i.id !== id);
    localStorage.setItem(`oha_${table}`, JSON.stringify(items));
    return true;
  } catch { return false; }
}

async function updateItem(table, id, updates) {
  if (sb) {
    const { error } = await sb.from(table).update(updates).eq('id', id);
    if (error) { console.error(`[${table}] 수정:`, error.message); return false; }
    return true;
  }
  try {
    const items = JSON.parse(localStorage.getItem(`oha_${table}`) || '[]')
      .map(i => i.id === id ? { ...i, ...updates } : i);
    localStorage.setItem(`oha_${table}`, JSON.stringify(items));
    return true;
  } catch { return false; }
}

// ─── 광고 데이터 일괄 업로드 (upsert) ───
export async function upsertAdData(items) {
  if (!items || items.length === 0) return { inserted: 0, updated: 0 };

  if (sb) {
    const { data, error } = await sb
      .from('ad_data')
      .upsert(items, { onConflict: 'date,match_key', ignoreDuplicates: false })
      .select();

    if (error) {
      console.error('[ad_data] upsert:', error.message);
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        let inserted = 0;
        for (const item of items) {
          const { error: e2 } = await sb.from('ad_data').upsert(item, { onConflict: 'date,match_key' });
          if (!e2) inserted++;
        }
        return { inserted, updated: 0 };
      }
      return { inserted: 0, updated: 0, error: error.message };
    }
    return { inserted: data?.length || items.length, updated: 0 };
  }

  try {
    const existing = JSON.parse(localStorage.getItem('oha_ad_data') || '[]');
    const existingMap = new Map();
    existing.forEach(item => { existingMap.set(`${item.date}||${item.match_key}`, item); });

    let inserted = 0, updated = 0;
    items.forEach(item => {
      const k = `${item.date}||${item.match_key}`;
      if (existingMap.has(k)) { existingMap.set(k, { ...existingMap.get(k), ...item }); updated++; }
      else { existingMap.set(k, { ...item, created_at: new Date().toISOString() }); inserted++; }
    });

    localStorage.setItem('oha_ad_data', JSON.stringify(Array.from(existingMap.values())));
    return { inserted, updated };
  } catch (e) { return { inserted: 0, updated: 0, error: e.message }; }
}

// ─── 매핑 삭제 ───
export async function deleteMappingByKey(matchKey) {
  if (sb) {
    const { error } = await sb.from('mappings').delete().eq('match_key', matchKey);
    return !error;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_mappings') || '[]').filter(i => i.match_key !== matchKey);
    localStorage.setItem('oha_mappings', JSON.stringify(items));
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════
// 사용자 관리 (v2)
// ═══════════════════════════════════════════

export async function fetchUsers() {
  return await fetchAll('users');
}

export async function createUser(user) {
  const item = { ...user, id: uid() };
  return await insertItem('users', item);
}

export async function deleteUser(id) {
  return await deleteItem('users', id);
}

export async function updateUser(id, updates) {
  return await updateItem('users', id, updates);
}

// 로그인: username + password_hash로 사용자 찾기
export async function authenticateUser(username, passwordHash) {
  if (sb) {
    const { data, error } = await sb
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password_hash', passwordHash)
      .single();
    if (error || !data) return null;
    return data;
  }
  try {
    const users = JSON.parse(localStorage.getItem('oha_users') || '[]');
    return users.find(u => u.username === username && u.password_hash === passwordHash) || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 공유 링크 관리 (v2)
// ═══════════════════════════════════════════

export async function fetchShareLinks() {
  return await fetchAll('share_links');
}

export async function createShareLink(link) {
  const item = { ...link, id: uid() };
  return await insertItem('share_links', item);
}

export async function deleteShareLink(id) {
  return await deleteItem('share_links', id);
}

// 공유 링크 인증: code + password_hash로 찾기
export async function authenticateShareLink(code, passwordHash) {
  if (sb) {
    const { data, error } = await sb
      .from('share_links')
      .select('*')
      .eq('code', code)
      .eq('password_hash', passwordHash)
      .eq('active', true)
      .single();
    if (error || !data) return null;
    return data;
  }
  try {
    const links = JSON.parse(localStorage.getItem('oha_share_links') || '[]');
    return links.find(l => l.code === code && l.password_hash === passwordHash && l.active !== false) || null;
  } catch { return null; }
}

// code로 공유 링크 존재 확인 (비밀번호 입력 전 유효성 체크)
export async function findShareLinkByCode(code) {
  if (sb) {
    const { data, error } = await sb
      .from('share_links')
      .select('brand, active')
      .eq('code', code)
      .eq('active', true)
      .single();
    if (error || !data) return null;
    return data;
  }
  try {
    const links = JSON.parse(localStorage.getItem('oha_share_links') || '[]');
    const link = links.find(l => l.code === code && l.active !== false);
    return link ? { brand: link.brand, active: link.active } : null;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 설정 (기존)
// ═══════════════════════════════════════════

export async function loadSettings() {
  if (sb) {
    const { data } = await sb.from('ads_settings').select('*').eq('id', 'main').single();
    return data || { font_size: 'medium' };
  }
  try { return JSON.parse(localStorage.getItem('oha_settings') || '{"font_size":"medium"}'); }
  catch { return { font_size: 'medium' }; }
}

export async function saveSettings(updates) {
  if (sb) {
    await sb.from('ads_settings').update(updates).eq('id', 'main');
  } else {
    const cur = await loadSettings();
    localStorage.setItem('oha_settings', JSON.stringify({ ...cur, ...updates }));
  }
}

// ═══════════════════════════════════════════
// 중앙 데이터 관리 훅
// ═══════════════════════════════════════════

export function useStore() {
  const [data, setData] = useState({ adData: [], mappings: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [adData, mappings] = await Promise.all([fetchAll('ad_data'), fetchAll('mappings')]);
        if (mounted) setData({ adData: adData || [], mappings: mappings || [] });
      } catch (e) { console.error('로드 실패:', e); }
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const uploadAdData = useCallback(async (items) => {
    const result = await upsertAdData(items);
    const adData = await fetchAll('ad_data');
    setData(prev => ({ ...prev, adData: adData || [] }));
    return result;
  }, []);

  const addMapping = useCallback(async (mapping) => {
    const item = { ...mapping, id: uid() };
    const r = await insertItem('mappings', item);
    if (r) { setData(prev => ({ ...prev, mappings: [...prev.mappings, item] })); return true; }
    return false;
  }, []);

  const removeMapping = useCallback(async (matchKey) => {
    if (await deleteMappingByKey(matchKey)) {
      setData(prev => ({ ...prev, mappings: prev.mappings.filter(m => m.match_key !== matchKey) }));
      return true;
    }
    return false;
  }, []);

  const clearAdData = useCallback(async () => {
    if (sb) { await sb.from('ad_data').delete().neq('id', ''); }
    else { localStorage.removeItem('oha_ad_data'); }
    setData(prev => ({ ...prev, adData: [] }));
  }, []);

  return { data, loading, uploadAdData, addMapping, removeMapping, clearAdData };
}
