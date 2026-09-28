// ============================================
// 홈 대시보드
//   최상단 공지사항(확인 체크·댓글) → ① 어제 성과 헤더 → ② 오늘 챙길 것(통합 경보)
//   → ③ 광고주 신호등 보드 → ④ 자동화 가동 상태 → ⑤ 팀 현황 미니
//   직원은 담당 브랜드 기준으로 자동 필터.
//
// ※ 2026-09-28 '지난 날짜 보기' 추가 (대표님 요청)
//   ①~③(성과 카드·챙길 것·신호등)을 지난 날짜 기준으로 다시 볼 수 있습니다.
//   · 맨 위 카드 오른쪽 ◀ 날짜 ▶ 로 '성과일'을 고릅니다. 기본값은 어제(= 평소 홈).
//   · 성과일 X를 고르면 'X 다음날 아침에 홈을 열었을 때의 화면'을 그날 기록으로 다시 계산합니다.
//       성과 카드  : X일 vs X-1일
//       신호등     : X일 광고비·매출 / X까지 7일 vs 그 전 7일 / 작년 같은 때
//       챙길 것    : X까지의 성과 경고·목표 미달, X+1일 후기 점검·경쟁사 알림·약속, X+1일까지 순위
//   · ④ 자동화 상태·⑤ 팀 현황은 날짜와 무관하게 항상 '지금' 상태입니다.
//   · 브랜드 목표(ROAS·1일 예산)는 과거 값이 남지 않아 지금 설정값으로 계산합니다(화면에 표기).
//   · 계산은 homeCompute.js로 옮겼고, 평소 화면(어제)은 예전과 결과가 완전히 같습니다.
// ============================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { C } from '../config';
import { sb, fetchAdDaily, fetchAdDailyWindow, fetchUsers, fetchBrandTargets } from '../store';
import { fetchTodayPromises, fetchOpenPerfAlerts, fetchPerfAlertsRange, fetchReportsByDate, fetchOpenActions, fetchEventsRange } from '../team';
import { fetchChatScores, fetchChatUploads, fetchReviewChecks, fetchReviewStoreMap } from '../chat';
import { fetchRankHistory, fetchRankProducts } from '../rank';
import { fmtNum, uid, today } from '../utils';
import {
  addDays, won, dayLabel, mdLabel, timeAgo, MIN_DATE, endOfDayKstISO,
  computeHero, computeBoard, computeJobs,
} from '../homeCompute';

// 공용 카드
const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 14, padding: '16px 18px' };
const secTitle = (icon, text, extra) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
    <span style={{ fontSize: 15 }}>{icon}</span>
    <b style={{ fontSize: 14, color: C.tx }}>{text}</b>
    {extra}
  </div>
);
const Dot = ({ color, title }) => (
  <span title={title} style={{ display: 'inline-block', width: 11, height: 11, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}55`, verticalAlign: 'middle' }} />
);

// ─────────────────────────────────────────────
// 공지사항
// ─────────────────────────────────────────────
function NoticeBoard({ currentUser, isAdmin }) {
  const [notices, setNotices] = useState([]);
  const [replies, setReplies] = useState([]);
  const [members, setMembers] = useState([]);    // 전 직원(대표 포함) — 확인 여부 표시용
  const [draft, setDraft] = useState('');
  const [comment, setComment] = useState({});   // notice_id → 입력값
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(false);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data: ns } = await sb.from('notices').select('*').eq('pinned', true).order('created_at', { ascending: false }).limit(10);
    const ids = (ns || []).map(n => n.id);
    let rs = [];
    if (ids.length) {
      const { data } = await sb.from('notice_replies').select('*').in('notice_id', ids).order('created_at', { ascending: true });
      rs = data || [];
    }
    setNotices(ns || []); setReplies(rs);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchUsers().then(us => setMembers((us || []).sort((a, b) => (a.role === 'admin' ? -1 : 1) - (b.role === 'admin' ? -1 : 1)))); }, []);

  const post = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    await sb.from('notices').insert({ id: uid(), content: text, created_by: currentUser?.name || '', pinned: true });
    setDraft(''); setWriting(false); await load(); setBusy(false);
  };
  const unpin = async (n) => {
    if (!window.confirm('이 공지를 내리시겠습니까? (목록에서 사라집니다)')) return;
    await sb.from('notices').update({ pinned: false }).eq('id', n.id); await load();
  };
  const toggleAck = async (n) => {
    if (busy) return; setBusy(true);
    const mine = replies.find(r => r.notice_id === n.id && r.kind === '확인' && r.user_id === currentUser?.id);
    if (mine) await sb.from('notice_replies').delete().eq('id', mine.id);
    else await sb.from('notice_replies').insert({ id: uid(), notice_id: n.id, user_id: currentUser?.id, user_name: currentUser?.name || '', kind: '확인' });
    await load(); setBusy(false);
  };
  const addComment = async (n) => {
    const text = (comment[n.id] || '').trim();
    if (!text || busy) return; setBusy(true);
    await sb.from('notice_replies').insert({ id: uid(), notice_id: n.id, user_id: currentUser?.id, user_name: currentUser?.name || '', kind: '댓글', text });
    setComment(c => ({ ...c, [n.id]: '' })); await load(); setBusy(false);
  };
  const delComment = async (r) => {
    if (!window.confirm('댓글을 삭제할까요?')) return;
    await sb.from('notice_replies').delete().eq('id', r.id); await load();
  };

  if (!notices.length && !isAdmin) return null;

  return (
    <div style={{ ...card, borderColor: '#3a3050', background: `linear-gradient(135deg, #191430 0%, ${C.sf} 55%)`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.pur}, ${C.ac}, transparent)` }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: notices.length || writing ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>📢</span>
          <b style={{ fontSize: 14.5, color: C.tx }}>공지사항</b>
          {notices.length > 0 && <span style={{ fontSize: 10.5, color: C.pur, background: '#9d7ff022', border: '1px solid #9d7ff044', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{notices.length}건</span>}
        </div>
        {isAdmin && !writing && (
          <button onClick={() => setWriting(true)} style={{ background: C.pur, border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ 공지 작성</button>
        )}
      </div>

      {isAdmin && writing && (
        <div style={{ marginBottom: 14, background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 12 }}>
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3} autoFocus
            placeholder="예) 오늘 중으로 전직원 모두 ○○○ 신청하세요."
            style={{ width: '100%', boxSizing: 'border-box', background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '10px 12px', color: C.tx, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={() => { setWriting(false); setDraft(''); }} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 8, padding: '6px 14px', color: C.txd, fontSize: 12, cursor: 'pointer' }}>취소</button>
            <button onClick={post} disabled={!draft.trim() || busy} style={{ background: draft.trim() ? C.pur : C.sf3, border: 'none', borderRadius: 8, padding: '6px 16px', color: draft.trim() ? '#fff' : C.txm, fontSize: 12, fontWeight: 700, cursor: draft.trim() ? 'pointer' : 'default' }}>등록</button>
          </div>
        </div>
      )}

      {!notices.length && isAdmin && !writing && (
        <div style={{ fontSize: 12, color: C.txm, marginTop: 8 }}>등록된 공지가 없습니다. 전직원에게 알릴 내용을 작성해보세요.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notices.map(n => {
          const acks = replies.filter(r => r.notice_id === n.id && r.kind === '확인');
          const cmts = replies.filter(r => r.notice_id === n.id && r.kind === '댓글');
          const iAcked = acks.some(r => r.user_id === currentUser?.id);
          return (
            <div key={n.id} style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '13px 15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 13.5, color: C.tx, lineHeight: 1.65, whiteSpace: 'pre-wrap', fontWeight: 600, flex: 1 }}>{n.content}</div>
                {isAdmin && <button onClick={() => unpin(n)} title="공지 내리기" style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '2px 8px', color: C.txm, fontSize: 10.5, cursor: 'pointer', flexShrink: 0 }}>내리기</button>}
              </div>
              <div style={{ fontSize: 10.5, color: C.txm, marginTop: 6 }}>{n.created_by || '관리자'} · {timeAgo(n.created_at)}</div>

              {/* 확인 체크 — 확인한 사람은 초록, 아직 안 한 사람은 회색 '미확인' */}
              {(() => {
                const ackedIds = new Set(acks.map(r => r.user_id));
                const roster = members.length ? members : acks.map(r => ({ id: r.user_id, name: r.user_name }));
                const confirmed = roster.filter(m => ackedIds.has(m.id));
                const pending = roster.filter(m => !ackedIds.has(m.id));
                return (
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    <button onClick={() => toggleAck(n)} style={{
                      background: iAcked ? '#3dd9a022' : C.sf3, border: `1px solid ${iAcked ? C.ok : C.bd}`, borderRadius: 20,
                      padding: '4px 13px', color: iAcked ? C.ok : C.txd, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                    }}>{iAcked ? '✔ 확인함' : '확인했어요'}</button>
                    <span style={{ fontSize: 10, color: C.txm, marginLeft: 2 }}>확인 {confirmed.length}/{roster.length}</span>
                    {confirmed.map(m => (
                      <span key={'c' + m.id} style={{ fontSize: 10.5, color: C.ok, background: '#3dd9a014', border: '1px solid #3dd9a033', borderRadius: 10, padding: '2px 9px' }}>✔ {m.name}</span>
                    ))}
                    {pending.map(m => (
                      <span key={'p' + m.id} style={{ fontSize: 10.5, color: C.txm, background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '2px 9px' }}>{m.name} 미확인</span>
                    ))}
                  </div>
                );
              })()}

              {/* 댓글 */}
              {cmts.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cmts.map(r => (
                    <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
                      <b style={{ color: C.ac, flexShrink: 0 }}>{r.user_name}</b>
                      <span style={{ color: C.tx, flex: 1, lineHeight: 1.5 }}>{r.text}</span>
                      <span style={{ color: C.txm, fontSize: 10, flexShrink: 0 }}>{timeAgo(r.created_at)}</span>
                      {(isAdmin || r.user_id === currentUser?.id) && (
                        <button onClick={() => delComment(r)} style={{ background: 'none', border: 'none', color: C.txm, fontSize: 10, cursor: 'pointer', padding: 0 }}>삭제</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <input value={comment[n.id] || ''} onChange={e => setComment(c => ({ ...c, [n.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') addComment(n); }}
                  placeholder="댓글 남기기…"
                  style={{ flex: 1, background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '7px 11px', color: C.tx, fontSize: 12, outline: 'none' }} />
                <button onClick={() => addComment(n)} disabled={!(comment[n.id] || '').trim()} style={{ background: (comment[n.id] || '').trim() ? C.ac : C.sf3, border: 'none', borderRadius: 8, padding: '0 14px', color: (comment[n.id] || '').trim() ? '#fff' : C.txm, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>등록</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ① 성과 헤더 (+ 지난 날짜 고르기)
// ─────────────────────────────────────────────
// 성과일 고르기: ◀ [날짜] ▶ [어제로]
function DateNav({ cur, yday, isPast, onPick, onReset }) {
  // 입력칸은 '입력 중인 값'을 따로 들고 있습니다.
  //   키보드로 연도를 한 자리씩 치면 중간에 0002년 같은 값이 잠깐 생기는데,
  //   그걸 무시하더라도 칸이 원래 날짜로 튕겨 돌아가지 않게 하기 위함입니다.
  const [draft, setDraft] = useState(cur);
  useEffect(() => { setDraft(cur); }, [cur]);
  const canPrev = cur > MIN_DATE;
  const canNext = cur < yday;
  // 수집 시작일보다 앞 날짜를 끝까지 입력한 경우(입력 중인 0002년 등은 제외) → 빨간 테두리로 알림
  const tooOld = !!draft && draft.length === 10 && draft >= '1900-01-01' && draft < MIN_DATE;
  const nb = (on) => ({
    width: 30, height: 30, borderRadius: 8, border: '1px solid #3a4568', background: on ? '#ffffff0d' : 'transparent',
    color: on ? '#dfe5f5' : '#434b68', fontSize: 11, cursor: on ? 'pointer' : 'default', padding: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, color: '#8b95b8', fontWeight: 600 }}>성과일</span>
      <button type="button" title="하루 전" disabled={!canPrev} onClick={() => { if (canPrev) onPick(addDays(cur, -1)); }} style={nb(canPrev)}>◀</button>
      <input type="date" value={draft} min={MIN_DATE} max={yday}
        title={tooOld ? `${MIN_DATE} 이전은 광고 기록이 없어 볼 수 없습니다` : '날짜를 고르면 그날 기준 화면으로 바뀝니다'}
        onChange={e => {
          const v = e.target.value;
          // 어제 이후(오늘·미래)는 아직 성과가 없음 → 곧바로 어제로 되돌려 보여 줌
          if (v && v.length === 10 && v >= MIN_DATE && v > yday) { setDraft(yday); onPick(yday); return; }
          setDraft(v); onPick(v);
        }}
        onBlur={() => setDraft(cur)}
        style={{
          background: isPast ? '#3a2f12' : '#ffffff0d', border: `1px solid ${tooOld ? C.no : isPast ? '#b8912e' : '#3a4568'}`, borderRadius: 8,
          padding: '0 8px', height: 30, boxSizing: 'border-box', color: '#fff', fontSize: 12.5, fontWeight: 700,
          colorScheme: 'dark', outline: 'none', fontFamily: 'inherit',
        }} />
      <button type="button" title="하루 뒤" disabled={!canNext} onClick={() => { if (canNext) onPick(addDays(cur, 1)); }} style={nb(canNext)}>▶</button>
      {isPast && (
        <button type="button" onClick={onReset} title="평소 화면(어제 성과)으로 돌아가기" style={{ height: 30, borderRadius: 8, border: 'none', background: C.ac, color: '#fff', fontSize: 11.5, fontWeight: 700, padding: '0 12px', cursor: 'pointer', flexShrink: 0 }}>어제로</button>
      )}
    </div>
  );
}

function HeroHeader({ hero, allowedBrands, userName, cur, yday, isPast, onPick, onReset, loading, failed, onRetry }) {
  const delta = (c, prev, fmt) => {
    if (!prev) return null;
    const g = (c - prev) / prev * 100;
    const up = g >= 0;
    return <span style={{ fontSize: 11, fontWeight: 700, color: up ? C.ok : C.no }}>{up ? '▲' : '▼'} {Math.abs(g).toFixed(1)}%{fmt ? '' : ''}</span>;
  };
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침입니다' : hour < 17 ? '좋은 오후입니다' : '수고 많으셨습니다';
  const box = (label, value, d) => (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: '#aab3d0', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{value}</div>
      <div style={{ marginTop: 3, minHeight: 14 }}>{d}<span style={{ fontSize: 10, color: '#8890a6', marginLeft: 5 }}>{d ? (isPast ? '전일 대비' : '그제 대비') : ''}</span></div>
    </div>
  );
  const bar = (color, children) => (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: color + '14', border: `1px solid ${color}44`, borderRadius: 9, padding: '7px 11px', marginBottom: 14, fontSize: 11.5, color }}>{children}</div>
  );
  return (
    <div style={{
      borderRadius: 16, padding: '20px 22px', position: 'relative', overflow: 'hidden',
      background: isPast ? 'linear-gradient(135deg, #2d2714 0%, #1a1a1c 60%, #131620 100%)' : 'linear-gradient(135deg, #1c2a52 0%, #151a2e 60%, #131620 100%)',
      border: isPast ? '1px solid #6b5a2a' : '1px solid #2c3554',
    }}>
      {/* 장식 원 — 클릭을 가로채지 않게 pointerEvents 끔 (오른쪽 위 날짜 버튼과 겹침) */}
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, #5b8def22, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, color: '#aab3d0', marginBottom: 3 }}>{greet}, <b style={{ color: '#fff' }}>{userName}</b>님</div>
          <div style={{ fontSize: 11, color: '#7683a8' }}>
            {isPast ? '' : '어제 '}{dayLabel(cur)} {allowedBrands ? '담당 브랜드' : '회사 전체'} 성과 <span style={{ color: '#5c6685' }}>· 전환·매출·ROAS는 구매완료 기준</span>
          </div>
        </div>
        <DateNav cur={cur} yday={yday} isPast={isPast} onPick={onPick} onReset={onReset} />
      </div>
      {isPast && bar(C.yel, (
        <>
          <b>📅 지난 날짜 보기</b>
          <span style={{ color: '#d9cb98' }}>{dayLabel(cur)} 성과 기준으로 그날 기록을 다시 계산한 화면입니다 · 맨 아래 자동화 상태·팀 현황은 오늘 기준</span>
        </>
      ))}
      {!!(failed && failed.length) && bar(C.no, (
        <>
          <b>⚠ 일부 자료를 불러오지 못했습니다</b>
          <span>({failed.join(', ')}) — 화면이 실제와 다를 수 있습니다</span>
          <button type="button" onClick={onRetry} style={{ marginLeft: 'auto', background: C.no, border: 'none', borderRadius: 7, padding: '4px 11px', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>다시 불러오기</button>
        </>
      ))}
      {loading ? (
        <div style={{ position: 'relative', minHeight: 58, display: 'flex', alignItems: 'center', color: '#aab3d0', fontSize: 12.5 }}>⏳ {dayLabel(cur)} 기록을 불러오는 중…</div>
      ) : !hero ? (
        <div style={{ position: 'relative', minHeight: 58, display: 'flex', alignItems: 'center', color: '#f3a0a0', fontSize: 12.5 }}>
          {dayLabel(cur)} 기록을 불러오지 못했습니다 — 위의 [다시 불러오기]를 눌러 주세요.
        </div>
      ) : isPast && failed && failed.includes('광고 성과') ? (
        // 불러오기에 실패한 것을 '기록 없음'으로 말하면 안 됩니다 — 사실과 다른 안내가 됩니다
        <div style={{ position: 'relative', minHeight: 58, display: 'flex', alignItems: 'center', color: '#f3a0a0', fontSize: 12.5 }}>
          {dayLabel(cur)} 광고 성과를 불러오지 못했습니다 — 위의 [다시 불러오기]를 눌러 주세요.
        </div>
      ) : isPast && hero.n1 === 0 ? (
        <div style={{ position: 'relative', minHeight: 58, display: 'flex', alignItems: 'center', color: '#aab3d0', fontSize: 12.5 }}>
          {dayLabel(cur)}에는 {allowedBrands ? '담당 브랜드의 ' : ''}광고 성과 기록이 없습니다.
        </div>
      ) : (
        <div style={{ position: 'relative', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {box('광고비', won(hero.m1.cost), delta(hero.m1.cost, hero.m2.cost))}
          {box('구매완료 매출', won(hero.m1.rev), delta(hero.m1.rev, hero.m2.rev))}
          {box('구매완료 ROAS', Math.round(hero.r1) + '%', hero.r2 > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: hero.r1 >= hero.r2 ? C.ok : C.no }}>{hero.r1 >= hero.r2 ? '▲' : '▼'} {Math.round(Math.abs(hero.r1 - hero.r2))}%p</span> : null)}
          {box('구매완료 전환수', fmtNum(hero.m1.conv) + '건', delta(hero.m1.conv, hero.m2.conv))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ② 오늘 챙길 것 (통합 경보)
// ─────────────────────────────────────────────
const SEV = { high: { c: C.no, t: '긴급' }, mid: { c: C.warn, t: '주의' }, info: { c: C.ac, t: '안내' } };

function TodoList({ items, setTab, title = '오늘 챙길 것', emptyText = '✅ 오늘은 특이사항이 없습니다. 편안한 하루 되세요.' }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? items : items.slice(0, 5);   // 기본 5건만 (2026-07-28 대표님 지시)
  return (
    <div style={card}>
      {secTitle('🚨', title, items.length > 0 && <span style={{ fontSize: 10.5, color: C.no, background: '#f0707022', border: '1px solid #f0707044', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{items.length}건</span>)}
      {!items.length ? (
        <div style={{ fontSize: 12.5, color: C.txd, padding: '6px 2px' }}>{emptyText}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {list.map((it, i) => (
            <div key={i} onClick={() => { if (!it.tab) return; if (it.tab === 'diagnosis' && it.brand) { try { sessionStorage.setItem('oha_diag_brand', it.brand); } catch { /* ignore */ } } setTab(it.tab); }} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: C.sf2, border: `1px solid ${C.bd}`,
              borderLeft: `3px solid ${SEV[it.sev].c}`, borderRadius: 9, padding: '9px 12px', cursor: it.tab ? 'pointer' : 'default',
            }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: SEV[it.sev].c, background: SEV[it.sev].c + '18', borderRadius: 5, padding: '2px 7px', flexShrink: 0 }}>{SEV[it.sev].t}</span>
              {it.brand && <span style={{ fontSize: 10.5, color: C.txd, background: C.sf3, borderRadius: 5, padding: '2px 8px', flexShrink: 0, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.brand}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12.5, color: C.tx, fontWeight: 700 }}>{it.title}</span>
                {it.desc && <span style={{ fontSize: 11.5, color: C.txd, marginLeft: 8 }}>{it.desc}</span>}
              </div>
              {it.tab && <span style={{ fontSize: 11, color: C.ac, flexShrink: 0 }}>보기 →</span>}
            </div>
          ))}
          {items.length > 5 && (
            <button onClick={() => setShowAll(s => !s)} style={{ background: 'none', border: `1px dashed ${C.bd}`, borderRadius: 8, padding: '6px', color: C.txd, fontSize: 11.5, cursor: 'pointer' }}>
              {showAll ? '접기 ▲' : `전체 보기 (${items.length - 5}건 더) ▼`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ③ 광고주 신호등 보드
// ─────────────────────────────────────────────
const SIGNAL_NOTE = '· 신호에 마우스를 올리면 상세 사유가 표시됩니다 · 성과: 목표 기재 시 목표 ROAS 기준, 미기재 시 최근 7일 vs 직전 7일 · 목표 달성: 최근 7일 ROAS ÷ 목표 ROAS (설정 → 🎯 브랜드 목표 관리) · 대화: 최신 소통 점수 · 후기: 오늘 점검 결과 · 순위: 최신 수집 결과';

function SignalBoard({ rows, dayWord = '어제', goalRange = '최근 7일', note = SIGNAL_NOTE, emptyText = '표시할 브랜드가 없습니다 (이 기간에 광고 기록이 없음)' }) {
  const G = { green: C.ok, yellow: C.yel, red: C.no, gray: '#3a4056' };
  const legend = (c, t) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: C.txd }}><Dot color={G[c]} /> {t}</span>;
  return (
    <div style={card}>
      {secTitle('🚦', '광고주 신호등', (
        <span style={{ display: 'flex', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {legend('green', '정상')}{legend('yellow', '주의')}{legend('red', '점검 필요')}{legend('gray', '데이터 없음')}
        </span>
      ))}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ color: C.txm, fontSize: 10.5 }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600 }}>브랜드</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{dayWord} 광고비</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>{dayWord} 매출</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>ROAS</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>목표 달성</th>
              {['성과', '대화', '후기', '순위'].map(h => <th key={h} style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.brand} style={{ borderTop: `1px solid ${C.bd}`, background: i % 2 ? 'transparent' : C.sf2 + '55' }}>
                <td style={{ padding: '8px 8px', fontSize: 12.5, color: C.tx, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.brand}</td>
                <td style={{ padding: '8px 8px', fontSize: 12, color: C.tx, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.cost > 0 ? won(r.cost) : <span style={{ color: C.txm }}>—</span>}</td>
                <td style={{ padding: '8px 8px', fontSize: 12, color: C.tx, textAlign: 'right', whiteSpace: 'nowrap' }}>{r.rev > 0 ? won(r.rev) : <span style={{ color: C.txm }}>—</span>}</td>
                <td style={{ padding: '8px 8px', fontSize: 12, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: r.cost > 0 ? (r.roas >= 300 ? C.ok : r.roas >= 100 ? C.tx : C.no) : C.txm }}>{r.cost > 0 ? Math.round(r.roas) + '%' : '—'}</td>
                <td title={(r.goal && r.goal.target ? `목표 ROAS ${fmtNum(r.goal.target)}% 기준 · ${goalRange}` : '목표 미기재 (설정 → 브랜드 목표 관리)') + (r.goal && r.goal.yoyDiff != null ? ` · 작년 동기 대비 ${r.goal.yoyDiff >= 0 ? '+' : ''}${r.goal.yoyDiff}%p (작년 데이터 자동 비교)` : '')}
                  style={{ padding: '8px 8px', fontSize: 12, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: !(r.goal && r.goal.rate != null) ? C.txm : r.goal.rate >= 100 ? C.ok : r.goal.rate >= 90 ? C.yel : C.no }}>
                  {r.goal && r.goal.rate != null ? r.goal.rate + '%' : '—'}
                  {r.goal && r.goal.yoyDiff != null && (
                    <span style={{ fontSize: 9.5, marginLeft: 4, color: r.goal.yoyDiff >= 0 ? C.ok : C.no, fontWeight: 600 }}>
                      YOY{r.goal.yoyDiff >= 0 ? '▲' : '▼'}
                    </span>
                  )}
                </td>
                {['perf', 'chat', 'review', 'rank'].map(k => (
                  <td key={k} style={{ padding: '8px 6px', textAlign: 'center' }}><Dot color={G[r[k].s]} title={r[k].t} /></td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={9} style={{ padding: '14px 8px', fontSize: 12, color: C.txd, textAlign: 'center' }}>{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: C.txm, marginTop: 8 }}>{note}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ④ 자동화 가동 상태
// ─────────────────────────────────────────────
function AutoStatus({ jobs }) {
  const colorOf = (j) => j.status === 'ok' ? C.ok : j.status === 'fail' ? C.no : j.status === 'wait' ? C.yel : '#3a4056';
  const textOf = (j) => j.status === 'ok' ? '정상' : j.status === 'fail' ? '실패' : j.status === 'wait' ? '대기' : '기록 없음';
  return (
    <div style={card}>
      {secTitle('🤖', '자동화 가동 상태', <span style={{ fontSize: 10.5, color: C.txm, marginLeft: 'auto' }}>매일 새벽 자동 실행</span>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(158px, 1fr))', gap: 8 }}>
        {jobs.map(j => (
          <div key={j.name} title={j.note || ''} style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Dot color={colorOf(j)} title={textOf(j)} />
              <b style={{ fontSize: 12, color: C.tx }}>{j.name}</b>
            </div>
            <div style={{ fontSize: 10, color: C.txm, marginTop: 5 }}>{j.sched} 예약 · <span style={{ color: j.status === 'ok' ? C.ok : j.status === 'fail' ? C.no : C.txd }}>{textOf(j)}{j.when ? ` (${j.when})` : ''}</span></div>
            {j.note && <div style={{ fontSize: 9.5, color: C.txm, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ⑤ 팀 현황 미니
// ─────────────────────────────────────────────
function TeamMini({ staff, reports, overdue, events, setTab }) {
  const submitted = new Set(reports.map(r => r.staff_name));
  const box = { background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '11px 13px', flex: 1, minWidth: 180 };
  const EVL = { annual: '🏖 연차', half: '🌤 반차', out: '🚗 외근', promise: '🤝 약속', perf: '⚠ 성과', memo: '📝 메모' };
  return (
    <div style={card}>
      {secTitle('🤝', '팀 현황', <button onClick={() => setTab('team')} style={{ marginLeft: 'auto', background: 'none', border: `1px solid ${C.bd}`, borderRadius: 7, padding: '3px 10px', color: C.ac, fontSize: 11, cursor: 'pointer' }}>팀 업무 →</button>)}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={box}>
          <div style={{ fontSize: 10.5, color: C.txd, marginBottom: 6 }}>오늘 업무보고</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: submitted.size >= staff.length && staff.length > 0 ? C.ok : C.tx }}>{submitted.size}<span style={{ fontSize: 12, color: C.txd, fontWeight: 600 }}> / {staff.length}명 제출</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 7 }}>
            {staff.map(s => (
              <span key={s.id} style={{ fontSize: 10, borderRadius: 9, padding: '2px 8px', background: submitted.has(s.name) ? '#3dd9a018' : C.sf3, color: submitted.has(s.name) ? C.ok : C.txm, border: `1px solid ${submitted.has(s.name) ? '#3dd9a033' : C.bd}` }}>{submitted.has(s.name) ? '✔ ' : ''}{s.name}</span>
            ))}
          </div>
        </div>
        <div style={box}>
          <div style={{ fontSize: 10.5, color: C.txd, marginBottom: 6 }}>지연된 액션</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: overdue.length ? C.no : C.ok }}>{overdue.length}<span style={{ fontSize: 12, color: C.txd, fontWeight: 600 }}>건</span></div>
          <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {overdue.slice(0, 3).map(a => (
              <div key={a.id} style={{ fontSize: 10.5, color: C.txd, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {a.assignee_name ? `[${a.assignee_name}] ` : ''}{a.content}</div>
            ))}
            {!overdue.length && <div style={{ fontSize: 10.5, color: C.txm }}>지연 없음 👍</div>}
          </div>
        </div>
        <div style={box}>
          <div style={{ fontSize: 10.5, color: C.txd, marginBottom: 6 }}>오늘 일정</div>
          {!events.length ? <div style={{ fontSize: 11.5, color: C.txm, marginTop: 4 }}>등록된 일정 없음</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {events.slice(0, 4).map(ev => (
                <div key={ev.id} style={{ fontSize: 11, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {EVL[ev.etype] || '📌'} <b>{ev.staff_name || ev.brand || ''}</b> <span style={{ color: C.txd }}>{ev.title || ev.memo || ''}</span>
                </div>
              ))}
              {events.length > 4 && <div style={{ fontSize: 10, color: C.txm }}>외 {events.length - 4}건</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 지난 날짜 자료 불러오기 (2026-09-28)
//   asOf = 그 화면의 '오늘' (= 고른 성과일 + 1일)
//   평소 홈이 '지금까지 쌓인 기록'을 보듯이, 그날까지 쌓여 있던 기록만 기간을 좁혀 가져옵니다.
//   목표·후기 매장 연결은 과거 값이 따로 없어 평소 홈이 받아 둔 지금 값을 함께 씁니다.
// ─────────────────────────────────────────────
const PAST_TIMEOUT = 15000;   // 평소 홈과 같은 15초 제한 (서버가 집계표를 다시 만드는 중이면 응답이 늦음)

// 제한시간 안에 안 오거나 실패하면 기본값으로 넘어가고, 어떤 자료가 빠졌는지 기록합니다.
function withTimeout(name, p, fallback, failed) {
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; failed.add(name); resolve(fallback); } }, PAST_TIMEOUT);
    Promise.resolve(p).then(
      v => { if (!done) { done = true; clearTimeout(timer); resolve(v == null ? fallback : v); } },
      () => { if (!done) { done = true; clearTimeout(timer); failed.add(name); resolve(fallback); } },
    );
  });
}

export async function loadPastData(asOf) {   // (검증 스크립트에서도 같은 함수를 쓰려고 내보냄)
  const failed = new Set();
  const y1 = addDays(asOf, -1);   // 성과일
  const [ad, lyAd, perfAlerts, promises, chatScores, reviewsToday, rankHist, radarRes] = await Promise.all([
    // 광고 성과: 평소 홈과 같은 16일 폭. 그날 당일 자료는 그날엔 아직 없었으므로 성과일까지만.
    withTimeout('광고 성과', fetchAdDailyWindow(addDays(asOf, -16), y1), [], failed),
    withTimeout('작년 같은 때', fetchAdDailyWindow(addDays(asOf, -373), addDays(asOf, -364)), [], failed),
    // 성과 경고: 최근 7일치. 경고는 성과일 다음날 새벽에 만들어지므로 성과일 것까지가 그날 보이던 것.
    withTimeout('성과 경고', fetchPerfAlertsRange(addDays(asOf, -7), y1), [], failed),
    withTimeout('약속', fetchTodayPromises(asOf), [], failed),
    // 대화 점수: 대화 마지막 날 다음날 새벽에 만들어짐 → 성과일까지 끝난 대화의 점수가 그날 보이던 것.
    withTimeout('대화 점수', fetchChatScores(null, y1), [], failed),
    withTimeout('후기 점검', fetchReviewChecks(asOf, null), [], failed),
    // 순위: 평소 홈과 같은 3일 폭, 그날 24시(한국시간)까지 수집분.
    withTimeout('순위', fetchRankHistory(null, addDays(asOf, -3) + 'T00:00:00', endOfDayKstISO(asOf)), [], failed),
    withTimeout('경쟁사 알림', sb ? sb.from('market_radar_alerts').select('*').eq('date', asOf) : { data: [] }, { data: [] }, failed),
  ]);
  if (radarRes && radarRes.error) failed.add('경쟁사 알림');
  return {
    data: { ad, lyAd, perfAlerts, promises, chatScores, reviewsToday, rankHist, radar: (radarRes && radarRes.data) || [] },
    failed: [...failed],
  };
}

// ─────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────
export default function Home({ currentUser, allowedBrands, setTab }) {
  const isAdmin = currentUser?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [D, setD] = useState(null);

  // ── 지난 날짜 보기 ──
  const [selDate, setSelDate] = useState(null);   // 고른 성과일. null = 평소 화면(어제 성과)
  const [pastTick, setPastTick] = useState(0);    // 지난 날짜 자료가 도착하면 화면을 다시 그리기 위한 신호
  const pastCache = useRef(new Map());            // asOf → { data, failed } — 한 번 본 날짜는 즉시 다시 보여 줌
  const pastBusy = useRef(new Set());             // 지금 불러오는 중인 asOf (같은 날짜 중복 요청 방지)

  useEffect(() => {
    let alive = true;
    (async () => {
      // ※ 2026-09-11 — '로그인하면 계속 로딩만 도는' 문제의 원인과 수정
      //   예전에는 17개 조회를 Promise.all로 묶었는데, 그중 하나라도 응답이 안 오면
      //   아래 setLoading(false)까지 영영 도달하지 못했습니다(오류 처리·제한시간 없음).
      //   서버가 집계표(ad_daily)를 다시 만드는 동안에는 조회에 30초가 넘도록 응답이 없습니다.
      //   그때마다 홈이 무한 로딩에 빠졌습니다.
      //   → ① 각 조회에 15초 제한을 걸고 ② 실패해도 나머지는 그대로 보여 주고
      //     ③ 무슨 일이 있어도 finally에서 로딩을 끝냅니다.
      const T = (p, d) => Promise.race([
        Promise.resolve(p).catch(() => d),
        new Promise(res => setTimeout(() => res(d), 15000)),
      ]);
      try {
        const t = today();
        const since3 = addDays(t, -3) + 'T00:00:00';
        const R = await Promise.allSettled([
          T(fetchAdDaily(16, null), []),
          T(fetchTodayPromises(t), []),
          T(fetchOpenPerfAlerts(), []),
          T(fetchChatScores(null), []),
          T(fetchChatUploads(null), []),
          T(fetchReviewChecks(t, null), []),
          T(fetchReviewStoreMap(), []),
          T(fetchRankHistory(null, since3), []),
          T(fetchRankProducts(), []),
          T(fetchUsers(), []),
          T(fetchReportsByDate(t), []),
          T(fetchOpenActions(), []),
          T(fetchEventsRange(t, t), []),
          T(sb ? sb.from('market_radar_alerts').select('*').eq('date', t) : { data: [] }, { data: [] }),
          T(sb ? sb.from('job_heartbeat').select('*') : { data: [] }, { data: [] }),
        ]);
        const g = (i, d) => (R[i] && R[i].status === 'fulfilled' && R[i].value != null) ? R[i].value : d;
        const targets = await T(fetchBrandTargets(), []);
        const lyAd = await T(fetchAdDailyWindow(addDays(t, -373), addDays(t, -364)), []);
        if (!alive) return;
        const radarRes = g(13, { data: [] }), hbRes = g(14, { data: [] });
        setD({
          ad: g(0, []), promises: g(1, []), perfAlerts: g(2, []),
          chatScores: g(3, []), chatUploads: g(4, []),
          reviewsToday: g(5, []), storeMap: g(6, []),
          rankHist: g(7, []), rankProds: g(8, []),
          users: g(9, []), reports: g(10, []), actions: g(11, []), events: g(12, []),
          radar: (radarRes && radarRes.data) || [], hb: (hbRes && hbRes.data) || [],
          targets: targets || [], lyAd: lyAd || [],
        });
      } catch (e) {
        console.error('[홈] 로드 실패:', e);
        if (alive) setD(p => p || { ad: [], promises: [], perfAlerts: [], chatScores: [], chatUploads: [], reviewsToday: [], storeMap: [], rankHist: [], rankProds: [], users: [], reports: [], actions: [], events: [], radar: [], hb: [], targets: [], lyAd: [] });
      } finally {
        if (alive) setLoading(false);   // 무슨 일이 있어도 로딩은 끝낸다
      }
    })();
    return () => { alive = false; };
  }, [currentUser]);

  // 다른 사람으로 로그인하면 지난 날짜 기록을 비우고 평소 화면으로
  useEffect(() => { pastCache.current.clear(); setSelDate(null); }, [currentUser?.id]);

  const t = today();
  const yday = addDays(t, -1);
  const isPast = !!selDate && selDate < yday;           // 어제(평소 화면)보다 앞 날짜를 골랐을 때만 '지난 날짜'
  const asOfPast = isPast ? addDays(selDate, 1) : null; // 그 화면의 '오늘'
  const cur = isPast ? selDate : yday;                  // 지금 보여 주는 성과일

  // 지난 날짜 자료 불러오기 — 0.35초 기다렸다가 시작 (◀를 연달아 누를 때 중간 날짜 요청이 쌓이지 않게)
  useEffect(() => {
    if (!asOfPast) return undefined;
    if (pastCache.current.has(asOfPast) || pastBusy.current.has(asOfPast)) return undefined;
    const key = asOfPast;
    const timer = setTimeout(() => {
      pastBusy.current.add(key);
      loadPastData(key)
        .then(res => { pastCache.current.set(key, res); })
        .catch(e => { console.error('[홈] 지난 날짜 로드 실패:', e); pastCache.current.set(key, { data: null, failed: ['전체'] }); })
        .finally(() => { pastBusy.current.delete(key); setPastTick(n => n + 1); });
    }, 350);
    return () => clearTimeout(timer);
  }, [asOfPast, pastTick]);

  const pickDate = useCallback((d) => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < MIN_DATE) return;   // 지우는 중·입력 중인 값은 무시
    const yd = addDays(today(), -1);
    setSelDate(d >= yd ? null : d);                                       // 어제(또는 그 뒤)를 고르면 평소 화면
  }, []);
  const resetDate = useCallback(() => setSelDate(null), []);
  const retryPast = useCallback(() => {
    if (!asOfPast) return;
    pastCache.current.delete(asOfPast);
    setPastTick(n => n + 1);
  }, [asOfPast]);

  // ── 평소 화면 계산 (예전 코드와 결과 동일) ──
  const computed = useMemo(() => {
    if (!D) return null;
    const b = computeBoard(D, { asOf: t, allowedBrands });
    return { rows: b.rows, todos: b.todos, jobs: computeJobs(D, t) };
  }, [D, allowedBrands, t]);

  // ── 지난 날짜 계산 ──
  const pastEntry = asOfPast ? pastCache.current.get(asOfPast) : null;   // pastTick이 바뀌면 다시 읽힘
  const pastComputed = useMemo(() => {
    if (!asOfPast || !pastEntry || !pastEntry.data || !D) return null;
    const PD = { ...pastEntry.data, storeMap: D.storeMap, targets: D.targets };
    return computeBoard(PD, { asOf: asOfPast, allowedBrands, past: true });
  }, [asOfPast, pastEntry, D, allowedBrands]);

  // ── 맨 위 성과 카드 ──
  const hero = useMemo(() => {
    if (isPast) return pastEntry && pastEntry.data ? computeHero(pastEntry.data.ad, allowedBrands, asOfPast) : null;
    return D ? computeHero(D.ad, allowedBrands, t) : null;
  }, [isPast, pastEntry, D, allowedBrands, asOfPast, t]);

  if (loading || !computed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txd, fontSize: 13 }}>홈 화면을 준비하는 중…</div>
      </div>
    );
  }

  const staff = D.users.filter(u => u.role !== 'admin');
  const board = isPast ? pastComputed : computed;
  const pastWaiting = isPast && !pastEntry;                     // 불러오는 중
  const pastBroken = isPast && !!pastEntry && !pastEntry.data;  // 불러오기 자체가 실패
  const asOfLabel = asOfPast ? dayLabel(asOfPast) : '';
  const range7 = asOfPast ? `${mdLabel(addDays(asOfPast, -7))}~${mdLabel(addDays(asOfPast, -1))} 7일` : '';
  const pastNote = asOfPast
    ? `· 신호에 마우스를 올리면 상세 사유가 표시됩니다 · 성과: 목표 기재 시 목표 ROAS 기준, 미기재 시 ${range7} vs 그 전 7일 · 목표 달성: ${range7} ROAS ÷ 목표 ROAS (목표는 과거 값이 남지 않아 지금 설정값으로 계산) · 대화: ${mdLabel(selDate)}까지의 최신 소통 점수 · 후기: ${mdLabel(asOfPast)} 점검 결과 · 순위: ${mdLabel(asOfPast)}까지 수집 결과`
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <NoticeBoard currentUser={currentUser} isAdmin={isAdmin} />
      <HeroHeader hero={hero} allowedBrands={allowedBrands} userName={currentUser?.name || ''}
        cur={cur} yday={yday} isPast={isPast} onPick={pickDate} onReset={resetDate}
        loading={pastWaiting} failed={isPast && pastEntry ? pastEntry.failed : null} onRetry={retryPast} />
      {pastWaiting ? (
        <div style={{ ...card, minHeight: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txd, fontSize: 12.5 }}>
          ⏳ {asOfLabel} 기준 챙길 것·신호등을 계산하는 중…
        </div>
      ) : (pastBroken || !board) ? (
        <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 10, color: C.no, fontSize: 12.5 }}>
          지난 날짜 자료를 불러오지 못했습니다.
          <button type="button" onClick={retryPast} style={{ background: C.no, border: 'none', borderRadius: 7, padding: '5px 12px', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>다시 불러오기</button>
        </div>
      ) : isPast ? (
        <>
          <TodoList key={asOfPast} items={board.todos} setTab={setTab} title={`${asOfLabel} 챙길 것`} emptyText="✅ 이 날은 특이사항이 없었습니다." />
          <SignalBoard rows={board.rows} dayWord={mdLabel(selDate)} goalRange={`${range7} (목표는 지금 설정값)`} note={pastNote}
            emptyText={pastEntry.failed.includes('광고 성과') ? '광고 성과를 불러오지 못해 표시할 수 없습니다 — 맨 위 [다시 불러오기]를 눌러 주세요' : undefined} />
        </>
      ) : (
        <>
          <TodoList key="live" items={board.todos} setTab={setTab} />
          <SignalBoard rows={board.rows} />
        </>
      )}
      {isPast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: C.txm, fontSize: 11 }}>
          <span style={{ flex: 1, height: 1, background: C.bd }} />
          여기부터는 지금(오늘) 기준
          <span style={{ flex: 1, height: 1, background: C.bd }} />
        </div>
      )}
      <AutoStatus jobs={computed.jobs} />
      <TeamMini staff={staff} reports={D.reports} overdue={D.actions.filter(a => a.due_date && a.due_date < t && !a.done)} events={D.events} setTab={setTab} />
    </div>
  );
}
