// ============================================
// 팀 업무 (일일보고 · 회의록/액션 · 스코어보드)
//   일일보고: 직원 3줄 작성(하루 1건, 수정 가능) / 대표 모아보기+코멘트
//   회의록: 회의 기록 + 액션아이템(담당·기한·완료). 미완료 액션 항상 상단 노출
//   스코어보드: 제출률·액션 완료율·지연·담당 브랜드 성과(최근7일 vs 이전7일) 자동 집계
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers, fetchAdDataForReport, fetchMappingsAll } from '../store';
import {
  fetchReportsByDate, fetchMyReports, fetchReportsRange, upsertDailyReport, setCeoComment,
  fetchMeetings, addMeeting, updateMeeting, deleteMeeting,
  fetchOpenActions, fetchAllActions, fetchActionsByMeeting, addAction, toggleAction, deleteAction,
} from '../team';
import { fmtNum } from '../utils';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = () => ymd(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const kd = (s) => s ? `${s.slice(5, 7)}/${s.slice(8, 10)}` : '';
const WDAY = ['일', '월', '화', '수', '목', '금', '토'];
const kdw = (s) => { try { return kd(s) + '(' + WDAY[new Date(s + 'T00:00:00').getDay()] + ')'; } catch { return kd(s); } };
const won = (n) => '₩' + fmtNum(Math.round(n || 0));

// ─── 공용 스타일 ───
const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 };
const inp = { background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 12px', color: C.tx, fontSize: 13, width: '100%', boxSizing: 'border-box' };
const ta = { ...inp, minHeight: 56, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 };
const btn = { padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.bd}`, background: C.sf2, color: C.tx, cursor: 'pointer', fontSize: 13 };
const btnAc = { ...btn, background: C.ac, color: '#fff', border: 'none', fontWeight: 700 };
const label = { fontSize: 12, color: C.txd, marginBottom: 4, fontWeight: 600 };
const badge = (bg, color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: bg, color });

function Section({ title, sub, right, children }) {
  return (
    <div style={{ ...card, marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sub ? 2 : 10 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{title}</div>
        {right}
      </div>
      {sub && <div style={{ fontSize: 12, color: C.txd, marginBottom: 10 }}>{sub}</div>}
      {children}
    </div>
  );
}

// ══════════════ 일일보고: 내 보고 작성 (직원+대표 공용) ══════════════
function MyDaily({ currentUser, onSaved }) {
  const [form, setForm] = useState({ done: '', tomorrow: '', blocker: '' });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const td = todayStr();

  const load = useCallback(async () => {
    const list = await fetchMyReports(currentUser.id, 14);
    setHistory(list);
    const todayR = list.find(r => r.report_date === td);
    if (todayR) setForm({ done: todayR.done || '', tomorrow: todayR.tomorrow || '', blocker: todayR.blocker || '' });
  }, [currentUser.id]);
  useEffect(() => { load(); }, [load]);

  const submitted = history.some(r => r.report_date === td);

  const save = async () => {
    if (!form.done.trim() && !form.tomorrow.trim()) { alert('오늘 한 일 또는 내일 최우선 중 하나는 적어주세요.'); return; }
    setSaving(true);
    const r = await upsertDailyReport({ owner_id: currentUser.id, staff_name: currentUser.name, report_date: td, ...form });
    setSaving(false);
    if (r.ok) { setSavedMsg(submitted ? '수정되었습니다 ✓' : '제출되었습니다 ✓'); setTimeout(() => setSavedMsg(''), 2500); load(); onSaved && onSaved(); }
    else alert('저장 실패: ' + r.msg);
  };

  return (
    <div>
      <Section title={`오늘 보고 쓰기 — ${kdw(td)}`}
        sub="3줄이면 충분합니다. 몇 시에 일했는지가 아니라 무엇이 진행됐는지를 공유하는 자리입니다."
        right={submitted ? <span style={badge('rgba(61,217,160,0.15)', C.ok)}>제출 완료 · 수정 가능</span> : <span style={badge('rgba(240,112,112,0.15)', C.no)}>미제출</span>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><div style={label}>① 오늘 한 일 · 성과</div>
            <textarea style={ta} value={form.done} placeholder="예) 모그라미 여름 프로모션 소재 3종 교체, ROAS 낮은 키워드 12개 제외" onChange={e => setForm(f => ({ ...f, done: e.target.value }))} /></div>
          <div><div style={label}>② 내일 최우선 1가지</div>
            <textarea style={{ ...ta, minHeight: 44 }} value={form.tomorrow} placeholder="예) 천비누솝 신규 캠페인 세팅 완료" onChange={e => setForm(f => ({ ...f, tomorrow: e.target.value }))} /></div>
          <div><div style={label}>③ 막힌 것 · 도움 필요한 것 (없으면 비워두세요)</div>
            <textarea style={{ ...ta, minHeight: 44 }} value={form.blocker} placeholder="예) GFA 소재 시안 컨펌 대기중 — 대표님 확인 부탁드립니다" onChange={e => setForm(f => ({ ...f, blocker: e.target.value }))} /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={btnAc} disabled={saving} onClick={save}>{saving ? '저장 중…' : submitted ? '수정 저장' : '제출하기'}</button>
            {savedMsg && <span style={{ color: C.ok, fontSize: 13, fontWeight: 700 }}>{savedMsg}</span>}
          </div>
        </div>
      </Section>

      <Section title="내 최근 보고" sub="대표 코멘트가 달리면 여기에 표시됩니다.">
        {history.length === 0 ? <div style={{ color: C.txd, fontSize: 13 }}>아직 보고가 없습니다. 오늘 첫 보고를 남겨보세요.</div> :
          history.map(r => (
            <div key={r.id} style={{ borderTop: `1px solid ${C.bd}`, padding: '10px 2px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.cyan, marginBottom: 4 }}>{kdw(r.report_date)}</div>
              {r.done && <div style={{ fontSize: 13, marginBottom: 2 }}>✅ {r.done}</div>}
              {r.tomorrow && <div style={{ fontSize: 13, color: C.txd, marginBottom: 2 }}>▶ 내일: {r.tomorrow}</div>}
              {r.blocker && <div style={{ fontSize: 13, color: C.warn, marginBottom: 2 }}>⚠ {r.blocker}</div>}
              {r.ceo_comment && <div style={{ fontSize: 13, color: C.yel, background: 'rgba(240,199,70,0.08)', borderRadius: 8, padding: '6px 10px', marginTop: 6 }}>💬 대표: {r.ceo_comment}</div>}
            </div>
          ))}
      </Section>
    </div>
  );
}

// ══════════════ 일일보고: 대표 모아보기 ══════════════
function DailyAdmin({ users, currentUser }) {
  const [date, setDate] = useState(todayStr());
  const [reports, setReports] = useState([]);
  const [comments, setComments] = useState({});
  const staff = users.filter(u => u.role !== 'admin');

  const load = useCallback(async () => {
    const list = await fetchReportsByDate(date);
    setReports(list);
    const c = {}; list.forEach(r => { c[r.id] = r.ceo_comment || ''; });
    setComments(c);
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const saveComment = async (id) => {
    const ok = await setCeoComment(id, comments[id] || '');
    if (ok) load(); else alert('코멘트 저장 실패');
  };

  const byOwner = {}; reports.forEach(r => { byOwner[r.owner_id] = r; });
  const submitted = staff.filter(u => byOwner[u.id]).length;

  return (
    <div>
      <Section title="일일보고 모아보기"
        sub="미제출 직원은 빨간 뱃지로 표시됩니다. 코멘트를 남기면 직원 화면에 노출됩니다 — 읽고 있다는 신호가 보고를 오래가게 합니다."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btn} onClick={() => setDate(addDays(date, -1))}>◀</button>
            <input type="date" style={{ ...inp, width: 150 }} value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
            <button style={btn} disabled={date >= todayStr()} onClick={() => setDate(addDays(date, 1))}>▶</button>
            <span style={badge(submitted === staff.length && staff.length > 0 ? 'rgba(61,217,160,0.15)' : 'rgba(240,164,69,0.15)', submitted === staff.length && staff.length > 0 ? C.ok : C.warn)}>{submitted}/{staff.length} 제출</span>
          </div>
        }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {staff.map(u => {
            const r = byOwner[u.id];
            return (
              <div key={u.id} style={{ background: C.sf2, border: `1px solid ${r ? C.bd : 'rgba(240,112,112,0.5)'}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{u.name}</span>
                  {r ? <span style={badge('rgba(61,217,160,0.15)', C.ok)}>제출</span> : <span style={badge('rgba(240,112,112,0.15)', C.no)}>미제출</span>}
                </div>
                {r ? (
                  <div>
                    {r.done && <div style={{ fontSize: 13, marginBottom: 4 }}>✅ {r.done}</div>}
                    {r.tomorrow && <div style={{ fontSize: 13, color: C.txd, marginBottom: 4 }}>▶ 내일: {r.tomorrow}</div>}
                    {r.blocker ? <div style={{ fontSize: 13, color: C.warn, marginBottom: 4 }}>⚠ {r.blocker}</div>
                      : <div style={{ fontSize: 12, color: C.txm, marginBottom: 4 }}>막힌 것 없음</div>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input style={{ ...inp, fontSize: 12.5 }} placeholder="한 줄 코멘트 (직원에게 표시)" value={comments[r.id] || ''}
                        onChange={e => setComments(c => ({ ...c, [r.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveComment(r.id); }} />
                      <button style={btn} onClick={() => saveComment(r.id)}>💬</button>
                    </div>
                    {r.ceo_comment && <div style={{ fontSize: 12, color: C.yel, marginTop: 6 }}>현재 코멘트: {r.ceo_comment}</div>}
                  </div>
                ) : <div style={{ fontSize: 13, color: C.txm }}>이 날짜의 보고가 없습니다.</div>}
              </div>
            );
          })}
        </div>
        {staff.length === 0 && <div style={{ color: C.txd, fontSize: 13 }}>직원 계정이 없습니다. 설정에서 직원을 추가하세요.</div>}
      </Section>
    </div>
  );
}

// ══════════════ 회의록 + 액션아이템 ══════════════
function ActionRow({ a, users, showMeeting, onChanged, canDelete }) {
  const overdue = !a.done && a.due_date && a.due_date < todayStr();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 4px', borderTop: `1px solid ${C.bd}` }}>
      <input type="checkbox" checked={!!a.done} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: C.ok }}
        onChange={async e => { await toggleAction(a.id, e.target.checked); onChanged(); }} />
      <div style={{ flex: 1, fontSize: 13, textDecoration: a.done ? 'line-through' : 'none', color: a.done ? C.txm : C.tx }}>
        {a.content}
        <span style={{ color: C.cyan, marginLeft: 8, fontSize: 12 }}>{a.assignee_name || '담당 미지정'}</span>
        {a.due_date && <span style={{ marginLeft: 8, fontSize: 12, color: overdue ? C.no : C.txd, fontWeight: overdue ? 800 : 400 }}>~{kd(a.due_date)}{overdue ? ' 지연!' : ''}</span>}
      </div>
      {canDelete && <button style={{ ...btn, padding: '2px 8px', fontSize: 12 }} onClick={async () => { if (confirm('이 액션을 삭제할까요?')) { await deleteAction(a.id); onChanged(); } }}>✕</button>}
    </div>
  );
}

function AddActionForm({ meetingId, users, onAdded }) {
  const [content, setContent] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const add = async () => {
    if (!content.trim()) return;
    const u = users.find(x => x.id === assignee);
    const r = await addAction({ meeting_id: meetingId, content: content.trim(), assignee_id: u?.id, assignee_name: u?.name, due_date: due || null });
    if (r.ok) { setContent(''); setDue(''); onAdded(); } else alert('추가 실패: ' + r.msg);
  };
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
      <input style={{ ...inp, flex: 2, minWidth: 180 }} placeholder="할 일 내용" value={content} onChange={e => setContent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
      <select style={{ ...inp, flex: 1, minWidth: 110 }} value={assignee} onChange={e => setAssignee(e.target.value)}>
        <option value="">담당자</option>
        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      <input type="date" style={{ ...inp, width: 140 }} value={due} onChange={e => setDue(e.target.value)} />
      <button style={btnAc} onClick={add}>추가</button>
    </div>
  );
}

function MeetingsView({ users, currentUser, isAdmin }) {
  const [meetings, setMeetings] = useState([]);
  const [openActions, setOpenActions] = useState([]);
  const [sel, setSel] = useState(null);          // 선택된 회의 id
  const [selActions, setSelActions] = useState([]);
  const [editNotes, setEditNotes] = useState(''); const [editTitle, setEditTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [newM, setNewM] = useState({ meeting_date: todayStr(), title: '', notes: '' });

  const loadAll = useCallback(async () => {
    const [ms, oa] = await Promise.all([fetchMeetings(30), fetchOpenActions()]);
    setMeetings(ms); setOpenActions(oa);
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  const loadSel = useCallback(async (id) => {
    if (!id) { setSelActions([]); return; }
    setSelActions(await fetchActionsByMeeting(id));
  }, []);
  useEffect(() => { loadSel(sel); }, [sel, loadSel]);

  const selM = meetings.find(m => m.id === sel);
  useEffect(() => { if (selM) { setEditNotes(selM.notes || ''); setEditTitle(selM.title || ''); } }, [sel]);

  const createMeeting = async () => {
    if (!newM.title.trim() && !newM.notes.trim()) { alert('제목이나 내용을 입력하세요.'); return; }
    const r = await addMeeting({ ...newM, created_by: currentUser.name });
    if (r.ok) { setCreating(false); setNewM({ meeting_date: todayStr(), title: '', notes: '' }); await loadAll(); setSel(r.meeting.id); }
    else alert('생성 실패: ' + r.msg);
  };
  const saveMeeting = async () => {
    const ok = await updateMeeting(sel, { title: editTitle, notes: editNotes });
    if (ok) { loadAll(); alert('저장되었습니다.'); } else alert('저장 실패');
  };
  const removeMeeting = async () => {
    if (!confirm('회의록과 소속 액션아이템이 함께 삭제됩니다. 삭제할까요?')) return;
    await deleteMeeting(sel); setSel(null); loadAll();
  };
  const refresh = () => { loadAll(); loadSel(sel); };

  const overdueCnt = openActions.filter(a => a.due_date && a.due_date < todayStr()).length;

  return (
    <div>
      <Section title="미완료 액션" sub="지난 회의에서 정한 것들입니다. 다음 회의 첫 5분은 이 목록 확인부터."
        right={<span style={badge(overdueCnt ? 'rgba(240,112,112,0.15)' : 'rgba(61,217,160,0.15)', overdueCnt ? C.no : C.ok)}>{openActions.length}건 미완료 · {overdueCnt}건 지연</span>}>
        {openActions.length === 0 ? <div style={{ color: C.txd, fontSize: 13 }}>미완료 액션이 없습니다. 👍</div> :
          openActions.map(a => <ActionRow key={a.id} a={a} users={users} onChanged={refresh} canDelete={isAdmin} />)}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: C.txd, marginBottom: 4 }}>+ 회의 없이 바로 액션 추가</div>
          <AddActionForm meetingId={null} users={users} onAdded={refresh} />
        </div>
      </Section>

      <Section title="회의록" right={<button style={btnAc} onClick={() => setCreating(v => !v)}>{creating ? '닫기' : '+ 새 회의록'}</button>}>
        {creating && (
          <div style={{ background: C.sf2, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input type="date" style={{ ...inp, width: 150 }} value={newM.meeting_date} onChange={e => setNewM(m => ({ ...m, meeting_date: e.target.value }))} />
              <input style={inp} placeholder="회의 제목 (예: 주간 성과 회의)" value={newM.title} onChange={e => setNewM(m => ({ ...m, title: e.target.value }))} />
            </div>
            <textarea style={{ ...ta, minHeight: 100 }} placeholder={"논의 내용을 적으세요.\n결정된 할 일은 저장 후 아래 '액션아이템'에 담당자·기한과 함께 추가하세요."} value={newM.notes} onChange={e => setNewM(m => ({ ...m, notes: e.target.value }))} />
            <div style={{ marginTop: 8 }}><button style={btnAc} onClick={createMeeting}>회의록 저장</button></div>
          </div>
        )}
        {meetings.length === 0 && !creating ? <div style={{ color: C.txd, fontSize: 13 }}>회의록이 없습니다. '+ 새 회의록'으로 시작하세요.</div> :
          meetings.map(m => (
            <div key={m.id} style={{ borderTop: `1px solid ${C.bd}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 4px', cursor: 'pointer' }} onClick={() => setSel(sel === m.id ? null : m.id)}>
                <div style={{ fontSize: 13.5 }}>
                  <span style={{ fontWeight: 800, color: C.cyan }}>{kdw(m.meeting_date)}</span>
                  <span style={{ marginLeft: 10, fontWeight: 700 }}>{m.title || '(제목 없음)'}</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: C.txm }}>{m.created_by}</span>
                </div>
                <span style={{ color: C.txd }}>{sel === m.id ? '▲' : '▼'}</span>
              </div>
              {sel === m.id && (
                <div style={{ background: C.sf2, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <input style={{ ...inp, fontWeight: 700, marginBottom: 8 }} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <textarea style={{ ...ta, minHeight: 120 }} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={btnAc} onClick={saveMeeting}>내용 저장</button>
                    {isAdmin && <button style={{ ...btn, color: C.no }} onClick={removeMeeting}>회의록 삭제</button>}
                  </div>
                  <div style={{ marginTop: 14, fontSize: 13, fontWeight: 800 }}>📋 이 회의의 액션아이템</div>
                  {selActions.length === 0 ? <div style={{ color: C.txm, fontSize: 12.5, padding: '6px 0' }}>아직 없습니다. 아래에서 추가하세요.</div> :
                    selActions.map(a => <ActionRow key={a.id} a={a} users={users} onChanged={refresh} canDelete={true} />)}
                  <AddActionForm meetingId={m.id} users={users} onAdded={refresh} />
                </div>
              )}
            </div>
          ))}
      </Section>
    </div>
  );
}

// ══════════════ 스코어보드 ══════════════
function Scoreboard({ users }) {
  const [reports, setReports] = useState([]);
  const [actions, setActions] = useState([]);
  const [adData, setAdData] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(true);
  const td = todayStr(); const from7 = addDays(td, -6); const from14 = addDays(td, -13);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, as, ad, mp] = await Promise.all([
        fetchReportsRange(from7, td), fetchAllActions(500), fetchAdDataForReport(15, null), fetchMappingsAll(),
      ]);
      if (!alive) return;
      setReports(rs); setActions(as); setAdData(ad || []); setMappings(mp || []); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const mapByKey = {}; mappings.forEach(m => { mapByKey[m.match_key] = m.brand; });
    const brandAgg = {};   // brand -> {rc, rr, pc, pr}
    adData.forEach(r => {
      const b = mapByKey[r.match_key]; if (!b) return;
      const o = (brandAgg[b] = brandAgg[b] || { rc: 0, rr: 0, pc: 0, pr: 0 });
      if (r.date >= from7) { o.rc += +r.cost || 0; o.rr += +r.conv_revenue || 0; }
      else if (r.date >= from14) { o.pc += +r.cost || 0; o.pr += +r.conv_revenue || 0; }
    });
    return users.filter(u => u.role !== 'admin').map(u => {
      const myReports = new Set(reports.filter(r => r.owner_id === u.id).map(r => r.report_date));
      const myActs = actions.filter(a => a.assignee_id === u.id);
      const doneActs = myActs.filter(a => a.done).length;
      const overdue = myActs.filter(a => !a.done && a.due_date && a.due_date < td).length;
      let brands = [];
      try { brands = JSON.parse(u.assigned_brands || '[]'); } catch { brands = []; }
      let rc = 0, rr = 0, pc = 0, pr = 0;
      brands.forEach(b => { const g = brandAgg[b]; if (g) { rc += g.rc; rr += g.rr; pc += g.pc; pr += g.pr; } });
      const roasNow = rc > 0 ? rr / rc * 100 : 0;
      const roasPrev = pc > 0 ? pr / pc * 100 : 0;
      return { u, submit: myReports.size, actTotal: myActs.length, actDone: doneActs, overdue, brands, rc, rr, roasNow, roasPrev };
    });
  }, [users, reports, actions, adData, mappings]);

  const cell = { padding: '9px 10px', fontSize: 13, borderTop: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
  const head = { ...cell, fontSize: 12, color: C.txd, fontWeight: 700, borderTop: 'none', whiteSpace: 'nowrap' };

  return (
    <Section title="주간 스코어보드" sub={`${kd(from7)}~${kd(td)} 자동 집계 — 입력할 것이 없습니다. 보고 제출·액션 완료·담당 브랜드 성과가 그대로 드러납니다.`}>
      {loading ? <div style={{ color: C.txd, fontSize: 13 }}>집계 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...head, textAlign: 'left' }}>직원</th>
              <th style={head}>보고 제출 (7일)</th>
              <th style={head}>액션 완료</th>
              <th style={head}>지연 액션</th>
              <th style={{ ...head, textAlign: 'left' }}>담당 브랜드</th>
              <th style={head}>주간 매출 (구매완료)</th>
              <th style={head}>주간 ROAS · 전주 대비</th>
            </tr></thead>
            <tbody>
              {rows.map(({ u, submit, actTotal, actDone, overdue, brands, rc, rr, roasNow, roasPrev }) => {
                const roasD = roasNow - roasPrev;
                return (
                  <tr key={u.id}>
                    <td style={{ ...cell, fontWeight: 800 }}>{u.name}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <span style={{ color: submit >= 5 ? C.ok : submit >= 3 ? C.warn : C.no, fontWeight: 800 }}>{submit}</span>
                      <span style={{ color: C.txm }}>/7일</span>
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>{actTotal === 0 ? <span style={{ color: C.txm }}>—</span> :
                      <span style={{ color: actDone === actTotal ? C.ok : C.tx }}>{actDone}/{actTotal}</span>}</td>
                    <td style={{ ...cell, textAlign: 'center' }}>{overdue > 0 ? <span style={{ color: C.no, fontWeight: 800 }}>{overdue}건</span> : <span style={{ color: C.txm }}>0</span>}</td>
                    <td style={{ ...cell, whiteSpace: 'normal', maxWidth: 220 }}>{brands.length ? brands.join(', ') : <span style={{ color: C.txm }}>미지정 (설정에서 지정)</span>}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{brands.length ? won(rr) : <span style={{ color: C.txm }}>—</span>}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>{brands.length && rc > 0 ? (
                      <span>
                        <b>{fmtNum(Math.round(roasNow))}%</b>
                        <span style={{ marginLeft: 6, color: roasD >= 0 ? C.ok : C.no, fontSize: 12 }}>{roasD >= 0 ? '▲' : '▼'}{fmtNum(Math.abs(Math.round(roasD)))}%p</span>
                      </span>) : <span style={{ color: C.txm }}>—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 12, color: C.txm, marginTop: 10 }}>
            · 보고 제출: 최근 7일 중 제출한 날 수 · 액션: 본인 담당 전체 대비 완료 · 브랜드 성과: 담당 브랜드 합산, 매출·ROAS는 구매완료 기준
          </div>
        </div>
      )}
    </Section>
  );
}

// ══════════════ 메인 ══════════════
export default function Team({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  const [sub, setSub] = useState('daily');
  const [users, setUsers] = useState([]);
  useEffect(() => { fetchUsers().then(setUsers); }, []);

  const tabs = [
    ['daily', isAdmin ? '📝 일일보고 (모아보기)' : '📝 일일보고'],
    ['meetings', '📋 회의록 · 액션'],
    ['score', '🏅 스코어보드'],
  ];

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>팀 업무</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 14 }}>일일보고 · 회의록/액션 추적 · 자동 스코어보드로 팀의 실행을 관리합니다.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([k, l]) => (
          <button key={k} style={sub === k ? btnAc : btn} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === 'daily' && (isAdmin
        ? <div><DailyAdmin users={users} currentUser={currentUser} /><MyDaily currentUser={currentUser} /></div>
        : <MyDaily currentUser={currentUser} />)}
      {sub === 'meetings' && <MeetingsView users={users} currentUser={currentUser} isAdmin={isAdmin} />}
      {sub === 'score' && <Scoreboard users={users} />}
    </div>
  );
}
