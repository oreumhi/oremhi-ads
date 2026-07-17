// ============================================
// 자동 수집 업체 관리 - DB 함수
//   collector_advertisers : 보고서 자동수집 대상 업체
//   대시보드에서 추가/삭제/일시중지 → 수집기가 매 실행 시 이 테이블을 읽음
// ============================================

import { sb } from './store';
import { uid } from './utils';

export async function fetchCollectorAdvertisers() {
  if (!sb) return [];
  const { data, error } = await sb.from('collector_advertisers')
    .select('*').order('source').order('name');
  if (error) { console.error('[collector_advertisers] 조회:', error.message); return []; }
  return data || [];
}

export async function addCollectorAdvertiser({ name, account_id, source }) {
  if (!sb) return { ok: false, msg: 'DB 연결이 없습니다' };
  const nm = (name || '').trim();
  const acc = String(account_id || '').trim();
  if (!nm) return { ok: false, msg: '업체 이름을 입력하세요' };
  if (!/^\d+$/.test(acc)) return { ok: false, msg: '광고계정 번호는 숫자만 입력하세요 (광고주센터 주소창의 숫자)' };
  const { error } = await sb.from('collector_advertisers').insert({
    id: uid(), name: nm, account_id: acc,
    source: source === 'gfa' ? 'gfa' : 'search',
    owner_name: '오름히', active: true,
  });
  if (error) {
    if ((error.message || '').includes('duplicate')) return { ok: false, msg: '이미 등록된 업체입니다 (이름 또는 계정번호 중복)' };
    return { ok: false, msg: error.message };
  }
  return { ok: true };
}

export async function setAdvertiserActive(id, active) {
  if (!sb || !id) return false;
  const { error } = await sb.from('collector_advertisers').update({ active: !!active }).eq('id', id);
  return !error;
}

export async function deleteCollectorAdvertiser(id) {
  if (!sb || !id) return false;
  const { error } = await sb.from('collector_advertisers').delete().eq('id', id);
  return !error;
}
