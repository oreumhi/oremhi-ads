// ============================================
// 순위 체크 (adrank) - DB 함수
//   rank_products : 순위 체크 대상(브랜드/제품/키워드), 담당자 지정
//   rank_history  : 각 직원 PC가 올린 수집 결과
// ============================================

import { sb } from './store';
import { uid } from './utils';

// ─── 대상(브랜드/제품/키워드) ───
export async function fetchRankProducts() {
  if (!sb) return [];
  const { data, error } = await sb.from('rank_products')
    .select('*').order('brand').order('product').limit(1000);
  if (error) { console.error('[rank_products] 조회:', error.message); return []; }
  return data || [];
}

export async function addRankProduct(p) {
  if (!sb || !p.brand) return { ok: false, msg: '브랜드명은 필수입니다' };
  const row = {
    id: uid(),
    owner_id: p.owner_id || null, staff_name: p.staff_name || null,
    brand: p.brand, domain: p.domain || '', product: p.product || '',
    ad_titles: p.ad_titles || [],
    shopping_keywords: p.shopping_keywords || [],
    powerlink_keywords: p.powerlink_keywords || [],
    active: true,
  };
  const { error } = await sb.from('rank_products').insert(row);
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

export async function updateRankProduct(id, updates) {
  if (!sb || !id) return false;
  const { error } = await sb.from('rank_products').update(updates).eq('id', id);
  return !error;
}

export async function deleteRankProduct(id) {
  if (!sb || !id) return false;
  const { error } = await sb.from('rank_products').delete().eq('id', id);
  return !error;
}

// 담당자 지정(그때그때 → 기억) : 대상 + 지금까지 쌓인 결과의 담당자도 갱신
export async function setRankOwner(id, ownerId, staffName) {
  if (!sb || !id) return false;
  const { data, error } = await sb.from('rank_products')
    .update({ owner_id: ownerId || null, staff_name: staffName || null })
    .eq('id', id).select('brand,product').single();
  if (error) return false;
  if (data) {
    await sb.from('rank_history')
      .update({ owner_id: ownerId || null, staff_name: staffName || null })
      .eq('brand', data.brand).eq('product', data.product);
  }
  return true;
}

// ─── 결과(수집 이력) ───
// 최근 데이터 조회 (직원이면 본인 것만). 최신 순위 계산은 화면에서.
export async function fetchRankHistory(ownerId, sinceISO) {
  if (!sb) return [];
  let q = sb.from('rank_history').select('*')
    .order('collected_at', { ascending: false }).limit(3000);
  if (ownerId) q = q.eq('owner_id', ownerId);
  if (sinceISO) q = q.gte('collected_at', sinceISO);
  const { data, error } = await q;
  if (error) { console.error('[rank_history] 조회:', error.message); return []; }
  return data || [];
}

// ─── 경쟁사 레이더 ───
// 매일 새벽 수집한 검색결과 상위 경쟁 상품/업체 스냅샷.
export async function fetchRadarDates() {
  if (!sb) return [];
  const { data, error } = await sb.from('market_radar').select('date')
    .order('date', { ascending: false }).limit(3000);
  if (error) return [];
  return [...new Set((data || []).map(r => r.date))];
}

export async function fetchRadar(date) {
  if (!sb || !date) return [];
  const { data, error } = await sb.from('market_radar').select('*')
    .eq('date', date).order('pos', { ascending: true }).limit(3000);
  if (error) { console.error('[market_radar] 조회:', error.message); return []; }
  return data || [];
}

export async function fetchRadarAlerts(date) {
  if (!sb || !date) return [];
  const { data, error } = await sb.from('market_radar_alerts').select('*').eq('date', date).limit(500);
  if (error) return [];
  return data || [];
}
