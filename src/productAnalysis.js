// ============================================
// 상품 분석 - DB 함수 (요청 등록/조회/삭제)
//   실행은 수동: 바탕화면 '상품분석' 폴더의 상품분석_실행.bat
// ============================================

import { sb } from './store';
import { uid } from './utils';

export async function fetchAnalyses() {
  if (!sb) return [];
  const { data, error } = await sb.from('product_analysis')
    .select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { console.error('[product_analysis]', error.message); return []; }
  return data || [];
}

export async function requestAnalysis(storeUrl, requestedBy) {
  if (!sb) return { ok: false, msg: 'DB 연결 없음' };
  const u = (storeUrl || '').trim();
  if (!/smartstore\.naver\.com\/[\w-]+|brand\.naver\.com\/[\w-]+/.test(u))
    return { ok: false, msg: '스마트스토어/브랜드스토어 주소를 입력하세요 (예: https://smartstore.naver.com/스토어명)' };
  const { error } = await sb.from('product_analysis').insert({
    id: uid(), store_url: u.split('?')[0], requested_by: requestedBy || '', status: '대기',
  });
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

export async function deleteAnalysis(id) {
  if (!sb || !id) return false;
  await sb.from('product_analysis_items').delete().eq('analysis_id', id);
  const { error } = await sb.from('product_analysis').delete().eq('id', id);
  return !error;
}

export async function fetchAnalysisItems(analysisId) {
  if (!sb) return [];
  const { data, error } = await sb.from('product_analysis_items')
    .select('*').eq('analysis_id', analysisId).order('review_count', { ascending: false });
  if (error) return [];
  return data || [];
}
