// ============================================
// 데이터 저장소 v3
//
// 핵심 변경: 데이터 격리
//   - 관리자 → 전체 데이터 보기
//   - 직원 → 자기 데이터만 보기 (owner_id 기준)
//   - 업로드/매핑 시 owner_id 자동 태깅
// ============================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { uid, toLocalDateStr } from './utils';

// ─── Supabase 설정 ───
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasSB = url && key && !url.includes('your-project');
// ※ 2026-09-11 — 모든 조회에 제한시간을 겁니다(앱 전체 안전장치).
//   서버가 집계표를 다시 만드는 동안에는 요청을 보내도 30초가 넘도록 아무 응답이 없습니다.
//   여러 화면이 그 응답을 계속 기다리다 '로딩만 도는' 상태에 빠졌습니다
//   (홈·팀 업무·후기·순위·리포트·하락 진단 등 8개 화면이 같은 구조였습니다).
//   → 15초가 지나면 그 요청만 실패로 끝냅니다. 화면은 받은 것만으로라도 그려집니다.
const REQUEST_TIMEOUT_MS = 15000;
const timedFetch = (input, init = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
};
export const sb = hasSB ? createClient(url, key, { global: { fetch: timedFetch } }) : null;

// ─── 기본 CRUD ───

// 병렬 페이지 로딩 (Supabase Max rows=5000과 일치)
const PAGE_SIZE = 5000;

// ※ 2026-09-10 속도 개선 — 대시보드가 느려진 핵심 원인 세 가지를 여기서 잡습니다.
//   ① 표를 하나 읽을 때마다 무조건 6개 요청을 한꺼번에 던졌습니다. 3줄짜리 표에도
//      빈 요청 5개가 같이 나갔고, 홈 화면 한 번 여는 데 30개가 넘는 요청이 몰렸습니다.
//      DB 접속 자리가 꽉 차서 서로를 기다리다 전부 느려졌습니다(같은 조회가 0.6초→7초).
//      → 첫 장을 하나만 읽고, 더 있을 때만 나눠 읽습니다. 대부분 요청 1개로 끝납니다.
//   ② 동시 요청을 6 → 3으로 낮춰 접속 자리를 남겨 둡니다.
//   ③ 실패하면 곧바로 한 번만 다시 부르던 것을, 0.7초→1.4초→2.8초로 간격을 늘려
//      3번까지 시도합니다. 몰릴 때 재시도가 부하를 더 키우던 문제를 막습니다.
const MAX_WAVE = 3;

// ※ 2026-09-11 — 응답이 영영 오지 않는 경우를 끊어 줍니다.
//   서버가 집계표를 다시 만드는 동안에는 조회 요청에 30초가 넘도록 아무 응답이 없습니다.
//   화면 코드가 그걸 계속 기다리다 '로딩만 도는' 상태가 됐습니다.
//   → 10초가 지나면 실패로 처리하고 넘어갑니다. 화면은 최소한 뜹니다.
const QUERY_TIMEOUT_MS = 10000;
function withTimeout(p, ms = QUERY_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(p).finally(() => clearTimeout(timer)),
    new Promise(resolve => { timer = setTimeout(() => resolve({ data: null, error: { message: '응답 없음(' + (ms / 1000) + '초 초과)' } }), ms); }),
  ]);
}

async function runWithRetry(makeQuery, page) {
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 900));
    last = await withTimeout(makeQuery(page, PAGE_SIZE));
    if (!last || !last.error) return last;
  }
  return last;
}

async function fetchPagedParallel(makeQuery, wave = MAX_WAVE) {
  const all = [];
  // 1단계 — 첫 장만 읽는다. 웬만한 표는 여기서 끝난다(요청 1개).
  const first = await runWithRetry(makeQuery, 0);
  if (!first || first.error) {
    if (first && first.error) console.error('[조회] 오류:', first.error.message);
    return all;
  }
  if (!first.data || first.data.length === 0) return all;
  all.push(...first.data);
  if (first.data.length < PAGE_SIZE) return all;

  // 2단계 — 더 있을 때만 나눠 읽는다.
  let page = 1;
  for (;;) {
    const results = await Promise.all(
      Array.from({ length: wave }, (_, i) => runWithRetry(makeQuery, page + i))
    );
    page += wave;
    let done = false;
    for (const res of results) {
      const { data, error } = res || {};
      if (error) { console.error('[병렬조회] 오류:', error.message); done = true; break; }
      if (!data || data.length === 0) { done = true; break; }
      all.push(...data);
      if (data.length < PAGE_SIZE) { done = true; break; }
    }
    if (done) break;
  }
  return all;
}

// ─── 매핑 캐시 ───
// ※ 2026-09-10: 매핑은 하루에 몇 번 바뀌지도 않는데, 화면을 열거나 기간을 바꿀 때마다
//   2만 3천 건(약 6MB)을 매번 다시 받아 왔습니다. 한 번 받아 5분간 재사용하고,
//   매핑을 추가·삭제하면 즉시 새로 받습니다(화면에 옛 매핑이 남지 않습니다).
let _mapCache = null, _mapCacheAt = 0;
const MAP_TTL_MS = 5 * 60 * 1000;
export function invalidateMappingsCache() { _mapCache = null; _mapCacheAt = 0; }
async function fetchMappingsCached() {
  if (_mapCache && Date.now() - _mapCacheAt < MAP_TTL_MS) return _mapCache;
  const rows = await fetchAll('mappings');
  _mapCache = rows; _mapCacheAt = Date.now();
  return rows;
}

async function fetchAll(table) {
  if (sb) {
    return await fetchPagedParallel((p, size) => sb.from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .range(p * size, p * size + size - 1));
  }
  try { return JSON.parse(localStorage.getItem(`oha_${table}`) || '[]'); }
  catch { return []; }
}

// 소유자별 조회 (직원용) - 페이지네이션 포함
async function fetchByOwner(table, ownerId) {
  if (sb) {
    return await fetchPagedParallel((p, size) => sb.from(table)
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .range(p * size, p * size + size - 1));
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

      // owner_id 포함하여 upsert (v4 인덱스 필수)
      // 보안: owner_id 없이 매칭하면 다른 사용자 데이터를 덮어쓸 수 있어 절대 사용하지 않음
      const { data, error } = await sb
        .from('ad_data')
        .upsert(batch, { onConflict: 'date,match_key,owner_id', ignoreDuplicates: false })
        .select();

      // 실패 시 개별 insert (덮어쓰기 없음 - 안전)
      if (error) {
        console.warn(`[ad_data] 배치 ${batchNum} upsert 실패, 개별 insert:`, error.message);
        for (const item of batch) {
          const { error: e2 } = await sb.from('ad_data').insert(item);
          if (!e2) totalInserted++;
        }
      } else {
        totalInserted += data?.length || batch.length;
      }
    }
    notifyAggChanged(); // 서버 집계 재계산 예약
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
    if (!error) notifyAggChanged();
    return !error;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_mappings') || '[]')
      .filter(i => !(i.match_key === matchKey && (!ownerId || i.owner_id === ownerId)));
    localStorage.setItem('oha_mappings', JSON.stringify(items));
    return true;
  } catch { return false; }
}

// ─── 브랜드 전체 삭제 (해당 브랜드의 매핑 일괄 삭제) ───
// ownerId가 있으면(직원) 본인 매핑만, null이면(관리자) 전체 삭제
export async function deleteMappingsByBrand(brand, ownerId) {
  if (sb) {
    let query = sb.from('mappings').delete().eq('brand', brand);
    if (ownerId) query = query.eq('owner_id', ownerId);
    const { error } = await query;
    if (!error) notifyAggChanged();
    return !error;
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_mappings') || '[]')
      .filter(i => !(i.brand === brand && (!ownerId || i.owner_id === ownerId)));
    localStorage.setItem('oha_mappings', JSON.stringify(items));
    return true;
  } catch { return false; }
}

// ═══════════════════════════════════════════
// 사용자 관리
// ═══════════════════════════════════════════

export async function fetchUsers() { return await fetchAll('users'); }

// ※ 2026-09-11 — 서버가 느릴 때 '사용자 0명'으로 오해하지 않도록
//   users는 4명뿐인데도 서버가 밀리면 22초가 걸리거나 실패합니다.
//   실패를 빈 배열로 돌려주면 앱이 "가입자가 없다"고 판단해 관리자 초기설정 화면을 띄웁니다.
//   → 실패는 null로 구분해서 돌려주고, 서버가 느릴 수 있으니 간격을 두고 3번까지 시도합니다.
//   (정렬·페이징도 뺐습니다. 4줄짜리 표에 굳이 필요 없습니다)
export async function fetchUsersOrNull() {
  if (!sb) return [];
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
    const { data, error } = await sb.from('users').select('*');
    if (!error) return data || [];
    console.warn('[사용자 조회] 실패 — 재시도', attempt + 1, error.message);
  }
  return null;   // null = 못 불러옴(≠ 사용자 없음)
}
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
  return toLocalDateStr(d); // 로컬(한국시간) 기준
}

// ─── 기간에 따른 데이터 원천 자동 선택 (전부 같은 컬럼명이라 화면 코드는 동일하게 작동) ───
//   1~30일  : ad_data   (일별 원본 — 상세)
//   90~365일: ad_weekly (광고×주 서버 집계 — 7분의 1 크기)
//   전체(0) : ad_monthly(광고×월 서버 집계 — 30분의 1 크기)
function tableForRange(rangeDays) {
  if (!rangeDays || rangeDays <= 0) return 'ad_monthly';
  if (rangeDays >= 90) return 'ad_weekly';
  return 'ad_data';
}
export const granForRange = (rangeDays) => tableForRange(rangeDays);

async function fetchAdDataByRange(rangeDays) {
  const cutoff = getCutoffDate(rangeDays);
  const table = tableForRange(rangeDays);
  if (sb) {
    return await fetchPagedParallel((p, size) => {
      let query = sb.from(table).select('*')
        .order('date', { ascending: true }).order('id', { ascending: true })
        .range(p * size, p * size + size - 1);
      if (cutoff) query = query.gte('date', cutoff);
      return query;
    });
  }
  try {
    const items = JSON.parse(localStorage.getItem('oha_ad_data') || '[]');
    return cutoff ? items.filter(i => i.date >= cutoff) : items;
  } catch { return []; }
}

async function fetchAdDataByRangeAndOwner(rangeDays, ownerId) {
  const cutoff = getCutoffDate(rangeDays);
  const table = tableForRange(rangeDays);
  if (sb) {
    return await fetchPagedParallel((p, size) => {
      let query = sb.from(table).select('*').eq('owner_id', ownerId)
        .order('date', { ascending: true }).order('id', { ascending: true })
        .range(p * size, p * size + size - 1);
      if (cutoff) query = query.gte('date', cutoff);
      return query;
    });
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
  // ※ 2026-09-10: 예전엔 앱을 켜자마자 true라서, 필요도 없는 데이터를 다 받을 때까지
  //   화면 전체가 로딩으로 멈춰 있었습니다. 이제 실제로 받을 때만 켭니다.
  const [loading, setLoading] = useState(false);
  const [rangeLoading, setRangeLoading] = useState(false); // 기간 변경 로딩 (작은 인디케이터)
  const [loadedRange, setLoadedRange] = useState(0); // 현재 로드된 범위 (일수)

  const isAdmin = currentUser?.role === 'admin';
  const ownerId = currentUser?.id;
  const isStaff = currentUser?.role === 'staff';

  // 내부: setLoading을 건드리지 않는 순수 데이터 로드 함수
  const loadDataInternal = useCallback(async (rangeDays = 7) => {
    if (!currentUser) {
      setData({ adData: [], mappings: [] });
      return;
    }
    try {
      let adData, mappings;
      if (isAdmin || isStaff || currentUser.role === 'share') {
        // 전체 데이터 로드 — 직원/공유 모드는 화면에서 allowedBrands(담당 브랜드)로 필터됨.
        // (수집 데이터는 관리자 소유라, 직원을 소유자 기준으로 격리하면 아무것도 안 보이는 문제가 있었음)
        [adData, mappings] = await Promise.all([
          fetchAdDataByRange(rangeDays),
          fetchMappingsCached(),
        ]);
      } else {
        adData = [];
        mappings = [];
      }
      setData({ adData: adData || [], mappings: mappings || [] });
      setLoadedRange(rangeDays);
    } catch (e) { console.error('로드 실패:', e); }
  }, [currentUser, isStaff, isAdmin, ownerId]);

  // 외부용: 큰 로딩 표시 포함 (초기 로드 / 업로드 후 / 매핑 후)
  const loadData = useCallback(async (rangeDays = 7) => {
    if (!currentUser) {
      setData({ adData: [], mappings: [] });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await loadDataInternal(rangeDays);
    } finally {
      setLoading(false);
    }
  }, [currentUser, loadDataInternal]);

  // ※ 2026-09-10 속도 개선 — 대시보드가 느려진 가장 큰 원인
  //   앱을 켜면 무조건 최근 7일 광고 원본(약 36,000행·15MB, 요청 8개)과
  //   매핑 전체(23,755건·6MB, 요청 5개)를 먼저 받았고, 그동안 화면 전체가 멈춰 있었습니다.
  //   그런데 첫 화면인 '홈'은 이 데이터를 하나도 쓰지 않습니다(홈은 서버 집계표를 따로 씁니다).
  //   → 실제로 쓰는 화면(성과 보기·종합 요약·보고서 업로드·매핑 관리·설정)에 들어갈 때만 받습니다.
  const askedRef = useRef(false);

  useEffect(() => {
    if (!currentUser) {
      setData({ adData: [], mappings: [] });
      setLoading(false);
      askedRef.current = false;
      return;
    }
    askedRef.current = false;   // 사용자가 바뀌면 다시 받는다
  }, [currentUser]);

  // 데이터가 필요한 화면에서 호출 — 한 번만 받고, 이후에는 그대로 재사용
  const ensureData = useCallback(async (rangeDays = 7) => {
    if (!currentUser || askedRef.current) return;
    askedRef.current = true;
    await loadData(rangeDays);
  }, [currentUser, loadData]);

  // 기간 변경 시 호출 (Dashboard에서 호출)
  const changeRange = useCallback(async (newRange) => {
    // 데이터 원천(일별/주별/월별)이 같고 이미 충분한 범위가 로드돼 있으면 재요청 불필요
    const sameGran = granForRange(newRange) === granForRange(loadedRange);
    if (sameGran && newRange > 0 && loadedRange >= newRange && loadedRange > 0) return;
    if (sameGran && newRange === 0 && loadedRange === 0) return;
    if (sameGran && newRange > 0 && granForRange(newRange) === 'ad_weekly' && loadedRange > 0 && loadedRange >= newRange) return;
    setRangeLoading(true); // 작은 인디케이터만 (전체 화면 로딩 X)
    try {
      await loadDataInternal(newRange);
    } finally {
      setRangeLoading(false);
    }
  }, [loadedRange]);

  // 사용자 지정 기간 로드 (시작~종료)
  //   92일 이하: ad_data(일별 원본, 정확) / 2년 이하: ad_weekly / 그 외: ad_monthly
  const changeCustomRange = useCallback(async (from, to) => {
    if (!from || !to || from > to) return;
    setRangeLoading(true);
    try {
      const span = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
      const table = span <= 92 ? 'ad_data' : span <= 750 ? 'ad_weekly' : 'ad_monthly';
      let rows = [];
      if (sb) {
        rows = await fetchPagedParallel((p, size) => sb.from(table).select('*')
          .gte('date', from).lte('date', to)
          .order('date', { ascending: true }).order('id', { ascending: true })
          .range(p * size, p * size + size - 1));
      } else {
        try { rows = JSON.parse(localStorage.getItem('oha_ad_data') || '[]').filter(i => i.date >= from && i.date <= to); } catch { rows = []; }
      }
      setData(prev => ({ ...prev, adData: rows || [] }));
      setLoadedRange(-1);   // 커스텀 상태 표시 → 기간 버튼으로 돌아가면 무조건 재로드
    } finally {
      setRangeLoading(false);
    }
  }, []);

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
      notifyAggChanged();
      setData(prev => ({ ...prev, mappings: [...prev.mappings, item] }));
      return true;
    }
    return false;
  }, [ownerId]);

  // 매핑 삭제 — 매핑은 회사 공용 자산이라 소유자 무관하게 삭제 (2026-07-20)
  // (직원 화면에도 전체 미매핑/매핑이 보이므로, 잘못 단 매핑을 누구든 고칠 수 있어야 함)
  const removeMapping = useCallback(async (matchKey) => {
    if (await deleteMappingByKey(matchKey, null)) {
      setData(prev => ({
        ...prev,
        mappings: prev.mappings.filter(m => m.match_key !== matchKey),
      }));
      return true;
    }
    return false;
  }, []);

  // 브랜드 전체 삭제 (매핑 일괄 삭제 → 브랜드 버튼이 사라짐)
  const removeBrand = useCallback(async (brand) => {
    const ok = await deleteMappingsByBrand(brand, isAdmin ? null : ownerId);
    if (ok) {
      setData(prev => ({
        ...prev,
        mappings: prev.mappings.filter(m => !(m.brand === brand && (isAdmin || m.owner_id === ownerId))),
      }));
    }
    return ok;
  }, [isAdmin, ownerId]);

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
    notifyAggChanged();
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
    notifyAggChanged();
    await loadData(loadedRange || 7);
  }, [ownerId, loadData, loadedRange]);

  return { data, loading, rangeLoading, ensureData, uploadAdData, addMapping, removeMapping, removeBrand, clearAdData, deleteAdDataByKeys, changeRange, changeCustomRange };
}

// ─── 하락 진단: 브랜드의 광고그룹별 합계 (서버 집계 — 수십 줄만 내려옴) ───
export async function fetchDiagGroups(brand, fromDate, toDate) {
  if (!sb || !brand) return { rows: [], ok: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await sb.rpc('diag_groups', { p_brand: brand, p_from: fromDate, p_to: toDate });
    if (!error) return { rows: data || [], ok: true };
    console.error('[diag_groups]', error.message, '(재시도', attempt + 1, ')');
    await new Promise(r => setTimeout(r, 900));
  }
  return { rows: [], ok: false };   // ok:false = 조회 실패(≠ 데이터 없음)
}

// ─── 스케일업 발굴 (순위를 올리면 더 팔릴 것 같은 파워링크 키워드) ───
export async function fetchScaleupBrands() {
  if (!sb) return [];
  const { data, error } = await sb.rpc('scaleup_brands');
  if (error) { console.error('[scaleup_brands]', error.message); return []; }
  return data || [];
}
export async function fetchScaleupKeywords(brand, fromDate, toDate) {
  if (!sb || !brand) return { rows: [], ok: true };
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await sb.rpc('scaleup_keywords', { p_brand: brand, p_from: fromDate, p_to: toDate });
    if (!error) return { rows: data || [], ok: true };
    console.error('[scaleup_keywords]', error.message, '(재시도', attempt + 1, ')');
    await new Promise(r => setTimeout(r, 900));
  }
  return { rows: [], ok: false };
}

// ─── 브랜드 목표·YOY 기준치 (담당자 기재) ───
export async function fetchBrandTargets() {
  if (!sb) return [];
  const { data, error } = await sb.from('brand_targets').select('*').order('brand');
  if (error) { console.error('[brand_targets] 조회:', error.message); return []; }
  return data || [];
}
export async function upsertBrandTarget(t) {
  if (!sb) return false;
  const { error } = await sb.from('brand_targets').upsert({ ...t, updated_at: new Date().toISOString() });
  if (error) { console.error('[brand_targets] 저장:', error.message); return false; }
  return true;
}
export async function deleteBrandTarget(brand) {
  if (!sb) return false;
  const { error } = await sb.from('brand_targets').delete().eq('brand', brand);
  if (error) return false;
  return true;
}

// ─── 광고주 리포트용 데이터 조회 ───
export async function fetchAdDataForReport(rangeDays, ownerId) {
  return ownerId ? fetchAdDataByRangeAndOwner(rangeDays, ownerId) : fetchAdDataByRange(rangeDays);
}
export async function fetchMappingsAll() {
  return await fetchMappingsCached();
}

// ═══════════════════════════════════════════
// 서버 집계 테이블(ad_daily) — 고속 조회
//   날짜×브랜드×광고유형×출처 로 미리 집계된 테이블.
//   원본(ad_data) 수십만 행 대신 수천 행만 내려받아 즉시 표시.
//   갱신: DB 내부 스케줄러(pg_cron)가 5분마다(변경 시)·매일 06시(전체) 자동 재집계.
// ═══════════════════════════════════════════
export async function fetchAdDaily(rangeDays, ownerId) {
  if (!sb) return [];
  const cutoff = getCutoffDate(rangeDays);
  return await fetchPagedParallel((p, size) => {
    let q = sb.from('ad_daily').select('*')
      .order('date', { ascending: true }).order('id', { ascending: true })
      .range(p * size, p * size + size - 1);
    if (cutoff) q = q.gte('date', cutoff);
    if (ownerId) q = q.eq('owner_id', ownerId);
    return q;
  });
}

// 집계 테이블 임의 구간 조회 (YOY: 작년 동기간 등)
export async function fetchAdDailyWindow(fromDate, toDate) {
  if (!sb) return [];
  return await fetchPagedParallel((p, size) => sb.from('ad_daily').select('*')
    .gte('date', fromDate).lte('date', toDate)
    .order('date', { ascending: true }).order('id', { ascending: true })
    .range(p * size, p * size + size - 1));
}

// 원본 상세 조회 (기간 한정 + 필요한 컬럼만 → 전송량 절감)
export async function fetchAdDataWindow(fromDate, toDate, ownerId) {
  if (!sb) return [];
  return await fetchPagedParallel((p, size) => {
    let q = sb.from('ad_data')
      .select('date,match_key,source,cost,impressions,clicks,conversions,conv_revenue,group_name,material_id')
      .gte('date', fromDate).lte('date', toDate)
      .order('date', { ascending: true }).order('id', { ascending: true })
      .range(p * size, p * size + size - 1);
    if (ownerId) q = q.eq('owner_id', ownerId);
    return q;
  });
}

// ═══════════════════════════════════════════
// 담당 직원 중앙 연동
//   설정의 '담당 브랜드'가 유일한 기준.
//   저장 시 순위 대상·후기 매장·카톡방 담당을 브랜드 이름으로 자동 맞춤.
//   (각 페이지에서 개별 지정하면 다음 연동 실행 전까지 유지됩니다)
// ═══════════════════════════════════════════
export async function syncStaffAssignments() {
  if (!sb) return { rank: 0, review: 0, chat: 0 };
  const norm = (s) => (s || '').toLowerCase().replace(/[\s_\-·xX×()]/g, '').replace(/숍/g, '솝');
  const { data: users } = await sb.from('users').select('id,name,role,assigned_brands');
  const pairs = [];
  (users || []).filter(u => u.role === 'staff').forEach(u => {
    let bs = []; try { bs = JSON.parse(u.assigned_brands || '[]'); } catch { /* ignore */ }
    bs.forEach(b => pairs.push({ brand: b, id: u.id, name: u.name }));
  });
  const findOwner = (label) => {
    const nl = norm(label); if (!nl) return null;
    return pairs.find(p => { const nb = norm(p.brand); return nb && (nl.includes(nb) || nb.includes(nl)); }) || null;
  };
  let cr = 0, cv = 0, cc = 0;
  // 1) 순위 체크 대상
  const { data: rps } = await sb.from('rank_products').select('id,brand,owner_id');
  for (const it of (rps || [])) {
    const o = findOwner(it.brand);
    if (o && it.owner_id !== o.id) {
      await sb.from('rank_products').update({ owner_id: o.id, staff_name: o.name }).eq('id', it.id); cr++;
    }
  }
  // 2) 후기 체크 매장
  const [{ data: sm }, { data: rp2 }] = await Promise.all([
    sb.from('review_store_map').select('store,brand,owner_id'),
    sb.from('review_products').select('store'),
  ]);
  const mapByStore = {}; (sm || []).forEach(r => { mapByStore[r.store] = r; });
  const allStores = [...new Set((rp2 || []).map(r => r.store))];
  for (const s of allStores) {
    const cur = mapByStore[s];
    const o = findOwner((cur && cur.brand) || s) || findOwner(s);
    if (o && (!cur || cur.owner_id !== o.id)) {
      await sb.from('review_store_map').upsert(
        { store: s, owner_id: o.id, brand: (cur && cur.brand) || s, updated_at: new Date().toISOString() }, { onConflict: 'store' });
      await sb.from('review_checks').update({ owner_id: o.id }).eq('store', s);
      cv++;
    }
  }
  // 3) 대화 분석 카톡방
  const { data: rooms } = await sb.from('chat_room_owner').select('room_name,client_name,owner_id');
  for (const r of (rooms || [])) {
    const o = findOwner(r.client_name) || findOwner(r.room_name);
    if (o && r.owner_id !== o.id) {
      await sb.from('chat_room_owner').update({ owner_id: o.id, staff_name: o.name, updated_at: new Date().toISOString() }).eq('room_name', r.room_name);
      await sb.from('chat_uploads').update({ owner_id: o.id, uploader_name: o.name }).eq('room_name', r.room_name);
      cc++;
    }
  }
  return { rank: cr, review: cv, chat: cc };
}

// 전체 데이터 정확한 건수 (설정 화면 표시용 — 행을 내려받지 않고 개수만 조회)
export async function countAdData() {
  if (!sb) return 0;
  // ※ 2026-09-10: 정확히 세려면 115만 행을 전부 훑어야 해서 10초가 넘게 걸리고,
  //   그동안 대시보드 전체가 같이 멈췄습니다(설정 화면을 열 때마다 발생).
  //   DB가 이미 갖고 있는 추정치를 씁니다 — 오차는 1% 안팎이고 즉시 응답합니다.
  const { count, error } = await sb.from('ad_data').select('id', { count: 'planned', head: true });
  if (!error && count) return count;
  const r2 = await sb.from('ad_data').select('id', { count: 'estimated', head: true });
  return r2.error ? 0 : (r2.count || 0);
}

// 데이터/매핑 변경 알림 → DB가 5분 내 자동 재집계 (즉시 반환, 실패해도 무해)
// ※ 2026-09-10 — 대시보드가 멈추던 직접적 원인
//   서버가 집계표(ad_daily·ad_weekly·ad_monthly)를 다시 만드는 동안 그 표들이 잠깁니다.
//   잠긴 동안 대시보드의 집계표 조회는 전부 실패합니다(측정: 원본 표는 멀쩡한데 집계표 3개만 타임아웃).
//   그런데 매핑을 하나 고칠 때마다 이 재집계를 불렀습니다 — 매핑 30건을 손보면 재집계 30번,
//   그 시간 내내 화면이 멈췄습니다.
//   → 뜸하다가 한 번 바뀌면 즉시, 연달아 바뀌면 마지막 변경 후 60초에 딱 한 번만 부릅니다.
//     (원래도 '5분 내 반영'이 설계 의도라 결과는 같고, 잠기는 횟수만 크게 줄어듭니다)
let _aggTimer = null, _aggLastSent = 0;
function _sendAggNow() {
  _aggLastSent = Date.now(); _aggTimer = null;
  if (sb) { try { sb.rpc('mark_ad_daily_dirty').then(() => {}, () => {}); } catch { /* ignore */ } }
}
export function notifyAggChanged() {
  invalidateMappingsCache();   // 매핑이 바뀌었을 수 있으므로 캐시를 비운다 (2026-09-10)
  if (!sb) return;
  if (!_aggTimer && Date.now() - _aggLastSent > 5 * 60 * 1000) { _sendAggNow(); return; }
  if (_aggTimer) clearTimeout(_aggTimer);
  _aggTimer = setTimeout(_sendAggNow, 60000);
}
if (typeof window !== 'undefined') {
  // 화면을 닫을 때 대기 중인 요청이 있으면 마지막으로 한 번 보낸다
  window.addEventListener('pagehide', () => { if (_aggTimer) { clearTimeout(_aggTimer); _sendAggNow(); } });
}

// ─── 리포트 확장: 키워드/매체/시간대 데이터 (기간 조회) ───
async function fetchDimTable(table, ownerId, fromDate, toDate) {
  if (!sb) return [];
  return await fetchPagedParallel((p, size) => {
    let q = sb.from(table).select('*').gte('date', fromDate).lte('date', toDate)
      .order('date', { ascending: true }).order('id', { ascending: true })
      .range(p * size, p * size + size - 1);
    if (ownerId) q = q.eq('owner_id', ownerId);
    return q;
  });
}
export const fetchReportKeyword = (ownerId, f, t) => fetchDimTable('report_keyword', ownerId, f, t);
export const fetchReportMedia = (ownerId, f, t) => fetchDimTable('report_media', ownerId, f, t);
export const fetchReportHour = (ownerId, f, t) => fetchDimTable('report_hour', ownerId, f, t);
export const fetchReportDemo = (ownerId, f, t) => fetchDimTable('report_demo', ownerId, f, t);

// ═══════════════════════════════════════════════
// 브랜드 통합 관리 (2026-08-11 대표님 지시)
//   설정에서 브랜드를 등록하면: 명부(brand_registry.json) + 수집 계정 +
//   담당 배정 + 목표 + 카톡방까지 한 번에. 다음날 새벽 수집부터 자동 매핑.
//   삭제하면: 모든 화면·수집·담당에서 제거. 광고비 원본(ad_data)은 보관.
// ═══════════════════════════════════════════════

const REGISTRY_PATH = 'config/brand_registry.json';

export async function fetchBrandRegistry() {
  if (!sb) return { brands: [] };
  const { data } = sb.storage.from('attachments').getPublicUrl(REGISTRY_PATH);
  try {
    const r = await fetch(data.publicUrl + '?t=' + Date.now());
    if (!r.ok) return { brands: [] };
    return await r.json();
  } catch { return { brands: [] }; }
}

export async function saveBrandRegistry(doc) {
  if (!sb) return false;
  const next = { ...doc, updated_at: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(next, null, 1)], { type: 'application/json' });
  try { await sb.storage.from('attachments').remove([REGISTRY_PATH]); } catch { /* ignore */ }
  const { error } = await sb.storage.from('attachments').upload(REGISTRY_PATH, blob, { contentType: 'application/json', upsert: true });
  if (error) { console.error('[브랜드명부] 저장 실패:', error.message); return false; }
  return true;
}

// 브랜드 등록 — 필요한 모든 곳에 한 번에 반영
//   info: { brand, accounts:[{name, account_id, source}], staff(이름), targetRoas, dailyBudget, kakaoRoom, storeUrl }
export async function registerBrand(info) {
  if (!sb) return { ok: false, msg: '클라우드 연결이 없습니다' };
  const brand = (info.brand || '').trim();
  if (!brand) return { ok: false, msg: '브랜드명을 입력하세요' };
  const accounts = (info.accounts || []).filter(a => (a.name || '').trim() && String(a.account_id || '').trim());
  if (!accounts.length) return { ok: false, msg: '네이버 계정을 1개 이상 입력하세요' };
  if (!(info.staff || '').trim()) return { ok: false, msg: '담당 직원을 선택하세요' };
  const log = [];

  // 1) 명부 갱신 (같은 이름 있으면 계정 병합)
  const reg = await fetchBrandRegistry();
  const brands = reg.brands || [];
  let entry = brands.find(b => b.brand === brand);
  if (!entry) {
    entry = { brand, accounts: [], staff: '', target_roas: null, daily_budget: null,
      kakao_room: '', store_url: '', note: '', active: true,
      created_at: new Date().toISOString().slice(0, 10) };
    brands.push(entry);
    log.push('명부에 새 브랜드 등록');
  } else { log.push('기존 브랜드에 정보 병합'); }
  accounts.forEach(a => {
    if (!entry.accounts.some(x => String(x.account_id) === String(a.account_id))) {
      entry.accounts.push({ name: a.name.trim(), account_id: String(a.account_id).trim(), source: a.source || 'search' });
    }
  });
  entry.staff = info.staff.trim();
  if (info.targetRoas) entry.target_roas = +info.targetRoas || null;
  if (info.dailyBudget) entry.daily_budget = +info.dailyBudget || null;
  if (info.kakaoRoom) entry.kakao_room = info.kakaoRoom.trim();
  if (info.storeUrl) entry.store_url = info.storeUrl.trim();
  entry.active = true;
  if (!await saveBrandRegistry({ ...reg, brands })) return { ok: false, msg: '명부 저장 실패 — 다시 시도하세요' };

  // 2) 수집 계정 등록 (다음날 새벽부터 수집)
  for (const a of accounts) {
    const { data: exist } = await sb.from('collector_advertisers').select('id').eq('account_id', String(a.account_id)).limit(1);
    if (exist && exist.length) {
      await sb.from('collector_advertisers').update({ active: true }).eq('id', exist[0].id);
      log.push(`계정 ${a.name}: 이미 수집 중 (활성 확인)`);
    } else {
      await sb.from('collector_advertisers').insert({
        id: 'adv_' + uid(), name: a.name.trim(), account_id: String(a.account_id).trim(),
        source: a.source || 'search', owner_name: '오름히', active: true });
      log.push(`계정 ${a.name}: 수집 목록에 추가`);
    }
  }

  // 3) 담당 직원 배정
  const { data: users } = await sb.from('users').select('id,name,role,assigned_brands');
  const staffUser = (users || []).find(u => u.name === info.staff.trim());
  if (staffUser) {
    let bs = []; try { bs = JSON.parse(staffUser.assigned_brands || '[]'); } catch { /* ignore */ }
    if (!bs.includes(brand)) {
      bs.push(brand);
      await sb.from('users').update({ assigned_brands: JSON.stringify(bs) }).eq('id', staffUser.id);
      log.push(`담당 배정: ${info.staff}`);
    }
  }

  // 4) 목표 (있으면)
  if (info.targetRoas || info.dailyBudget) {
    await sb.from('brand_targets').upsert({ brand,
      target_roas: +info.targetRoas || null, daily_budget: +info.dailyBudget || null,
      updated_by: '브랜드등록', updated_at: new Date().toISOString() });
    log.push('목표 저장');
  }

  // 5) 카톡방 (있으면)
  if (info.kakaoRoom && staffUser) {
    await sb.from('chat_room_owner').upsert({ room_name: info.kakaoRoom.trim(),
      owner_id: staffUser.id, staff_name: staffUser.name, client_name: brand,
      active: true, updated_at: new Date().toISOString() }, { onConflict: 'room_name' });
    log.push('대화분석 카톡방 연결');
  }

  // 6) 담당 일괄 연동 (순위·후기·대화 담당 맞춤)
  try { await syncStaffAssignments(); log.push('담당 일괄 연동 실행'); } catch { /* ignore */ }
  return { ok: true, msg: log.join(' · ') };
}

// 브랜드 삭제 — 모든 화면·수집·담당에서 제거. 광고비 원본(ad_data)은 보관.
export async function deleteBrandEverywhere(brand) {
  if (!sb || !brand) return { ok: false, msg: '' };
  const done = [];
  const reg = await fetchBrandRegistry();
  const entry = (reg.brands || []).find(b => b.brand === brand);

  // 1) 수집 중지 — 이 브랜드만 쓰는 계정만 끈다 (벌크 계정 보호)
  if (entry) {
    const otherAccounts = new Set();
    (reg.brands || []).forEach(b => { if (b.brand !== brand && b.active !== false) (b.accounts || []).forEach(a => otherAccounts.add(String(a.account_id))); });
    for (const a of (entry.accounts || [])) {
      if (!otherAccounts.has(String(a.account_id))) {
        await sb.from('collector_advertisers').update({ active: false }).eq('account_id', String(a.account_id));
        done.push(`수집 중지: ${a.name}`);
      } else done.push(`계정 ${a.name}: 다른 브랜드가 사용 중 — 수집 유지`);
    }
  }
  // 2) 명부에서 제거
  if (entry) { reg.brands = reg.brands.filter(b => b.brand !== brand); await saveBrandRegistry(reg); done.push('명부에서 제거'); }
  // 3) 매핑 삭제 → 홈·성과·리포트 등 모든 화면에서 사라짐 (광고비 원본은 보관)
  await sb.from('mappings').delete().eq('brand', brand); invalidateMappingsCache(); done.push('매핑 삭제');
  // 4) 담당 배정 제거 (전 직원)
  const { data: users } = await sb.from('users').select('id,name,assigned_brands');
  for (const u of (users || [])) {
    let bs = []; try { bs = JSON.parse(u.assigned_brands || '[]'); } catch { /* ignore */ }
    if (bs.includes(brand)) {
      await sb.from('users').update({ assigned_brands: JSON.stringify(bs.filter(x => x !== brand)) }).eq('id', u.id);
      done.push(`담당 해제: ${u.name}`);
    }
  }
  // 5) 목표·순위·후기·공유링크·카톡방
  await sb.from('brand_targets').delete().eq('brand', brand);
  await sb.from('rank_products').delete().eq('brand', brand);
  await sb.from('review_store_map').delete().eq('brand', brand);
  await sb.from('share_links').delete().eq('brand', brand);
  await sb.from('chat_room_owner').update({ active: false, updated_at: new Date().toISOString() }).eq('client_name', brand);
  done.push('목표·순위·후기·공유링크·카톡방 정리');
  // 6) 재집계 → ad_daily에서 브랜드 소멸
  notifyAggChanged();
  return { ok: true, msg: done.join(' · ') };
}
