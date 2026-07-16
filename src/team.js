// ============================================
// 팀 업무 관리 - DB 함수
//   daily_reports : 일일보고 (사람당 하루 1건)
//   meetings      : 회의록
//   action_items  : 액션아이템 (회의 연결/단독, 완료 추적)
// ============================================

import { sb } from './store';
import { uid } from './utils';

// ─── 일일보고 ───

// 특정 날짜의 전원 보고 (대표 모아보기)
export async function fetchReportsByDate(dateStr) {
  if (!sb) return [];
  const { data, error } = await sb.from('daily_reports')
    .select('*').eq('report_date', dateStr).order('staff_name');
  if (error) { console.error('[daily_reports] 조회:', error.message); return []; }
  return data || [];
}

// 본인 최근 보고 이력
export async function fetchMyReports(ownerId, limit = 14) {
  if (!sb || !ownerId) return [];
  const { data, error } = await sb.from('daily_reports')
    .select('*').eq('owner_id', ownerId)
    .order('report_date', { ascending: false }).limit(limit);
  if (error) { console.error('[daily_reports] 이력:', error.message); return []; }
  return data || [];
}

// 기간 전체 보고 (스코어보드 제출률 계산용)
export async function fetchReportsRange(fromDate, toDate) {
  if (!sb) return [];
  const { data, error } = await sb.from('daily_reports')
    .select('owner_id,staff_name,report_date')
    .gte('report_date', fromDate).lte('report_date', toDate).limit(1000);
  if (error) { console.error('[daily_reports] 기간:', error.message); return []; }
  return data || [];
}

// 작성/수정 (하루 1건 upsert — ceo_comment는 건드리지 않음)
export async function upsertDailyReport({ owner_id, staff_name, report_date, done, tomorrow, blocker }) {
  if (!sb || !owner_id || !report_date) return { ok: false, msg: '필수값 누락' };
  const row = {
    id: owner_id + '_' + report_date,   // 결정적 id → 중복 원천 차단
    owner_id, staff_name: staff_name || '',
    report_date, done: done || '', tomorrow: tomorrow || '', blocker: blocker || '',
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from('daily_reports').upsert(row, { onConflict: 'id' });
  if (error) return { ok: false, msg: error.message };
  return { ok: true };
}

// 대표 코멘트
export async function setCeoComment(id, comment) {
  if (!sb || !id) return false;
  const { error } = await sb.from('daily_reports')
    .update({ ceo_comment: comment || '', updated_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

// ─── 회의록 ───

export async function fetchMeetings(limit = 30) {
  if (!sb) return [];
  const { data, error } = await sb.from('meetings')
    .select('*').order('meeting_date', { ascending: false })
    .order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('[meetings] 조회:', error.message); return []; }
  return data || [];
}

export async function addMeeting({ meeting_date, title, notes, created_by }) {
  if (!sb || !meeting_date) return { ok: false, msg: '날짜는 필수입니다' };
  const row = { id: uid(), meeting_date, title: title || '', notes: notes || '', created_by: created_by || '' };
  const { data, error } = await sb.from('meetings').insert(row).select().single();
  if (error) return { ok: false, msg: error.message };
  return { ok: true, meeting: data };
}

export async function updateMeeting(id, { title, notes, meeting_date }) {
  if (!sb || !id) return false;
  const upd = { updated_at: new Date().toISOString() };
  if (title !== undefined) upd.title = title;
  if (notes !== undefined) upd.notes = notes;
  if (meeting_date !== undefined) upd.meeting_date = meeting_date;
  const { error } = await sb.from('meetings').update(upd).eq('id', id);
  return !error;
}

// 회의 삭제 시 소속 액션도 함께 삭제 (고아 데이터 방지)
export async function deleteMeeting(id) {
  if (!sb || !id) return false;
  await sb.from('action_items').delete().eq('meeting_id', id);
  const { error } = await sb.from('meetings').delete().eq('id', id);
  return !error;
}

// ─── 액션아이템 ───

// 미완료 전체 (회의 화면 상단 "지난 액션" + 스코어보드)
export async function fetchOpenActions() {
  if (!sb) return [];
  const { data, error } = await sb.from('action_items')
    .select('*').eq('done', false)
    .order('due_date', { ascending: true, nullsFirst: false }).limit(300);
  if (error) { console.error('[action_items] 미완료:', error.message); return []; }
  return data || [];
}

// 전체 (최근 N개 — 스코어보드 완료율 계산용)
export async function fetchAllActions(limit = 500) {
  if (!sb) return [];
  const { data, error } = await sb.from('action_items')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) { console.error('[action_items] 전체:', error.message); return []; }
  return data || [];
}

export async function fetchActionsByMeeting(meetingId) {
  if (!sb || !meetingId) return [];
  const { data, error } = await sb.from('action_items')
    .select('*').eq('meeting_id', meetingId).order('created_at');
  if (error) { console.error('[action_items] 회의별:', error.message); return []; }
  return data || [];
}

export async function addAction({ meeting_id, content, assignee_id, assignee_name, due_date }) {
  if (!sb || !content) return { ok: false, msg: '내용은 필수입니다' };
  const row = {
    id: uid(), meeting_id: meeting_id || null, content,
    assignee_id: assignee_id || null, assignee_name: assignee_name || '',
    due_date: due_date || null, done: false,
  };
  const { data, error } = await sb.from('action_items').insert(row).select().single();
  if (error) return { ok: false, msg: error.message };
  return { ok: true, action: data };
}

export async function toggleAction(id, done) {
  if (!sb || !id) return false;
  const { error } = await sb.from('action_items')
    .update({ done: !!done, done_at: done ? new Date().toISOString() : null }).eq('id', id);
  return !error;
}

export async function deleteAction(id) {
  if (!sb || !id) return false;
  const { error } = await sb.from('action_items').delete().eq('id', id);
  return !error;
}

// ─── 캘린더 ───

// 기간 내 일정 (기간 일정은 걸쳐 있으면 포함, 숨김 처리된 자동항목 제외)
export async function fetchEventsRange(fromDate, toDate) {
  if (!sb) return [];
  const { data, error } = await sb.from('calendar_events')
    .select('*').lte('event_date', toDate)
    .or(`end_date.gte.${fromDate},event_date.gte.${fromDate}`)
    .neq('status', 'dismissed')
    .order('event_date').limit(1000);
  if (error) { console.error('[calendar] 조회:', error.message); return []; }
  return data || [];
}

export async function addCalEvent(ev) {
  if (!sb || !ev.event_date || !ev.etype) return { ok: false, msg: '날짜/유형 누락' };
  const row = { id: uid(), source: 'manual', status: 'ok', attachments: [], ...ev };
  const { data, error } = await sb.from('calendar_events').insert(row).select().single();
  if (error) return { ok: false, msg: error.message };
  return { ok: true, event: data };
}

export async function updateCalEvent(id, updates) {
  if (!sb || !id) return false;
  const { error } = await sb.from('calendar_events')
    .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  return !error;
}

// 수동 일정: 완전 삭제 / 자동 일정: 숨김(재등록 방지)
export async function removeCalEvent(ev) {
  if (!sb || !ev?.id) return false;
  if (ev.source === 'manual') {
    const { error } = await sb.from('calendar_events').delete().eq('id', ev.id);
    return !error;
  }
  return updateCalEvent(ev.id, { status: 'dismissed' });
}

// 성과 경고 조치 완료
export async function resolveEvent(id, memo, byName) {
  if (!sb || !id) return false;
  return updateCalEvent(id, { status: 'resolved', resolve_memo: memo || '', resolved_by: byName || '', resolved_at: new Date().toISOString() });
}

// 미조치 성과 경고 (아침 알림용)
export async function fetchOpenPerfAlerts() {
  if (!sb) return [];
  const { data, error } = await sb.from('calendar_events')
    .select('*').eq('etype', 'perf').eq('status', 'needs_check')
    .order('event_date', { ascending: false }).limit(50);
  if (error) return [];
  return data || [];
}

// 오늘 약속 (아침 알림용)
export async function fetchTodayPromises(dateStr) {
  if (!sb) return [];
  const { data, error } = await sb.from('calendar_events')
    .select('*').eq('etype', 'promise').eq('event_date', dateStr).neq('status', 'dismissed')
    .limit(50);
  if (error) return [];
  return data || [];
}

// 사진 업로드 → 공개 URL 반환
export async function uploadAttachment(blob, filename) {
  if (!sb) return null;
  const ext = (filename || 'photo.jpg').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const ym = new Date().toISOString().slice(0, 7);
  const path = `${ym}/${uid()}.${ext === 'png' ? 'png' : 'jpg'}`;
  const { error } = await sb.storage.from('attachments').upload(path, blob, {
    contentType: blob.type || 'image/jpeg', upsert: true,
  });
  if (error) { console.error('[storage] 업로드:', error.message); return null; }
  const { data } = sb.storage.from('attachments').getPublicUrl(path);
  return { url: data.publicUrl, path, name: filename || 'photo.jpg' };
}
