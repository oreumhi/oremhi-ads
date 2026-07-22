// ============================================
// 대화 분석: 카톡 파일 파싱 + DB 함수
//
// 카톡 내보내기 형식 2가지 모두 지원:
//   PC:     [이름] [오전 10:42] 메시지
//   모바일:  2026. 1. 5. 오전 10:42, 이름 : 메시지
// ============================================

import { sb } from './store';
import { uid } from './utils';

// ─── 카톡 내보내기 파일 파싱 ───
export function parseKakaoExport(text) {
  const lines = text.split('\n');
  const msgs = [];
  let curDate = null;
  let roomName = '';

  // 첫 줄: "◯◯ 님과 카카오톡 대화"
  const firstLine = (lines[0] || '').trim();
  const roomMatch = firstLine.match(/^(.+?)\s*님과 카카오톡 대화/);
  if (roomMatch) roomName = roomMatch[1].trim();

  // 날짜 구분선: --------------- 2026년 1월 5일 월요일 ---------------
  const dateSep = /-{3,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/;
  // PC 메시지: [이름] [오전 10:42] 내용
  const pcMsg = /^\[(.+?)\] \[(오전|오후) (\d{1,2}):(\d{2})\] ?(.*)$/;
  // 모바일 메시지: 2026. 1. 5. 오전 10:42, 이름 : 내용
  const moMsg = /^(\d{4})\. (\d{1,2})\. (\d{1,2})\.? (오전|오후) (\d{1,2}):(\d{2}), (.+?) : (.*)$/;

  const pad = n => String(n).padStart(2, '0');

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    const d = line.match(dateSep);
    if (d) { curDate = `${d[1]}-${pad(d[2])}-${pad(d[3])}`; continue; }

    let m = line.match(pcMsg);
    if (m) {
      msgs.push({ date: curDate, sender: m[1], text: m[5] });
      continue;
    }
    m = line.match(moMsg);
    if (m) {
      msgs.push({ date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, sender: m[7], text: m[8] });
      continue;
    }
    // 이어지는 줄 (여러 줄 메시지)
    if (msgs.length > 0 && line && !line.startsWith('---') && !/님이 .*(초대했습니다|나갔습니다)/.test(line)) {
      msgs[msgs.length - 1].text += '\n' + line;
    }
  }

  const dates = msgs.map(m => m.date).filter(Boolean).sort();
  return {
    roomName,
    msgCount: msgs.length,
    firstDate: dates[0] || null,
    lastDate: dates[dates.length - 1] || null,
    valid: msgs.length > 0 && !!roomName,
  };
}

// 방 이름에서 광고주명 추정: "아이앤카x오름히 SA" → "아이앤카"
export function guessClientName(roomName) {
  if (!roomName) return '';
  let n = roomName;
  n = n.split(/[xX×]/)[0];                  // x오름히 앞부분
  n = n.replace(/오름히|단톡방|SA|GFA/gi, '');
  n = n.replace(/[_\-,·]/g, ' ').trim();
  return n || roomName;
}

// ─── DB 함수 ───

// 업로드 목록 (직원: 본인 것만 / 관리자: 전체) - 원문(content) 제외하고 조회
export async function fetchChatUploads(ownerId) {
  if (!sb) return [];
  let q = sb.from('chat_uploads')
    .select('id,owner_id,uploader_name,room_name,client_name,file_name,msg_count,first_date,last_date,new_from,status,created_at')
    .order('created_at', { ascending: false })
    .limit(300);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) { console.error('[chat_uploads] 조회:', error.message); return []; }
  return data || [];
}

// 같은 방의 마지막 업로드 확인 (중복 기간 계산용)
export async function findPrevUpload(ownerId, roomName) {
  if (!sb) return null;
  const { data } = await sb.from('chat_uploads')
    .select('last_date')
    .eq('owner_id', ownerId)
    .eq('room_name', roomName)
    .order('last_date', { ascending: false })
    .limit(1);
  return data && data[0] ? data[0] : null;
}

export async function insertChatUpload(item) {
  if (!sb) return null;
  const { data, error } = await sb.from('chat_uploads').insert({ ...item, id: uid() }).select('id').single();
  if (error) { console.error('[chat_uploads] 추가:', error.message); return null; }
  return data;
}

export async function deleteChatUpload(id) {
  if (!sb) return false;
  const { error } = await sb.from('chat_uploads').delete().eq('id', id);
  return !error;
}

// 점수 목록 (직원: 본인 것만 / 관리자: 전체)
export async function fetchChatScores(ownerId) {
  if (!sb) return [];
  let q = sb.from('chat_scores').select('*').order('period_end', { ascending: false }).limit(500);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) { console.error('[chat_scores] 조회:', error.message); return []; }
  return data || [];
}

// 캘린더 메모 조회 (최근 fromDate 이후, 직원이면 본인 것만)
export async function fetchChatNotes(ownerId, fromDate) {
  if (!sb) return [];
  let q = sb.from('chat_daily_notes').select('*').gte('date', fromDate).order('date', { ascending: true }).limit(2000);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) { console.error('[chat_daily_notes] 조회:', error.message); return []; }
  return data || [];
}

// 관리자: 대화 원문 보기
export async function fetchChatContent(uploadId) {
  if (!sb) return '';
  const { data, error } = await sb.from('chat_uploads').select('content').eq('id', uploadId).single();
  if (error || !data) return '';
  return data.content || '';
}

// ═══════════════════════════════════════════
// 후기 체크 (review_checks)
// ═══════════════════════════════════════════

export async function fetchReviewChecks(date, ownerId) {
  if (!sb) return [];
  let q = sb.from('review_checks').select('*').eq('date', date).order('store', { ascending: true }).limit(2000);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) { console.error('[review_checks] 조회:', error.message); return []; }
  return data || [];
}

export async function fetchReviewChecksRange(fromDate, toDate, ownerId) {
  if (!sb) return [];
  let q = sb.from('review_checks').select('*')
    .gte('date', fromDate).lte('date', toDate)
    .order('date', { ascending: false }).limit(5000);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) { console.error('[review_checks] 기간 조회:', error.message); return []; }
  return data || [];
}

export async function fetchReviewDates(ownerId) {
  if (!sb) return [];
  let q = sb.from('review_checks').select('date').order('date', { ascending: false }).limit(2000);
  if (ownerId) q = q.eq('owner_id', ownerId);
  const { data, error } = await q;
  if (error) return [];
  return [...new Set((data || []).map(r => r.date))];
}

export async function fetchReviewStoreMap() {
  if (!sb) return [];
  const { data, error } = await sb.from('review_store_map').select('*');
  if (error) { console.error('[review_store_map] 조회:', error.message); return []; }
  return data || [];
}

export async function setReviewStoreOwner(store, ownerId, brand) {
  if (!sb) return false;
  const up = await sb.from('review_store_map').upsert(
    { store, owner_id: ownerId || null, brand: brand || store, updated_at: new Date().toISOString() },
    { onConflict: 'store' });
  if (up.error) { console.error('[review_store_map] 저장:', up.error.message); return false; }
  await sb.from('review_checks').update({ owner_id: ownerId || null, brand: brand || store }).eq('store', store);
  return true;
}

// ─── 후기 별칭 (스토어명/상품명 대시보드에서 수정 → 기억) ───
export async function fetchReviewAliases() {
  if (!sb) return { products: {}, stores: {} };
  const [pa, sa] = await Promise.all([
    sb.from('review_product_alias').select('url,display_name'),
    sb.from('review_store_alias').select('store,display_name'),
  ]);
  const products = {}; (pa.data || []).forEach(r => { if (r.display_name) products[r.url] = r.display_name; });
  const stores = {}; (sa.data || []).forEach(r => { if (r.display_name) stores[r.store] = r.display_name; });
  return { products, stores };
}

export async function setProductAlias(url, name) {
  if (!sb || !url) return false;
  const { error } = await sb.from('review_product_alias').upsert(
    { url, display_name: name || null, updated_at: new Date().toISOString() }, { onConflict: 'url' });
  return !error;
}

export async function setStoreAlias(store, name) {
  if (!sb || !store) return false;
  const { error } = await sb.from('review_store_alias').upsert(
    { store, display_name: name || null, updated_at: new Date().toISOString() }, { onConflict: 'store' });
  return !error;
}

// ─── 후기 대상 매장/상품 관리 (review_products) ───
export async function fetchReviewProducts() {
  if (!sb) return [];
  const { data, error } = await sb.from('review_products').select('*').eq('active', true).order('store').order('sort_order').limit(2000);
  if (error) { console.error('[review_products] 조회:', error.message); return []; }
  return data || [];
}

export async function addReviewProduct({ store, name, url }) {
  if (!sb || !store || !url) return { ok: false, msg: '매장과 URL은 필수입니다' };
  const id = uid();
  const { error } = await sb.from('review_products').upsert(
    { id, store, name: name || '', url, active: true }, { onConflict: 'url' });
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

export async function deleteReviewProduct(url) {
  if (!sb || !url) return false;
  const { error } = await sb.from('review_products').delete().eq('url', url);
  return !error;
}

// 매장 전체 삭제 (그 매장의 상품 목록 제거 → 다음 실행부터 점검 안 함)
export async function deleteReviewStore(store) {
  if (!sb || !store) return false;
  const { error } = await sb.from('review_products').delete().eq('store', store);
  return !error;
}

// ═══════════════════════════════════════════
// 대화 자동수집: 방별 담당자 기억 (chat_room_owner)
// 카톡 "대화 분석" 폴더의 방을 자동 내보내기할 때 담당자를 기억
// ═══════════════════════════════════════════

export async function fetchChatRoomOwners() {
  if (!sb) return [];
  const { data, error } = await sb.from('chat_room_owner')
    .select('*').order('room_name', { ascending: true }).limit(500);
  if (error) { console.error('[chat_room_owner] 조회:', error.message); return []; }
  return data || [];
}

// 방 담당자 지정(그때그때) → 기억. 기존 업로드/점수의 담당자도 함께 갱신.
export async function setChatRoomOwner(roomName, ownerId, staffName, clientName) {
  if (!sb || !roomName) return false;
  const up = await sb.from('chat_room_owner').upsert(
    { room_name: roomName, owner_id: ownerId || null, staff_name: staffName || null,
      client_name: clientName || null, active: true, updated_at: new Date().toISOString() },
    { onConflict: 'room_name' });
  if (up.error) { console.error('[chat_room_owner] 저장:', up.error.message); return false; }
  // 이미 올라온 이 방의 업로드에도 담당자 반영
  await sb.from('chat_uploads').update({ owner_id: ownerId || null, uploader_name: staffName || '자동수집' })
    .eq('room_name', roomName);
  return true;
}

// 방을 자동수집 대상에서 제외/포함
export async function setChatRoomActive(roomName, active) {
  if (!sb || !roomName) return false;
  const { error } = await sb.from('chat_room_owner')
    .update({ active: !!active, updated_at: new Date().toISOString() }).eq('room_name', roomName);
  return !error;
}
