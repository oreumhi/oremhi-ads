// ============================================
// 홈 대시보드
//   최상단 공지사항(확인 체크·댓글) → ① 어제 성과 헤더 → ② 오늘 챙길 것(통합 경보)
//   → ③ 광고주 신호등 보드 → ④ 자동화 가동 상태 → ⑤ 팀 현황 미니
//   직원은 담당 브랜드 기준으로 자동 필터.
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { sb, fetchAdDaily, fetchAdDailyWindow, fetchUsers, fetchBrandTargets } from '../store';
import { fetchTodayPromises, fetchOpenPerfAlerts, fetchReportsByDate, fetchOpenActions, fetchEventsRange } from '../team';
import { fetchChatScores, fetchChatUploads, fetchReviewChecks, fetchReviewStoreMap } from '../chat';
import { fetchRankHistory, fetchRankProducts } from '../rank';
import { fmtNum, uid, today } from '../utils';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const dayLabel = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()} (${WD[d.getDay()]})`; };
const norm = (s) => (s || '').toLowerCase().replace(/[\s()\-_.·,/&+]/g, '').replace(/숍/g, '솝');
const nMatch = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x.includes(y) || y.includes(x)); };
const timeAgo = (iso) => {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
};
const hhmm = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

const sumM = (rows) => rows.reduce((a, r) => ({
  imp: a.imp + (+r.impressions || 0), cost: a.cost + (+r.cost || 0),
  conv: a.conv + (+r.conversions || 0), rev: a.rev + (+(r.revenue ?? r.conv_revenue) || 0),
}), { imp: 0, cost: 0, conv: 0, rev: 0 });
const roasOf = (m) => (m.cost > 0 ? m.rev / m.cost * 100 : 0);

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

              {/* 확인 체크 */}
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                <button onClick={() => toggleAck(n)} style={{
                  background: iAcked ? '#3dd9a022' : C.sf3, border: `1px solid ${iAcked ? C.ok : C.bd}`, borderRadius: 20,
                  padding: '4px 13px', color: iAcked ? C.ok : C.txd, fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
                }}>{iAcked ? '✔ 확인함' : '확인했어요'}</button>
                {acks.map(r => (
                  <span key={r.id} style={{ fontSize: 10.5, color: C.ok, background: '#3dd9a014', border: '1px solid #3dd9a033', borderRadius: 10, padding: '2px 9px' }}>✔ {r.user_name}</span>
                ))}
                {!acks.length && <span style={{ fontSize: 10.5, color: C.txm }}>아직 확인한 사람이 없습니다</span>}
              </div>

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
// ① 어제 성과 헤더
// ─────────────────────────────────────────────
function HeroHeader({ adData, allowedBrands, userName }) {
  const t = today();
  const y1 = addDays(t, -1), y2 = addDays(t, -2);
  const inB = (b) => !allowedBrands || allowedBrands.includes(b);
  const m1 = sumM(adData.filter(r => r.date === y1 && inB(r.brand)));
  const m2 = sumM(adData.filter(r => r.date === y2 && inB(r.brand)));
  const r1 = roasOf(m1), r2 = roasOf(m2);
  const delta = (cur, prev, fmt) => {
    if (!prev) return null;
    const g = (cur - prev) / prev * 100;
    const up = g >= 0;
    return <span style={{ fontSize: 11, fontWeight: 700, color: up ? C.ok : C.no }}>{up ? '▲' : '▼'} {Math.abs(g).toFixed(1)}%{fmt ? '' : ''}</span>;
  };
  const hour = new Date().getHours();
  const greet = hour < 11 ? '좋은 아침입니다' : hour < 17 ? '좋은 오후입니다' : '수고 많으셨습니다';
  const box = (label, value, d) => (
    <div style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: '#aab3d0', marginBottom: 5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>{value}</div>
      <div style={{ marginTop: 3, minHeight: 14 }}>{d}<span style={{ fontSize: 10, color: '#8890a6', marginLeft: 5 }}>{d ? '그제 대비' : ''}</span></div>
    </div>
  );
  return (
    <div style={{ borderRadius: 16, padding: '20px 22px', background: 'linear-gradient(135deg, #1c2a52 0%, #151a2e 60%, #131620 100%)', border: '1px solid #2c3554', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -60, right: -40, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, #5b8def22, transparent 70%)' }} />
      <div style={{ fontSize: 12.5, color: '#aab3d0', marginBottom: 3 }}>{greet}, <b style={{ color: '#fff' }}>{userName}</b>님</div>
      <div style={{ fontSize: 11, color: '#7683a8', marginBottom: 14 }}>
        어제 {dayLabel(y1)} {allowedBrands ? '담당 브랜드' : '회사 전체'} 성과 <span style={{ color: '#5c6685' }}>· 전환·매출·ROAS는 구매완료 기준</span>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        {box('광고비', won(m1.cost), delta(m1.cost, m2.cost))}
        {box('구매완료 매출', won(m1.rev), delta(m1.rev, m2.rev))}
        {box('구매완료 ROAS', Math.round(r1) + '%', r2 > 0 ? <span style={{ fontSize: 11, fontWeight: 700, color: r1 >= r2 ? C.ok : C.no }}>{r1 >= r2 ? '▲' : '▼'} {Math.round(Math.abs(r1 - r2))}%p</span> : null)}
        {box('구매완료 전환수', fmtNum(m1.conv) + '건', delta(m1.conv, m2.conv))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ② 오늘 챙길 것 (통합 경보)
// ─────────────────────────────────────────────
const SEV = { high: { c: C.no, t: '긴급' }, mid: { c: C.warn, t: '주의' }, info: { c: C.ac, t: '안내' } };

function TodoList({ items, setTab }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? items : items.slice(0, 8);
  return (
    <div style={card}>
      {secTitle('🚨', '오늘 챙길 것', items.length > 0 && <span style={{ fontSize: 10.5, color: C.no, background: '#f0707022', border: '1px solid #f0707044', borderRadius: 10, padding: '1px 8px', fontWeight: 700 }}>{items.length}건</span>)}
      {!items.length ? (
        <div style={{ fontSize: 12.5, color: C.txd, padding: '6px 2px' }}>✅ 오늘은 특이사항이 없습니다. 편안한 하루 되세요.</div>
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
          {items.length > 8 && (
            <button onClick={() => setShowAll(s => !s)} style={{ background: 'none', border: `1px dashed ${C.bd}`, borderRadius: 8, padding: '6px', color: C.txd, fontSize: 11.5, cursor: 'pointer' }}>
              {showAll ? '접기 ▲' : `${items.length - 8}건 더 보기 ▼`}
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
function SignalBoard({ rows }) {
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
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>어제 광고비</th>
              <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>어제 매출</th>
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
                <td title={(r.goal && r.goal.target ? `목표 ROAS ${fmtNum(r.goal.target)}% 기준 · 최근 7일` : '목표 미기재 (설정 → 브랜드 목표 관리)') + (r.goal && r.goal.yoyDiff != null ? ` · 작년 동기 대비 ${r.goal.yoyDiff >= 0 ? '+' : ''}${r.goal.yoyDiff}%p (작년 데이터 자동 비교)` : '')}
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
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: C.txm, marginTop: 8 }}>· 신호에 마우스를 올리면 상세 사유가 표시됩니다 · 성과: 목표 기재 시 목표 ROAS 기준, 미기재 시 최근 7일 vs 직전 7일 · 목표 달성: 최근 7일 ROAS ÷ 목표 ROAS (설정 → 🎯 브랜드 목표 관리) · 대화: 최신 소통 점수 · 후기: 오늘 점검 결과 · 순위: 최신 수집 결과</div>
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
// 메인
// ─────────────────────────────────────────────
export default function Home({ currentUser, allowedBrands, setTab }) {
  const isAdmin = currentUser?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [D, setD] = useState(null);

  useEffect(() => {
    (async () => {
      const t = today();
      const since3 = addDays(t, -3) + 'T00:00:00';
      const [ad, promises, perfAlerts, chatScores, chatUploads, reviewsToday, storeMap, rankHist, rankProds, users, reports, actions, events, radarRes, hbRes] = await Promise.all([
        fetchAdDaily(16, null),
        fetchTodayPromises(t),
        fetchOpenPerfAlerts(),
        fetchChatScores(null),
        fetchChatUploads(null),
        fetchReviewChecks(t, null),
        fetchReviewStoreMap(),
        fetchRankHistory(null, since3),
        fetchRankProducts(),
        fetchUsers(),
        fetchReportsByDate(t),
        fetchOpenActions(),
        fetchEventsRange(t, t),
        sb ? sb.from('market_radar_alerts').select('*').eq('date', t) : { data: [] },
        sb ? sb.from('job_heartbeat').select('*') : { data: [] },
      ]);
      const targets = await fetchBrandTargets();
      // 작년 동기 7일 (YOY 자동 계산 — 작년 보고서 데이터 기반)
      const lyAd = await fetchAdDailyWindow(addDays(t, -373), addDays(t, -364));
      setD({
        ad: ad || [], promises: promises || [], perfAlerts: perfAlerts || [],
        chatScores: chatScores || [], chatUploads: chatUploads || [],
        reviewsToday: reviewsToday || [], storeMap: storeMap || [],
        rankHist: rankHist || [], rankProds: rankProds || [],
        users: users || [], reports: reports || [], actions: actions || [], events: events || [],
        radar: radarRes.data || [], hb: hbRes.data || [], targets: targets || [], lyAd: lyAd || [],
      });
      setLoading(false);
    })();
  }, [currentUser]);

  const t = today();
  const inB = useCallback((b) => !allowedBrands || !b || allowedBrands.some(ab => nMatch(ab, b)), [allowedBrands]);

  // ── 브랜드별 성과 (7 vs 7) + 신호등 ──
  const computed = useMemo(() => {
    if (!D) return null;
    const y1 = addDays(t, -1);
    const rS = addDays(t, -7), pS = addDays(t, -14), pE = addDays(t, -8), l2 = addDays(t, -2);

    const byBrand = {};
    D.ad.forEach(r => {
      if (allowedBrands && !allowedBrands.includes(r.brand)) return;
      const b = (byBrand[r.brand] = byBrand[r.brand] || { recent: [], prev: [], yday: [], r2imp: 0 });
      if (r.date >= rS && r.date <= y1) b.recent.push(r);
      if (r.date >= pS && r.date <= pE) b.prev.push(r);
      if (r.date === y1) b.yday.push(r);
      if (r.date >= l2 && r.date <= y1) b.r2imp += (+r.impressions || 0);
    });

    // 최신 대화 점수 (광고주별)
    const latestScore = {};
    D.chatScores.forEach(s => {
      const k = s.client_name;
      if (!latestScore[k] || (s.period_end || '') > (latestScore[k].period_end || '')) latestScore[k] = s;
    });
    // 오늘 후기 (매장→브랜드 매핑)
    const storeBrand = {}; D.storeMap.forEach(m => { storeBrand[m.store] = m.brand || m.store; });
    // 순위: 제품별 최신 + 전일
    const rankByProduct = {};
    D.rankHist.forEach(h => {
      if ((h.product || '').includes('예시')) return;   // [예시] 테스트 상품은 알림·신호등에서 제외
      const k = `${h.brand}·${h.product || ''}·${h.keyword}·${h.ad_type || ''}`;
      const day = (h.collected_at || '').slice(0, 10);
      const e = (rankByProduct[k] = rankByProduct[k] || { brand: h.brand, keyword: h.keyword, product: h.product, days: {} });
      if (!(day in e.days)) e.days[day] = h.rank;   // 최신순 정렬 → 첫 값 유지
    });

    const todos = [];
    const rows = [];

    // 저장된 성과 경고를 '현재 데이터'로 재검증 (며칠 전 만들어진 경고가 상황이 바뀌었는데도 뜨는 것 방지)
    const liveByBrand = {};
    Object.entries(byBrand).forEach(([b, d]) => {
      const rec = sumM(d.recent), prev = sumM(d.prev);
      liveByBrand[b] = { rCost: rec.cost, pCost: prev.cost, rRev: rec.rev, pRev: prev.rev, rRoas: roasOf(rec), pRoas: roasOf(prev) };
    });
    const perfStillValid = (p) => {
      const lv = liveByBrand[p.brand];
      if (!lv) return false;   // 현재 데이터로 확인 안 되면 표시하지 않음 (오탐 방지 우선)
      const title = p.title || '';
      if (title.includes('예산') || title.includes('광고비 급감')) {
        // 실제로 지금도 광고비가 30% 이상 줄어 있을 때만 유효
        return lv.pCost > 0 && lv.rCost < lv.pCost * 0.70;
      }
      if (title.includes('매출')) {
        return lv.pRev > 0 && lv.rRev < lv.pRev * 0.85;
      }
      if (title.includes('ROAS')) {
        return lv.pRoas > 0 && lv.rRoas < lv.pRoas * 0.85;
      }
      if (title.includes('노출') || title.includes('중단')) {
        return lv.pCost > 0 && lv.rCost < lv.pCost * 0.5;
      }
      return true;
    };

    // 성과 경고 이벤트: 최근 7일 것 + 현재도 유효한 것만, 브랜드당 최신 1건
    const recentPerf = [];
    const seenPerfBrand = new Set();
    D.perfAlerts.filter(p => inB(p.brand) && (p.event_date || '') >= addDays(t, -7) && perfStillValid(p)).forEach(p => {
      if (seenPerfBrand.has(p.brand)) return;
      seenPerfBrand.add(p.brand);
      recentPerf.push(p);
    });

    // 브랜드 목표 (담당자 기재 — 설정의 '브랜드 목표 관리')
    const targetBy = {};
    (D.targets || []).forEach(x => { targetBy[x.brand] = x; });
    // 작년 동기 7일 브랜드별 합계 (YOY 자동)
    const lyBy = {};
    const lyS = addDays(t, -372), lyE = addDays(t, -366);
    (D.lyAd || []).forEach(r => {
      if (r.date < lyS || r.date > lyE) return;
      const e = (lyBy[r.brand] = lyBy[r.brand] || { cost: 0, rev: 0 });
      e.cost += +r.cost || 0; e.rev += +(r.revenue ?? r.conv_revenue) || 0;
    });

    Object.entries(byBrand).forEach(([brand, d]) => {
      const rec = sumM(d.recent), prev = sumM(d.prev), yd = sumM(d.yday);
      const rRoas = roasOf(rec), pRoas = roasOf(prev);
      const tg = targetBy[brand];
      let perf = { s: rec.cost > 1000 ? 'green' : 'gray', t: rec.cost > 1000 ? '최근 7일 정상 집행' : '최근 집행 없음' };
      if (rec.cost > 1000 || prev.cost > 1000) {
        const prevDailyImp = prev.imp / 7;
        if (prevDailyImp > 500 && d.r2imp < prevDailyImp * 0.2) {
          perf = { s: 'red', t: '노출 급감 — 광고 중단 의심' };
          if (!seenPerfBrand.has(brand)) todos.push({ sev: 'high', brand, title: '노출 급감 — 광고 중단 의심', desc: '최근 노출이 이전 평균의 20% 미만', tab: 'diagnosis' });
        } else if (tg && +tg.target_roas > 0 && rec.cost > 30000) {
          // 목표가 있으면 목표 기준으로 판단 (담당자가 정한 기준이 우선)
          const rate = rRoas / +tg.target_roas * 100;
          if (rate < 70) {
            perf = { s: 'red', t: `목표 ROAS ${fmtNum(+tg.target_roas)}% 대비 ${Math.round(rate)}% 달성 — 크게 미달` };
            todos.push({ sev: 'high', brand, title: '목표 ROAS 크게 미달', desc: `목표 ${fmtNum(+tg.target_roas)}% · 최근7일 ${Math.round(rRoas)}% (달성 ${Math.round(rate)}%)`, tab: 'diagnosis' });
          } else if (rate < 90) {
            perf = { s: 'yellow', t: `목표 ROAS 대비 ${Math.round(rate)}% 달성 — 미달` };
            todos.push({ sev: 'mid', brand, title: '목표 ROAS 미달', desc: `목표 ${fmtNum(+tg.target_roas)}% · 최근7일 ${Math.round(rRoas)}%`, tab: 'diagnosis' });
          } else {
            perf = { s: 'green', t: `목표 ROAS 대비 ${Math.round(rate)}% 달성` };
          }
        } else if (pRoas > 50 && rec.cost > 30000 && rRoas < pRoas * 0.7) {
          // 목표 미기재 브랜드는 기존처럼 자기 과거 대비로 판단
          const stillGood = rRoas >= 400;
          perf = { s: stillGood ? 'yellow' : 'red', t: `ROAS 하락 ${Math.round(pRoas)}%→${Math.round(rRoas)}%` };
          if (!seenPerfBrand.has(brand)) todos.push({ sev: stillGood ? 'mid' : 'high', brand, title: 'ROAS 하락', desc: `${Math.round(pRoas)}% → ${Math.round(rRoas)}%`, tab: 'diagnosis' });
        } else if (pRoas > 50 && rRoas < pRoas * 0.85) {
          perf = { s: 'yellow', t: `ROAS 완만한 하락 (${Math.round(rRoas)}%)` };
        }
      }
      // 1일 예산 대비 어제 집행 점검 (목표 기재 시)
      if (tg && +tg.daily_budget > 0 && yd.cost >= 0) {
        const b = +tg.daily_budget;
        if (yd.cost > b * 1.2) {
          todos.push({ sev: 'high', brand, title: '1일 예산 초과', desc: `예산 ${won(b)} · 어제 집행 ${won(yd.cost)} (${Math.round(yd.cost / b * 100)}%)`, tab: 'diagnosis' });
        } else if (yd.cost < b * 0.3 && d.yday.length > 0) {
          todos.push({ sev: 'high', brand, title: '예산 대비 집행 급감 — 광고 축소·중단 의심', desc: `예산 ${won(b)} · 어제 집행 ${won(yd.cost)} (${Math.round(yd.cost / b * 100)}%)`, tab: 'diagnosis' });
        } else if (yd.cost < b * 0.3 && d.yday.length === 0 && rec.cost > 1000) {
          todos.push({ sev: 'high', brand, title: '어제 집행 기록 없음', desc: `1일 예산 ${won(b)}인데 어제 데이터가 없습니다`, tab: 'diagnosis' });
        }
      }
      // 대화 신호
      let chat = { s: 'gray', t: '연결된 대화방 없음' };
      const sc = Object.entries(latestScore).find(([cn]) => nMatch(cn, brand));
      if (sc) {
        const total = +sc[1].score_total || 0;
        const silent = sc[1].period_end ? Math.floor((new Date(t) - new Date(sc[1].period_end)) / 86400000) : 0;
        if (silent >= 14) chat = { s: 'red', t: `${silent}일째 대화 없음 (침묵)` };
        else chat = total >= 60 ? { s: 'green', t: `소통 점수 ${total}점 (양호)` } : total >= 40 ? { s: 'yellow', t: `소통 점수 ${total}점 (보통)` } : { s: 'red', t: `소통 점수 ${total}점 (개선 필요)` };
      }
      // 후기 신호
      let review = { s: 'gray', t: '오늘 점검 결과 없음' };
      const myChecks = D.reviewsToday.filter(c => nMatch(storeBrand[c.store] || c.store, brand));
      if (myChecks.length) {
        const low = myChecks.reduce((a, c) => a + (+c.low_count || 0), 0);
        review = low > 0 ? { s: 'red', t: `오늘 저평점 후기 ${low}건` } : { s: 'green', t: '오늘 점검 완료 — 저평점 없음' };
      }
      // 순위 신호
      let rank = { s: 'gray', t: '등록된 순위 상품 없음' };
      const myRanks = Object.values(rankByProduct).filter(e => e.brand === brand);
      if (myRanks.length) {
        let miss = 0, drop = 0, okc = 0;
        myRanks.forEach(e => {
          const ds = Object.keys(e.days).sort().reverse();
          const cur = e.days[ds[0]], prv = ds[1] != null ? e.days[ds[1]] : undefined;
          if (cur == null) miss++;
          else { okc++; if (prv != null && cur - prv >= 5) drop++; }
        });
        rank = miss > 0 ? { s: 'red', t: `미노출 ${miss}건 / ${myRanks.length}개 키워드` }
          : drop > 0 ? { s: 'yellow', t: `순위 급락 ${drop}건` }
          : { s: 'green', t: `${okc}개 키워드 정상 노출` };
      }
      // 목표 달성률(최근 7일 ROAS ÷ 목표 ROAS) + YOY(작년 동기 7일 실데이터 자동 비교)
      let goal = null;
      if (tg && +tg.target_roas > 0 && rec.cost > 1000) {
        goal = { rate: Math.round(rRoas / +tg.target_roas * 100), target: +tg.target_roas };
      }
      const ly = lyBy[brand];
      if (ly && ly.cost > 1000 && rec.cost > 1000) {
        const lyRoas = ly.rev / ly.cost * 100;
        goal = goal || { rate: null, target: null };
        goal.yoyDiff = Math.round(rRoas - lyRoas);
      }
      rows.push({ brand, cost: yd.cost, rev: yd.rev, roas: roasOf(yd), perf, chat, review, rank, goal });
    });
    rows.sort((a, b) => b.cost - a.cost || a.brand.localeCompare(b.brand));

    // ── 오늘 챙길 것 나머지 ──
    recentPerf.forEach(p => {
      let title = p.title || '성과 경고';
      if (p.brand && title.startsWith(p.brand)) title = title.slice(p.brand.length).trim();
      todos.push({ sev: 'high', brand: p.brand, title, desc: p.memo || '', tab: 'diagnosis' });
    });
    // 후기 저평점: 브랜드(매장) 단위로 묶어 1건씩만
    const lowByBrand = {};
    D.reviewsToday.forEach(c => {
      if (!(+c.low_count > 0)) return;
      const brand = storeBrand[c.store] || c.store;
      if (!inB(brand)) return;
      lowByBrand[brand] = (lowByBrand[brand] || 0) + (+c.low_count);
    });
    Object.entries(lowByBrand).forEach(([brand, low]) => {
      todos.push({ sev: 'high', brand, title: `저평점 후기 ${low}건`, desc: '내용 확인 후 대응이 필요합니다', tab: 'reviews' });
    });
    // 순위 미노출·급락: 브랜드 단위로 묶기
    const missByBrand = {}, dropByBrand = {};
    Object.values(rankByProduct).forEach(e => {
      if (!inB(e.brand)) return;
      const ds = Object.keys(e.days).sort().reverse();
      const cur = e.days[ds[0]], prv = ds[1] != null ? e.days[ds[1]] : undefined;
      if (cur == null && ds[0] >= addDays(t, -1)) {
        (missByBrand[e.brand] = missByBrand[e.brand] || []).push(e.keyword);
      } else if (cur != null && prv != null && cur - prv >= 5) {
        (dropByBrand[e.brand] = dropByBrand[e.brand] || []).push(`'${e.keyword}' ${prv}→${cur}위`);
      }
    });
    Object.entries(missByBrand).forEach(([brand, kws]) => {
      todos.push({ sev: 'high', brand, title: `순위 미노출 ${kws.length}건`, desc: kws.slice(0, 3).map(k => `'${k}'`).join(', ') + (kws.length > 3 ? ` 외 ${kws.length - 3}건` : ''), tab: 'rank' });
    });
    Object.entries(dropByBrand).forEach(([brand, ds2]) => {
      todos.push({ sev: 'mid', brand, title: `순위 급락 ${ds2.length}건`, desc: ds2.slice(0, 2).join(', ') + (ds2.length > 2 ? ' 외' : ''), tab: 'rank' });
    });
    D.radar.filter(a => inB(a.brand)).forEach(a => {
      todos.push({ sev: 'mid', brand: a.brand, title: `경쟁사 ${a.kind}`, desc: `[${a.keyword}] ${(a.title || '').slice(0, 24)} — ${a.detail || ''}` });
    });
    Object.entries(latestScore).forEach(([cn, s]) => {
      if (allowedBrands && !allowedBrands.some(b => nMatch(b, cn))) return;
      const silent = s.period_end ? Math.floor((new Date(t) - new Date(s.period_end)) / 86400000) : 0;
      if (silent >= 14) todos.push({ sev: 'mid', brand: cn, title: `${silent}일째 대화 없음`, desc: '먼저 연락해 보세요', tab: 'chat' });
    });
    D.promises.filter(p => inB(p.brand)).forEach(p => {
      todos.push({ sev: 'info', brand: p.brand || p.staff_name, title: '오늘 약속', desc: p.title || p.memo || '', tab: 'team' });
    });
    const sevOrder = { high: 0, mid: 1, info: 2 };
    todos.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);

    // ── 자동화 상태 ──
    const hbOf = (n) => D.hb.find(h => h.name === n);
    const hbJob = (name, sched) => {
      const h = hbOf(name);
      if (!h) return { name, sched, status: 'none', when: '', note: '오늘 밤부터 기록됩니다' };
      const isToday = (h.ran_at || '').slice(0, 10) === t || new Date(h.ran_at).toDateString() === new Date().toDateString();
      return { name, sched, status: h.ok === false ? 'fail' : isToday ? 'ok' : 'none', when: isToday ? hhmm(h.ran_at) : timeAgo(h.ran_at), note: h.note || '' };
    };
    const y1d = addDays(t, -1);
    const dataJob = (name, sched, ok, when, note) => ({ name, sched, status: ok ? 'ok' : 'none', when: ok ? when : '', note });
    const revCnt = D.reviewsToday.length;
    const rankToday = D.rankHist.filter(h => (h.collected_at || '').slice(0, 10) === t).length;
    const chatToday = D.chatUploads.filter(u => new Date(u.created_at).toDateString() === new Date().toDateString()).length;
    const reportOk = D.ad.some(r => r.date === y1d);
    const jobs = [
      hbJob('레이더', '01:00'),
      hbJob('정리백업', '02:20'),
      hbJob('새벽준비', '02:53'),
      dataJob('후기체크', '03:00', revCnt > 0, '', revCnt > 0 ? `오늘 ${revCnt}개 상품 점검` : '오늘 점검 기록 없음'),
      dataJob('순위체크', '03:40', rankToday > 0, '', rankToday > 0 ? `오늘 ${rankToday}건 수집` : '오늘 수집 기록 없음'),
      dataJob('보고서 수집·집계', '04시대', reportOk, '', reportOk ? '어제 데이터 반영 완료' : '어제 데이터 미반영'),
      dataJob('대화 수집·분석', '새벽', chatToday > 0, '', chatToday > 0 ? `오늘 ${chatToday}개 방 수집` : '오늘 수집 기록 없음'),
    ];

    return { rows, todos, jobs };
  }, [D, allowedBrands, inB, t]);

  if (loading || !computed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...card, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.txd, fontSize: 13 }}>홈 화면을 준비하는 중…</div>
      </div>
    );
  }

  const staff = D.users.filter(u => u.role !== 'admin');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <NoticeBoard currentUser={currentUser} isAdmin={isAdmin} />
      <HeroHeader adData={D.ad} allowedBrands={allowedBrands} userName={currentUser?.name || ''} />
      <TodoList items={computed.todos} setTab={setTab} />
      <SignalBoard rows={computed.rows} />
      <AutoStatus jobs={computed.jobs} />
      <TeamMini staff={staff} reports={D.reports} overdue={D.actions.filter(a => a.due_date && a.due_date < t && !a.done)} events={D.events} setTab={setTab} />
    </div>
  );
}
