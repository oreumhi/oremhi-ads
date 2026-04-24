// ============================================
// 데이터 저장소 v3
//
// 핵심 변경: 데이터 격리
//   - 관리자 → 전체 데이터 보기
//   - 직원 → 자기 데이터만 보기 (owner_id 기준)
//   - 업로드/매핑 시 owner_id 자동 태깅
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
    // Supabase는 한번에 1000행만 반환 → 페이지네이션으로 전체 조회
    const allData = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) { console.error(`[${table}] 조회:`, error.message); break; }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break; // 마지막 페이지
      from += pageSize;
    }
    return allData;
  }
  try { return JSON.parse(localStorage.getItem(`oha_${table}`) || '[]'); }
  catch { return []; }
}

// 소유자별 조회 (직원용) - 페이지네이션 포함
async function fetchByOwner(table, ownerId) {
  if (sb) {
    const allData = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from(table)
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) { console.error(`[${table}] 조회(owner):`, error.message); break; }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  }
  try {
    return JSON.parse(localStorage.getItem(`oha_${table}`) || '[]').filter(i => i.owner_id === ownerId);
  } catch { return []; }
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

// ─── 광고 데이터 일괄 업로드 (배치 upsert) ───
export async function upsertAdData(items, onProgress) {
  if (!items || items.length === 0) return { inserted: 0, updated: 0 };

  const BATCH_SIZE = 500;
  let totalInserted = 0;
  let totalUpdated = 0;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  if (sb) {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      if (onProgress) onProgress({ current: batchNum, total: totalBatches, rows: i + batch.length, totalRows: items.length });

      // 1차 시도: owner_id 포함 (v4 인덱스)
      let { data, error } = await sb
        .from('ad_data')
        .upsert(batch, { onConflict: 'date,match_key,owner_id', ignoreDuplicates: false })
        .select();

      // 실패 시 2차 시도: owner_id 없이 (구 인덱스)
      if (error) {
        console.warn(`[ad_data] 배치 ${batchNum} v4 upsert 실패, 구버전 시도:`, error.message);
        const r2 = await sb
          .from('ad_data')
          .upsert(batch, { onConflict: 'date,match_key', ignoreDuplicates: false })
          .select();
        data = r2.data;
        error = r2.error;
      }

      // 둘 다 실패 시 개별 insert
      if (error) {
        console.warn(`[ad_data] 배치 ${batchNum} upsert 모두 실패, 개별 insert:`, error.message);
        for (const item of batch) {
          const { error: e2 } = await sb.from('ad_data').insert(item);
          if (!e2) totalInserted++;
        }
      } else {
        totalInserted += data?.length || batch.length;
      }
    }
    return { inserted: totalInserted, updated: totalUpdated };
  }

  // localStorage
  try {
    const existing = JSON.parse(localStorage.getItem('oha_ad_data') || '[]');
    const existingMap = new Map();
    existing.forEach(item => { existingMap.set(`${item.date}||${item.match_key}`, item); });
    items.forEach(item => {
      const k = `${item.date}||${item.match_key}`;
      if (existingMap.has(k)) { existingMap.set(k, { ...existingMap.get(k), ...item }); totalUpdated++; }
      else { existingMap.set(k, { ...item, created_at: new Date().toISOString() }); totalInserted++; }
    });
    localStorage.setItem('oha_ad_data', JSON.stringify(Array.from(existingMap.values())));
    return { inserted: totalInserted, updated: totalUpdated };
  } catch (e) { return { inserted: 0, updated: 0, error: e.message }; }
}

// ─── 매핑 삭제 (owner-aware) ───
export async function deleteMappingByKey(matchKey, ownerId) {
  if (sb) {
    let query = sb.from('mappings').delete().eq('match_key', matchKey);
    if (ownerId) query = query.eq('owner_id', ownerId);
    const { error } = await query;
    return !error;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_mappings') || '[]')
      .filter(i => !(i.match_key === matchKey && (!ownerId || i.owner_id === ownerId)));
    localStorage.setItem('oha_mappings', JSON.stringify(items));
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════
// 사용자 관리
// ═══════════════════════════════════════════

export async function fetchUsers() { return await fetchAll('users'); }
export async function createUser(user) { return await insertItem('users', { ...user, id: uid() }); }
export async function deleteUser(id) { return await deleteItem('users', id); }
export async function updateUser(id, updates) { return await updateItem('users', id, updates); }

export async function authenticateUser(username, passwordHash) {
  if (sb) {
    const { data, error } = await sb.from('users').select('*').eq('username', username).eq('password_hash', passwordHash).single();
    if (error || !data) return null;
    return data;
  }
  try {
    const users = JSON.parse(localStorage.getItem('oha_users') || '[]');
    return users.find(u => u.username === username && u.password_hash === passwordHash) || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════
// 공유 링크 관리
// ═══════════════════════════════════════════

export async function fetchShareLinks() { return await fetchAll('share_links'); }
export async function createShareLink(link) { return await insertItem('share_links', { ...link, id: uid() }); }
export async function deleteShareLink(id) { return await deleteItem('share_links', id); }

export async function authenticateShareLink(code, passwordHash) {
  if (sb) {
    const { data, error } = await sb.from('share_links').select('*').eq('code', code).eq('password_hash', passwordHash).eq('active', true).single();
    if (error || !data) return null;
    return data;
  }
  try {
    const links = JSON.parse(localStorage.getItem('oha_share_links') || '[]');
    return links.find(l => l.code === code && l.password_hash === passwordHash && l.active !== false) || null;
  } catch { return null; }
}

export async function findShareLinkByCode(code) {
  if (sb) {
    const { data, error } = await sb.from('share_links').select('brand, active').eq('code', code).eq('active', true).single();
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
// 설정
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

// ─── 날짜 범위 필터 조회 (성능 최적화) ───
function getCutoffDate(rangeDays) {
  if (!rangeDays || rangeDays <= 0) return null; // 전체
  const d = new Date();
  d.setDate(d.getDate() - rangeDays);
  return d.toISOString().slice(0, 10);
}

async function fetchAdDataByRange(rangeDays) {
  const cutoff = getCutoffDate(rangeDays);
  if (sb) {
    const allData = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let query = sb.from('ad_data').select('*').order('created_at', { ascending: true }).range(from, from + pageSize - 1);
      if (cutoff) query = query.gte('date', cutoff);
      const { data, error } = await query;
      if (error) { console.error('[ad_data] 범위 조회:', error.message); break; }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_ad_data') || '[]');
    return cutoff ? items.filter(i => i.date >= cutoff) : items;
  } catch { return []; }
}

async function fetchAdDataByRangeAndOwner(rangeDays, ownerId) {
  const cutoff = getCutoffDate(rangeDays);
  if (sb) {
    const allData = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      let query = sb.from('ad_data').select('*').eq('owner_id', ownerId).order('created_at', { ascending: true }).range(from, from + pageSize - 1);
      if (cutoff) query = query.gte('date', cutoff);
      const { data, error } = await query;
      if (error) { console.error('[ad_data] 범위 조회(owner):', error.message); break; }
      if (!data || data.length === 0) break;
      allData.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return allData;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_ad_data') || '[]').filter(i => i.owner_id === ownerId);
    return cutoff ? items.filter(i => i.date >= cutoff) : items;
  } catch { return []; }
}

// ═══════════════════════════════════════════
// 중앙 데이터 관리 훅 (v4: 범위별 로드)
//
// 초기 로드: 최근 7일만 (빠른 첫 화면)
// 기간 변경: 해당 기간만 추가 로드
// ═══════════════════════════════════════════

export function useStore(currentUser) {
  const [data, setData] = useState({ adData: [], mappings: [] });
  const [loading, setLoading] = useState(true);
  const [loadedRange, setLoadedRange] = useState(0); // 현재 로드된 범위 (일수)

  const isAdmin = currentUser?.role === 'admin';
  const ownerId = currentUser?.id;
  const isStaff = currentUser?.role === 'staff';

  // 범위별 데이터 로드 함수
  const loadData = useCallback(async (rangeDays = 7) => {
    try {
      let adData, mappings;
      if (isStaff && ownerId) {
        [adData, mappings] = await Promise.all([
          fetchAdDataByRangeAndOwner(rangeDays, ownerId),
          fetchByOwner('mappings', ownerId),
        ]);
      } else {
        [adData, mappings] = await Promise.all([
          fetchAdDataByRange(rangeDays),
          fetchAll('mappings'),
        ]);
      }
      setData({ adData: adData || [], mappings: mappings || [] });
      setLoadedRange(rangeDays);
    } catch (e) { console.error('로드 실패:', e); }
    finally { setLoading(false); }
  }, [isStaff, ownerId, isAdmin]);

  // 초기 로드: 최근 7일만
  useEffect(() => {
    setLoading(true);
    loadData(7);
  }, [loadData]);

  // 기간 변경 시 호출 (Dashboard에서 호출)
  const changeRange = useCallback(async (newRange) => {
    // 이미 로드된 범위보다 작거나 같으면 재요청 불필요
    // (0 = 전체, 양수 = 일수, 전체는 항상 재요청)
    if (newRange > 0 && loadedRange >= newRange && loadedRange > 0) return;
    if (newRange === 0 && loadedRange === 0) return;
    setLoading(true);
    await loadData(newRange);
  }, [loadedRange, loadData]);

  // 광고 데이터 업로드 (owner_id 자동 태깅 + 배치 업로드)
  const uploadAdData = useCallback(async (items, onProgress) => {
    const tagged = ownerId ? items.map(i => ({ ...i, owner_id: ownerId })) : items;
    const result = await upsertAdData(tagged, onProgress);
    await loadData(loadedRange || 7);
    return result;
  }, [ownerId, loadData, loadedRange]);

  // 매핑 추가 (owner_id 자동 태깅)
  const addMapping = useCallback(async (mapping) => {
    const item = { ...mapping, id: uid(), owner_id: ownerId || null };
    const r = await insertItem('mappings', item);
    if (r) {
      setData(prev => ({ ...prev, mappings: [...prev.mappings, item] }));
      return true;
    }
    return false;
  }, [ownerId]);

  // 매핑 삭제 (owner-aware)
  const removeMapping = useCallback(async (matchKey) => {
    if (await deleteMappingByKey(matchKey, ownerId)) {
      setData(prev => ({
        ...prev,
        mappings: prev.mappings.filter(m => !(m.match_key === matchKey && (m.owner_id === ownerId || (!m.owner_id && !ownerId)))),
      }));
      return true;
    }
    return false;
  }, [ownerId]);

  // 광고 데이터 전체 삭제
  const clearAdData = useCallback(async () => {
    if (sb) {
      if (isStaff && ownerId) {
        // 직원: 자기 데이터만 삭제
        await sb.from('ad_data').delete().eq('owner_id', ownerId);
      } else {
        // 관리자: 전체 삭제
        await sb.from('ad_data').delete().neq('id', '');
      }
    } else {
      localStorage.removeItem('oha_ad_data');
    }
    setData(prev => ({ ...prev, adData: [] }));
  }, [isStaff, ownerId]);

  // 미매핑 광고 데이터 삭제 (특정 match_key 목록)
  const deleteAdDataByKeys = useCallback(async (matchKeys) => {
    if (!matchKeys || matchKeys.length === 0) return;
    if (sb) {
      for (const mk of matchKeys) {
        let query = sb.from('ad_data').delete().eq('match_key', mk);
        if (ownerId) query = query.eq('owner_id', ownerId);
        await query;
      }
    } else {
      try {
        const items = JSON.parse(localStorage.getItem('oha_ad_data') || '[]')
          .filter(i => !matchKeys.includes(i.match_key));
        localStorage.setItem('oha_ad_data', JSON.stringify(items));
      } catch { /* ignore */ }
    }
    await loadData(loadedRange || 7);
  }, [ownerId, loadData, loadedRange]);

  return { data, loading, uploadAdData, addMapping, removeMapping, clearAdData, deleteAdDataByKeys, changeRange };
}
