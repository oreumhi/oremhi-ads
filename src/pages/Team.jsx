// ============================================
// 팀 업무 (일일보고 · 회의록/액션 · 스코어보드)
//   일일보고: 직원 3줄 작성(하루 1건, 수정 가능) / 대표 모아보기+코멘트
//   회의록: 회의 기록 + 액션아이템(담당·기한·완료). 미완료 액션 항상 상단 노출
//   스코어보드: 제출률·액션 완료율·지연·담당 브랜드 성과(최근7일 vs 이전7일) 자동 집계
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers, fetchAdDaily } from '../store';
import {
  fetchReportsByDate, fetchMyReports, fetchReportsRange, upsertDailyReport, setCeoComment,
  fetchMeetings, addMeeting, updateMeeting, deleteMeeting,
  fetchOpenActions, fetchAllActions, fetchActionsByMeeting, addAction, toggleAction, deleteAction,
  fetchEventsRange, addCalEvent, updateCalEvent, removeCalEvent, resolveEvent, uploadAttachment,
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

// ─── 사진 첨부 공용 (일일보고·회의록에서 사용, 여러 장 가능) ───
function AttachThumbs({ atts, onRemove }) {
  if (!atts || atts.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
      {atts.map((a, i) => (
        <div key={i} style={{ position: 'relative' }}>
          <img src={a.url} alt={a.name} title={a.name}
            style={{ height: 64, borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.bd}` }}
            onClick={() => window.open(a.url, '_blank')} />
          {onRemove && (
            <span onClick={() => onRemove(i)} title="사진 삭제 (저장해야 반영)"
              style={{ position: 'absolute', top: -6, right: -6, background: C.no, color: '#fff', borderRadius: '50%',
                width: 18, height: 18, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontWeight: 800 }}>✕</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PhotoInput({ files, setFiles }) {
  return (
    <div>
      <div style={label}>📷 사진 첨부 (여러 장 가능 — 자동으로 용량을 줄여 저장합니다)</div>
      <input type="file" accept="image/*" multiple style={{ fontSize: 13, color: C.txd }}
        onChange={e => { const add = Array.from(e.target.files || []); if (add.length) setFiles(prev => [...prev, ...add]); e.target.value = ''; }} />
      {files.length > 0 && (
        <span style={{ fontSize: 12, color: C.ok, marginLeft: 8 }}>
          {files.length}장 선택됨
          <span style={{ color: C.no, cursor: 'pointer', marginLeft: 8 }} onClick={() => setFiles([])}>비우기</span>
        </span>
      )}
    </div>
  );
}

// 선택된 파일들을 압축 → 업로드 → 첨부 목록 반환
async function uploadFiles(files) {
  const atts = [];
  for (const f of files) {
    const blob = await compressImage(f);
    const up = await uploadAttachment(blob, f.name);
    if (up) atts.push(up); else alert(`사진 업로드 실패: ${f.name}`);
  }
  return atts;
}

// ══════════════ 일일보고: 내 보고 작성 (직원+대표 공용) ══════════════
function MyDaily({ currentUser, onSaved }) {
  const [form, setForm] = useState({ done: '', tomorrow: '', blocker: '' });
  const [history, setHistory] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [files, setFiles] = useState([]);           // 새로 선택한 사진들
  const [existingAtts, setExistingAtts] = useState([]);  // 오늘 보고에 이미 저장된 사진들
  const td = todayStr();

  const load = useCallback(async () => {
    const list = await fetchMyReports(currentUser.id, 14);
    setHistory(list);
    const todayR = list.find(r => r.report_date === td);
    if (todayR) {
      setForm({ done: todayR.done || '', tomorrow: todayR.tomorrow || '', blocker: todayR.blocker || '' });
      setExistingAtts(todayR.attachments || []);
    }
  }, [currentUser.id]);
  useEffect(() => { load(); }, [load]);

  const submitted = history.some(r => r.report_date === td);

  const save = async () => {
    if (!form.done.trim() && !form.tomorrow.trim()) { alert('오늘 한 일 또는 내일 최우선 중 하나는 적어주세요.'); return; }
    setSaving(true);
    const newAtts = await uploadFiles(files);
    const atts = [...existingAtts, ...newAtts];
    const r = await upsertDailyReport({ owner_id: currentUser.id, staff_name: currentUser.name, report_date: td, ...form, attachments: atts });
    setSaving(false);
    if (r.ok) {
      setFiles([]); setExistingAtts(atts);
      setSavedMsg(submitted ? '수정되었습니다 ✓' : '제출되었습니다 ✓'); setTimeout(() => setSavedMsg(''), 2500); load(); onSaved && onSaved();
    }
    else alert('저장 실패: ' + r.msg);
  };

  return (
    <div>
      <Section title={`오늘 보고 쓰기 — ${kdw(td)}`}
        sub="3줄이면 충분합니다. 몇 시에 일했는지가 아니라 무엇이 진행됐는지를 공유하는 자리입니다."
        right={submitted ? <span style={badge('rgba(61,217,160,0.15)', C.ok)}>제출 완료 · 수정 가능</span>
          : [0, 6].includes(new Date(td + 'T00:00:00').getDay()) ? <span style={badge('rgba(136,144,166,0.15)', C.txd)}>주말 — 제출은 선택</span>
          : <span style={badge('rgba(240,112,112,0.15)', C.no)}>미제출</span>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div><div style={label}>① 오늘 한 일 · 성과</div>
            <textarea style={ta} value={form.done} placeholder="예) 모그라미 여름 프로모션 소재 3종 교체, ROAS 낮은 키워드 12개 제외" onChange={e => setForm(f => ({ ...f, done: e.target.value }))} /></div>
          <div><div style={label}>② 내일 최우선 1가지</div>
            <textarea style={{ ...ta, minHeight: 44 }} value={form.tomorrow} placeholder="예) 천비누솝 신규 캠페인 세팅 완료" onChange={e => setForm(f => ({ ...f, tomorrow: e.target.value }))} /></div>
          <div><div style={label}>③ 막힌 것 · 도움 필요한 것 (없으면 비워두세요)</div>
            <textarea style={{ ...ta, minHeight: 44 }} value={form.blocker} placeholder="예) GFA 소재 시안 컨펌 대기중 — 대표님 확인 부탁드립니다" onChange={e => setForm(f => ({ ...f, blocker: e.target.value }))} /></div>
          <div>
            <PhotoInput files={files} setFiles={setFiles} />
            <AttachThumbs atts={existingAtts} onRemove={i => setExistingAtts(a => a.filter((_, j) => j !== i))} />
          </div>
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
              <AttachThumbs atts={r.attachments} />
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
  const isWknd = [0, 6].includes(new Date(date + 'T00:00:00').getDay());   // 주말은 미제출을 빨갛게 표시하지 않음

  return (
    <div>
      <Section title="일일보고 모아보기"
        sub="미제출 직원은 빨간 뱃지로 표시됩니다. 코멘트를 남기면 직원 화면에 노출됩니다 — 읽고 있다는 신호가 보고를 오래가게 합니다."
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button style={btn} onClick={() => setDate(addDays(date, -1))}>◀</button>
            <input type="date" style={{ ...inp, width: 150 }} value={date} max={todayStr()} onChange={e => setDate(e.target.value)} />
            <button style={btn} disabled={date >= todayStr()} onClick={() => setDate(addDays(date, 1))}>▶</button>
            <span style={badge(submitted === staff.length && staff.length > 0 ? 'rgba(61,217,160,0.15)' : isWknd ? 'rgba(136,144,166,0.15)' : 'rgba(240,164,69,0.15)', submitted === staff.length && staff.length > 0 ? C.ok : isWknd ? C.txd : C.warn)}>{isWknd ? '주말 · ' : ''}{submitted}/{staff.length} 제출</span>
          </div>
        }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {staff.map(u => {
            const r = byOwner[u.id];
            return (
              <div key={u.id} style={{ background: C.sf2, border: `1px solid ${r || isWknd ? C.bd : 'rgba(240,112,112,0.5)'}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 14 }}>{u.name}</span>
                  {r ? <span style={badge('rgba(61,217,160,0.15)', C.ok)}>제출</span>
                    : isWknd ? <span style={badge('rgba(136,144,166,0.15)', C.txd)}>주말</span>
                    : <span style={badge('rgba(240,112,112,0.15)', C.no)}>미제출</span>}
                </div>
                {r ? (
                  <div>
                    {r.done && <div style={{ fontSize: 13, marginBottom: 4 }}>✅ {r.done}</div>}
                    {r.tomorrow && <div style={{ fontSize: 13, color: C.txd, marginBottom: 4 }}>▶ 내일: {r.tomorrow}</div>}
                    {r.blocker ? <div style={{ fontSize: 13, color: C.warn, marginBottom: 4 }}>⚠ {r.blocker}</div>
                      : <div style={{ fontSize: 12, color: C.txm, marginBottom: 4 }}>막힌 것 없음</div>}
                    <AttachThumbs atts={r.attachments} />
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
  const [newFiles, setNewFiles] = useState([]);        // 새 회의록 사진
  const [editAtts, setEditAtts] = useState([]);        // 선택된 회의의 기존 사진
  const [addFiles, setAddFiles] = useState([]);        // 선택된 회의에 추가할 사진
  const [busy, setBusy] = useState(false);

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
  useEffect(() => { if (selM) { setEditNotes(selM.notes || ''); setEditTitle(selM.title || ''); setEditAtts(selM.attachments || []); setAddFiles([]); } }, [sel]);

  const createMeeting = async () => {
    if (!newM.title.trim() && !newM.notes.trim()) { alert('제목이나 내용을 입력하세요.'); return; }
    setBusy(true);
    const atts = await uploadFiles(newFiles);
    const r = await addMeeting({ ...newM, created_by: currentUser.name, attachments: atts });
    setBusy(false);
    if (r.ok) { setCreating(false); setNewM({ meeting_date: todayStr(), title: '', notes: '' }); setNewFiles([]); await loadAll(); setSel(r.meeting.id); }
    else alert('생성 실패: ' + r.msg);
  };
  const saveMeeting = async () => {
    setBusy(true);
    const newAtts = await uploadFiles(addFiles);
    const merged = [...editAtts, ...newAtts];
    const ok = await updateMeeting(sel, { title: editTitle, notes: editNotes, attachments: merged });
    setBusy(false);
    if (ok) { setEditAtts(merged); setAddFiles([]); loadAll(); alert('저장되었습니다.'); } else alert('저장 실패');
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
            <div style={{ marginTop: 8 }}><PhotoInput files={newFiles} setFiles={setNewFiles} /></div>
            <div style={{ marginTop: 8 }}><button style={btnAc} disabled={busy} onClick={createMeeting}>{busy ? '사진 올리는 중…' : '회의록 저장'}</button></div>
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
                  {(m.attachments || []).length > 0 && <span style={{ marginLeft: 8, fontSize: 12, color: C.txd }}>📷{m.attachments.length}</span>}
                </div>
                <span style={{ color: C.txd }}>{sel === m.id ? '▲' : '▼'}</span>
              </div>
              {sel === m.id && (
                <div style={{ background: C.sf2, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                  <input style={{ ...inp, fontWeight: 700, marginBottom: 8 }} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
                  <textarea style={{ ...ta, minHeight: 120 }} value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                  <div style={{ marginTop: 8 }}>
                    <PhotoInput files={addFiles} setFiles={setAddFiles} />
                    <AttachThumbs atts={editAtts} onRemove={i => setEditAtts(a => a.filter((_, j) => j !== i))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button style={btnAc} disabled={busy} onClick={saveMeeting}>{busy ? '사진 올리는 중…' : '내용 저장'}</button>
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
  const [loading, setLoading] = useState(true);
  const td = todayStr(); const from7 = addDays(td, -6); const from14 = addDays(td, -13);
  // 최근 7일 중 평일 수 (보고 제출 기준은 평일만)
  const wdCnt = Array.from({ length: 7 }, (_, i) => addDays(from7, i))
    .filter(d => ![0, 6].includes(new Date(d + 'T00:00:00').getDay())).length;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rs, as, ad] = await Promise.all([
        fetchReportsRange(from7, td), fetchAllActions(500), fetchAdDaily(15, null),   // 서버 집계 (고속)
      ]);
      if (!alive) return;
      setReports(rs); setActions(as); setAdData(ad || []); setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const rows = useMemo(() => {
    const brandAgg = {};   // brand -> {rc, rr, pc, pr}  (ad_daily: 이미 브랜드 단위 집계)
    adData.forEach(r => {
      const o = (brandAgg[r.brand] = brandAgg[r.brand] || { rc: 0, rr: 0, pc: 0, pr: 0 });
      if (r.date >= from7) { o.rc += +r.cost || 0; o.rr += +r.revenue || 0; }
      else if (r.date >= from14) { o.pc += +r.cost || 0; o.pr += +r.revenue || 0; }
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
  }, [users, reports, actions, adData]);

  const cell = { padding: '9px 10px', fontSize: 13, borderTop: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
  const head = { ...cell, fontSize: 12, color: C.txd, fontWeight: 700, borderTop: 'none', whiteSpace: 'nowrap' };

  return (
    <Section title="주간 스코어보드" sub={`${kd(from7)}~${kd(td)} 자동 집계 — 입력할 것이 없습니다. 보고 제출·액션 완료·담당 브랜드 성과가 그대로 드러납니다.`}>
      {loading ? <div style={{ color: C.txd, fontSize: 13 }}>집계 중…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...head, textAlign: 'left' }}>직원</th>
              <th style={head}>보고 제출 (최근 7일 · 평일 기준)</th>
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
                      <span style={{ color: submit >= wdCnt ? C.ok : submit >= Math.max(1, wdCnt - 2) ? C.warn : C.no, fontWeight: 800 }}>{submit}</span>
                      <span style={{ color: C.txm }}>/{wdCnt}일</span>
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
            · 보고 제출: 최근 7일 중 제출한 날 수 (기준은 평일 {wdCnt}일) · 액션: 본인 담당 전체 대비 완료 · 브랜드 성과: 담당 브랜드 합산, 매출·ROAS는 구매완료 기준
          </div>
        </div>
      )}
    </Section>
  );
}


// ══════════════ 캘린더 ══════════════
const ETYPES = [
  { k: 'annual', label: '연차', icon: '🏖', color: '#5b8def' },
  { k: 'half',   label: '반차', icon: '⏰', color: '#45c8dc' },
  { k: 'sick',   label: '병가', icon: '🏥', color: '#f07070' },
  { k: 'out',    label: '외근·미팅', icon: '🚗', color: '#f5a445' },
  { k: 'etc',    label: '기타', icon: '📌', color: '#9d7ff0' },
  { k: 'promise', label: '약속(자동)', icon: '🔔', color: '#f0c746' },
  { k: 'perf',   label: '성과경고(자동)', icon: '📉', color: '#ed6ea0' },
];
const etypeOf = (k) => ETYPES.find(t => t.k === k) || ETYPES[4];

// 사진 자동 압축 (최대 1400px, JPEG) — 실패하면 원본 사용
async function compressImage(file) {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.82));
    return blob || file;
  } catch { return file; }
}

function covers(ev, dstr) {
  const end = ev.end_date || ev.event_date;
  return ev.event_date <= dstr && dstr <= end;
}

function TeamCalendar({ users, currentUser, isAdmin }) {
  // 모바일(768px 미만)에서는 캘린더를 축소 표시 — PC는 그대로
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const chk = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', chk);
    return () => window.removeEventListener('resize', chk);
  }, []);
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [events, setEvents] = useState([]);
  const [yearEvents, setYearEvents] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [reports, setReports] = useState([]);
  const [selDay, setSelDay] = useState(todayStr());
  const [dayReports, setDayReports] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ etype: 'annual', owner_id: currentUser.id, end_date: '', memo: '' });
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [resolveText, setResolveText] = useState({});

  // 달력 격자 (일요일 시작, 6주)
  const grid = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i);
      return { dstr: ymd(d), inMonth: d.getMonth() === ym.m, dow: d.getDay() };
    });
  }, [ym]);
  const gridFrom = grid[0].dstr, gridTo = grid[41].dstr;

  const load = useCallback(async () => {
    const [evs, ms, rs, yr] = await Promise.all([
      fetchEventsRange(gridFrom, gridTo), fetchMeetings(100), fetchReportsRange(gridFrom, gridTo),
      fetchEventsRange(`${ym.y}-01-01`, `${ym.y}-12-31`),
    ]);
    setEvents(evs); setMeetings(ms); setReports(rs); setYearEvents(yr);
  }, [gridFrom, gridTo, ym.y]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchReportsByDate(selDay).then(setDayReports); }, [selDay, events]);

  const dayEvents = (dstr) => events.filter(e => covers(e, dstr));
  const dayMeetings = (dstr) => meetings.filter(m => m.meeting_date === dstr);
  const dayReportCnt = (dstr) => reports.filter(r => r.report_date === dstr).length;
  const selEvents = dayEvents(selDay);
  const selMeetings = dayMeetings(selDay);
  const staffCnt = users.filter(u => u.role !== 'admin').length;

  // 연간 사용 집계 (연차=일수, 반차=회수, 병가=일수)
  const yearStats = useMemo(() => {
    const per = {};
    yearEvents.forEach(e => {
      if (!['annual', 'half', 'sick'].includes(e.etype)) return;
      const days = e.end_date ? (new Date(e.end_date) - new Date(e.event_date)) / 86400000 + 1 : 1;
      const p = (per[e.owner_name || '?'] = per[e.owner_name || '?'] || { annual: 0, half: 0, sick: 0 });
      if (e.etype === 'annual') p.annual += days;
      if (e.etype === 'half') p.half += 1;
      if (e.etype === 'sick') p.sick += days;
    });
    return per;
  }, [yearEvents]);

  const saveEvent = async () => {
    const who = isAdmin ? (users.find(u => u.id === form.owner_id) || currentUser) : currentUser;
    if (form.end_date && form.end_date < selDay) { alert('종료일이 시작일보다 빠릅니다.'); return; }
    setUploading(true);
    const atts = [];
    for (const f of files) {
      const blob = await compressImage(f);
      const up = await uploadAttachment(blob, f.name);
      if (up) atts.push(up); else alert(`사진 업로드 실패: ${f.name}`);
    }
    const t = etypeOf(form.etype);
    const r = await addCalEvent({
      event_date: selDay, end_date: form.end_date || null, etype: form.etype,
      owner_id: who.id, owner_name: who.name,
      title: `${who.name} ${t.label}`, memo: form.memo || '',
      attachments: atts, created_by: currentUser.name,
    });
    setUploading(false);
    if (r.ok) { setAdding(false); setForm({ etype: 'annual', owner_id: currentUser.id, end_date: '', memo: '' }); setFiles([]); load(); }
    else alert('저장 실패: ' + r.msg);
  };

  const doRemove = async (ev) => {
    const isAuto = ev.source !== 'manual';
    if (!confirm(isAuto ? '이 자동 감지 항목을 숨길까요? (다시 등록되지 않습니다)' : '이 일정을 삭제할까요?')) return;
    await removeCalEvent(ev); load();
  };
  const doResolve = async (ev) => {
    const memo = (resolveText[ev.id] || '').trim();
    if (!memo) { alert('원인·조치 내용을 입력해주세요.'); return; }
    await resolveEvent(ev.id, memo, currentUser.name); load();
  };

  const cellH = mobile ? 58 : 150;   // PC는 크게, 모바일은 콤팩트(점 표시)
  const monthLabel = `${ym.y}년 ${ym.m + 1}월`;
  const move = (n) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div>
      <Section title="팀 캘린더"
        sub="날짜를 클릭하면 아래에 그날의 일정·보고·회의가 모입니다. 휴가/병가 등록과 영수증 사진 첨부도 날짜 클릭 후 하세요."
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={btn} onClick={() => move(-1)}>◀</button>
            <b style={{ fontSize: 15, minWidth: 110, textAlign: 'center' }}>{monthLabel}</b>
            <button style={btn} onClick={() => move(1)}>▶</button>
            <button style={btn} onClick={() => { const d = new Date(); setYm({ y: d.getFullYear(), m: d.getMonth() }); setSelDay(todayStr()); }}>오늘</button>
          </div>
        }>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
          {ETYPES.map(t => <span key={t.k} style={{ fontSize: 13, color: C.txd }}><span style={{ color: t.color }}>●</span> {t.icon} {t.label}</span>)}
          <span style={{ fontSize: 13, color: C.txd }}>✍ 일일보고 · 📋 회의록</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: mobile ? 3 : 6 }}>
          {WDAY.map((w, i) => <div key={w} style={{ textAlign: 'center', fontSize: mobile ? 11.5 : 13.5, fontWeight: 700, color: i === 0 ? C.no : i === 6 ? C.ac : C.txd, padding: '5px 0' }}>{w}</div>)}
          {grid.map(({ dstr, inMonth, dow }) => {
            const evs = dayEvents(dstr); const isToday = dstr === todayStr(); const isSel = dstr === selDay;
            const rc = dayReportCnt(dstr); const ms = dayMeetings(dstr);
            // 같은 종류·같은 대상(브랜드/이름)은 한 줄로 합치기 (×N 표기)
            const chips = [];
            const seen = new Map();
            evs.forEach(e => {
              const t = etypeOf(e.etype);
              const lb = e.etype === 'perf' ? (e.brand || '성과') : e.etype === 'promise' ? (e.brand || '약속') : (e.owner_name || e.title);
              const key = e.etype + '|' + lb;
              if (seen.has(key)) { seen.get(key).n += 1; }
              else { const c = { key, t, lb, n: 1 }; seen.set(key, c); chips.push(c); }
            });
            const MAXC = 5;
            return (
              <div key={dstr} onClick={() => setSelDay(dstr)}
                style={{ minHeight: cellH, background: isSel ? 'rgba(91,141,239,0.14)' : C.sf2, borderRadius: mobile ? 6 : 9, padding: mobile ? 4 : 7, cursor: 'pointer',
                  border: `1.5px solid ${isSel ? C.ac : isToday ? 'rgba(91,141,239,0.55)' : C.bd}`, opacity: inMonth ? 1 : 0.38 }}>
                <div style={{ fontSize: mobile ? 11 : 13.5, fontWeight: isToday ? 800 : 600, color: dow === 0 ? C.no : dow === 6 ? C.ac : C.tx, marginBottom: mobile ? 3 : 5 }}>
                  {+dstr.slice(8)}{isToday && !mobile && <span style={{ fontSize: 11, color: C.ac, marginLeft: 4 }}>오늘</span>}
                  {!mobile && (
                    <span style={{ float: 'right', fontSize: 11.5 }}>
                      {rc > 0 && <span style={{ color: C.ok }}>✍{rc}</span>}
                      {ms.length > 0 && <span style={{ marginLeft: 4 }}>📋</span>}
                    </span>
                  )}
                </div>
                {mobile ? (
                  // 모바일: 일정을 색 점으로 축약 — 날짜를 누르면 아래 상세에서 전체 확인
                  <div style={{ lineHeight: 1.1, fontSize: 11, wordBreak: 'break-all' }}>
                    {chips.slice(0, 6).map(c => <span key={c.key} style={{ color: c.t.color, marginRight: 1 }}>●</span>)}
                    {chips.length > 6 && <span style={{ color: C.txd, fontSize: 10 }}>+{chips.length - 6}</span>}
                    {(rc > 0 || ms.length > 0) && <div style={{ fontSize: 9.5, color: C.txd }}>{rc > 0 ? `✍${rc}` : ''}{ms.length > 0 ? ' 📋' : ''}</div>}
                  </div>
                ) : (
                  <>
                    {chips.slice(0, MAXC).map(c => (
                      <div key={c.key} style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        background: c.t.color + '22', color: c.t.color, borderRadius: 5, padding: '2px 6px', marginBottom: 3 }}>
                        {c.t.icon} {c.lb}{c.n > 1 && <b style={{ marginLeft: 3, opacity: 0.85 }}>×{c.n}</b>}
                      </div>
                    ))}
                    {chips.length > MAXC && <div style={{ fontSize: 11.5, color: C.txd }}>+{chips.length - MAXC}건 더</div>}
                  </>
                )}
              </div>
            );
          })}
        </div>
        {Object.keys(yearStats).length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12.5, color: C.txd, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <b style={{ color: C.tx }}>{ym.y}년 사용:</b>
            {Object.entries(yearStats).map(([name, s]) => (
              <span key={name}>{name} — 연차 {s.annual}일 · 반차 {s.half}회 · 병가 {s.sick}일</span>
            ))}
          </div>
        )}
      </Section>

      <Section title={`${kdw(selDay)} 상세`}
        right={<button style={btnAc} onClick={() => setAdding(v => !v)}>{adding ? '닫기' : '+ 일정 등록'}</button>}>
        {adding && (
          <div style={{ background: C.sf2, borderRadius: 10, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <select style={{ ...inp, width: 130 }} value={form.etype} onChange={e => setForm(f => ({ ...f, etype: e.target.value }))}>
                {ETYPES.filter(t => !['promise', 'perf'].includes(t.k)).map(t => <option key={t.k} value={t.k}>{t.icon} {t.label}</option>)}
              </select>
              {isAdmin ? (
                <select style={{ ...inp, width: 120 }} value={form.owner_id} onChange={e => setForm(f => ({ ...f, owner_id: e.target.value }))}>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              ) : <span style={{ ...inp, width: 'auto', display: 'inline-flex', alignItems: 'center' }}>{currentUser.name}</span>}
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 13, color: C.txd }}>{kd(selDay)}부터</span>
              <input type="date" style={{ ...inp, width: 150 }} value={form.end_date} min={selDay} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 12, color: C.txm }}>← 하루면 비워두세요</span>
            </div>
            <textarea style={{ ...ta, minHeight: 44 }} placeholder="메모 (예: 병원 진료 / ○○ 미팅)" value={form.memo} onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
            <div style={{ marginTop: 8 }}>
              <div style={label}>📷 사진 첨부 (영수증·증빙 — 자동으로 용량을 줄여 저장합니다)</div>
              <input type="file" accept="image/*" multiple style={{ fontSize: 13, color: C.txd }} onChange={e => setFiles(Array.from(e.target.files || []))} />
              {files.length > 0 && <span style={{ fontSize: 12, color: C.ok, marginLeft: 8 }}>{files.length}장 선택됨</span>}
            </div>
            <div style={{ marginTop: 10 }}>
              <button style={btnAc} disabled={uploading} onClick={saveEvent}>{uploading ? '사진 올리는 중…' : '등록하기'}</button>
            </div>
          </div>
        )}

        {selEvents.length === 0 && selMeetings.length === 0 && dayReports.length === 0 &&
          <div style={{ color: C.txd, fontSize: 13 }}>이 날의 기록이 없습니다. '+ 일정 등록'으로 시작하세요.</div>}

        {selEvents.map(ev => {
          const t = etypeOf(ev.etype);
          const canEdit = isAdmin || ev.owner_id === currentUser.id || ev.created_by === currentUser.name || ev.source !== 'manual';
          return (
            <div key={ev.id} style={{ borderTop: `1px solid ${C.bd}`, padding: '10px 2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <span style={{ color: t.color, fontWeight: 800, fontSize: 13.5 }}>{t.icon} {ev.title || t.label}</span>
                  {ev.end_date && ev.end_date !== ev.event_date && <span style={{ fontSize: 12, color: C.txd, marginLeft: 6 }}>({kd(ev.event_date)}~{kd(ev.end_date)})</span>}
                  {ev.severity === 'alert' && <span style={{ ...badge('rgba(240,112,112,0.15)', C.no), marginLeft: 6 }}>🚨 경고</span>}
                  {ev.severity === 'warn' && <span style={{ ...badge('rgba(240,164,69,0.15)', C.warn), marginLeft: 6 }}>⚠ 주의</span>}
                  {ev.status === 'resolved' && <span style={{ ...badge('rgba(61,217,160,0.15)', C.ok), marginLeft: 6 }}>조치완료</span>}
                  {ev.memo && <div style={{ fontSize: 12.5, color: C.txd, marginTop: 4, whiteSpace: 'pre-wrap' }}>{ev.memo}</div>}
                  {ev.status === 'resolved' && ev.resolve_memo && <div style={{ fontSize: 12.5, color: C.ok, marginTop: 4 }}>✅ 조치: {ev.resolve_memo} — {ev.resolved_by}</div>}
                  {(ev.attachments || []).length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {ev.attachments.map((a, i) => (
                        <img key={i} src={a.url} alt={a.name} title={a.name} style={{ height: 64, borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.bd}` }}
                          onClick={() => window.open(a.url, '_blank')} />
                      ))}
                    </div>
                  )}
                  {ev.etype === 'perf' && ev.status === 'needs_check' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <input style={{ ...inp, fontSize: 12.5 }} placeholder="원인·조치 입력 (예: 성수기 종료, 소재 3종 교체 예정)"
                        value={resolveText[ev.id] || ''} onChange={e => setResolveText(s => ({ ...s, [ev.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') doResolve(ev); }} />
                      <button style={btnAc} onClick={() => doResolve(ev)}>조치 완료</button>
                    </div>
                  )}
                </div>
                {canEdit && <button style={{ ...btn, padding: '2px 8px', fontSize: 12 }} onClick={() => doRemove(ev)}>{ev.source === 'manual' ? '삭제' : '숨김'}</button>}
              </div>
            </div>
          );
        })}

        {selMeetings.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.bd}`, padding: '10px 2px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>📋 이 날의 회의록</div>
            {selMeetings.map(m => <div key={m.id} style={{ fontSize: 12.5, color: C.txd, marginBottom: 3 }}><b style={{ color: C.tx }}>{m.title || '(제목 없음)'}</b>{m.notes ? ` — ${m.notes.slice(0, 80)}${m.notes.length > 80 ? '…' : ''}` : ''}</div>)}
          </div>
        )}
        {dayReports.length > 0 && (
          <div style={{ borderTop: `1px solid ${C.bd}`, padding: '10px 2px' }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>✍ 이 날의 일일보고 ({dayReports.length}/{staffCnt})</div>
            {dayReports.map(r => (
              <div key={r.id} style={{ fontSize: 12.5, marginBottom: 6 }}>
                <b style={{ color: C.cyan }}>{r.staff_name}</b>
                {r.done && <span style={{ color: C.tx }}> — {r.done.slice(0, 100)}{r.done.length > 100 ? '…' : ''}</span>}
                {r.blocker && <span style={{ color: C.warn }}> ⚠ {r.blocker.slice(0, 50)}</span>}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
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
    ['calendar', '📅 캘린더'],
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
      {sub === 'calendar' && <TeamCalendar users={users} currentUser={currentUser} isAdmin={isAdmin} />}
      {sub === 'meetings' && <MeetingsView users={users} currentUser={currentUser} isAdmin={isAdmin} />}
      {sub === 'score' && <Scoreboard users={users} />}
    </div>
  );
}
