// ============================================
// 대화 분석 페이지
//
// 직원(staff): 카톡 내보내기 파일 업로드 + 본인 점수/캘린더 확인
// 관리자(admin): 업로드(담당 직원 지정 가능) + 현황판 + 전체 점수 + 전체 캘린더 + 원문 열람
//
// 분석 흐름: 업로드 → '대기' 상태로 저장 → 클로드가 분석 후
//           chat_scores/chat_daily_notes에 결과 기록 + 상태 '완료'로 변경
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { fetchUsers } from '../store';
import {
  parseKakaoExport, guessClientName,
  fetchChatUploads, findPrevUpload, insertChatUpload, deleteChatUpload,
  fetchChatScores, fetchChatContent, fetchChatNotes,
} from '../chat';

const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: 12, color: C.txd, borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 13, borderBottom: `1px solid ${C.bd}22` };
const btn = { background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13 };
const btnGhost = { background: 'none', border: `1px solid ${C.bd}`, borderRadius: 6, padding: '4px 10px', color: C.txd, cursor: 'pointer', fontSize: 11 };
const selStyle = { background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.tx, fontSize: 12, padding: '5px 8px' };

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// 점수 색상
const scoreColor = (s) => (s >= 70 ? C.ok : s >= 45 ? C.warn : C.no);

// ─── 점수 상세 (펼침) ───
function ScoreDetail({ s }) {
  const items = [
    ['진단력', s.score_diagnosis, 25],
    ['제안력', s.score_proposal, 25],
    ['질문·대화유도', s.score_question, 25],
    ['광고주 반응', s.score_response, 15],
    ['선제성', s.score_proactive, 10],
  ];
  return (
    <div style={{ background: C.sf2, borderRadius: 10, padding: 14, margin: '4px 0 10px' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
        {items.map(([label, v, max]) => (
          <div key={label} style={{ minWidth: 90 }}>
            <div style={{ fontSize: 11, color: C.txd }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>{v ?? '-'}<span style={{ fontSize: 11, color: C.txm }}>/{max}</span></div>
          </div>
        ))}
      </div>
      {s.comment && <Block label="총평" text={s.comment} color={C.ac} />}
      {s.good_example && <Block label="잘한 대화" text={s.good_example} color={C.ok} />}
      {s.bad_example && <Block label="아쉬운 대화" text={s.bad_example} color={C.no} />}
      {s.advice && <Block label="다음 주 개선 포인트" text={s.advice} color={C.warn} />}
    </div>
  );
}
function Block({ label, text, color }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, padding: '6px 10px', marginBottom: 8, background: C.sf3, borderRadius: 6 }}>
      <div style={{ fontSize: 11, color, fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: C.tx, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

// ─── 점수 테이블 (공용) ───
function ScoreTable({ scores, showStaff }) {
  const [openId, setOpenId] = useState(null);
  if (scores.length === 0) return <div style={{ color: C.txm, fontSize: 13, padding: 10 }}>아직 분석 결과가 없습니다.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          {showStaff && <th style={th}>담당자</th>}
          <th style={th}>광고주</th><th style={th}>기간</th><th style={th}>총점</th><th style={th}></th>
        </tr></thead>
        <tbody>
          {scores.map(s => (
            <React.Fragment key={s.id}>
              <tr style={{ cursor: 'pointer' }} onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                {showStaff && <td style={td}>{s.staff_name}</td>}
                <td style={td}>{s.client_name}</td>
                <td style={{ ...td, fontSize: 12, color: C.txd }}>{s.period_start} ~ {s.period_end}</td>
                <td style={{ ...td, fontWeight: 800, fontSize: 15, color: scoreColor(s.score_total) }}>{s.score_total}</td>
                <td style={{ ...td, fontSize: 11, color: C.txd }}>{openId === s.id ? '▲ 접기' : '▼ 상세'}</td>
              </tr>
              {openId === s.id && (
                <tr><td colSpan={showStaff ? 5 : 4} style={{ padding: 0, border: 'none' }}><ScoreDetail s={s} /></td></tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 업로드 섹션 (직원·대표 공용) ───
// 대표(admin)는 파일마다 "담당 직원"을 지정할 수 있음 (기본값: 본인)
function UploadSection({ currentUser, isAdmin, staff, onDone }) {
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const people = isAdmin ? [currentUser, ...(staff || [])] : [currentUser];

  // 파일 선택 → 파싱
  const onFiles = async (fileList) => {
    setMsg('');
    const items = [];
    for (const f of Array.from(fileList)) {
      if (!f.name.endsWith('.txt')) { setMsg(`"${f.name}" — 카톡 내보내기 .txt 파일만 올릴 수 있습니다`); continue; }
      const text = await f.text();
      const p = parseKakaoExport(text);
      if (!p.valid) { setMsg(`"${f.name}" — 카톡 내보내기 파일이 아니거나 형식을 읽을 수 없습니다`); continue; }
      items.push({
        fileName: f.name, content: text,
        roomName: p.roomName, clientName: guessClientName(p.roomName),
        msgCount: p.msgCount, firstDate: p.firstDate, lastDate: p.lastDate,
        assignId: currentUser.id,
      });
    }
    setPending(prev => [...prev, ...items]);
  };

  // 업로드 확정 (담당자 기준으로 이전 업로드와 중복 기간 자동 계산)
  const confirm = async () => {
    setBusy(true);
    let ok = 0;
    for (const it of pending) {
      const person = people.find(u => u.id === it.assignId) || currentUser;
      const prev = await findPrevUpload(person.id, it.roomName);
      const newFrom = prev && prev.last_date ? addDays(prev.last_date, 1) : it.firstDate;
      const r = await insertChatUpload({
        owner_id: person.id,
        uploader_name: person.name,
        room_name: it.roomName,
        client_name: it.clientName.trim() || it.roomName,
        file_name: it.fileName,
        content: it.content,
        msg_count: it.msgCount,
        first_date: it.firstDate,
        last_date: it.lastDate,
        new_from: newFrom,
        status: '대기',
      });
      if (r) ok++;
    }
    setBusy(false); setPending([]);
    setMsg(`${ok}개 업로드 완료! 분석이 끝나면 점수가 표시됩니다.`);
    if (onDone) onDone();
  };

  return (
    <div style={card}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>💬 광고주 대화 업로드</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 12, lineHeight: 1.7 }}>
        카카오톡 광고주 방에서 <b style={{ color: C.tx }}>대화 내용 내보내기(텍스트만)</b>로 저장한 .txt 파일을 올려주세요.
        여러 파일을 한 번에 올릴 수 있고, 광고주·기간은 자동으로 인식됩니다.
        {isAdmin && ' 파일마다 담당 직원을 지정할 수 있습니다.'}
      </div>
      <label style={{ ...btn, display: 'inline-block' }}>
        파일 선택
        <input type="file" accept=".txt" multiple style={{ display: 'none' }}
          onChange={e => { onFiles(e.target.files); e.target.value = ''; }} />
      </label>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg.includes('완료') ? C.ok : C.no }}>{msg}</div>}

      {/* 파싱 결과 확인 */}
      {pending.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {pending.map((it, i) => (
            <div key={i} style={{ background: C.sf2, borderRadius: 8, padding: 12, marginBottom: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 600 }}>{it.roomName} <span style={{ color: C.txm, fontSize: 11 }}>({it.fileName})</span></div>
              <div style={{ color: C.txd, fontSize: 12, margin: '4px 0' }}>
                메시지 {it.msgCount.toLocaleString()}개 · {it.firstDate} ~ {it.lastDate}
                <span style={{ color: C.ok }}> · 이전에 올린 기간과 겹치면 자동 제외됩니다</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: C.txd }}>광고주명</span>
                <input value={it.clientName}
                  onChange={e => setPending(p => p.map((x, j) => j === i ? { ...x, clientName: e.target.value } : x))}
                  style={{ background: C.sf3, border: `1px solid ${C.bd}`, borderRadius: 6, padding: '5px 8px', color: C.tx, fontSize: 13, width: 160 }} />
                {isAdmin && <>
                  <span style={{ fontSize: 12, color: C.txd }}>담당 직원</span>
                  <select value={it.assignId}
                    onChange={e => setPending(p => p.map((x, j) => j === i ? { ...x, assignId: e.target.value } : x))}
                    style={selStyle}>
                    {people.map(u => <option key={u.id} value={u.id}>{u.name}{u.id === currentUser.id ? ' (나)' : ''}</option>)}
                  </select>
                </>}
                <button style={btnGhost} onClick={() => setPending(p => p.filter((_, j) => j !== i))}>제외</button>
              </div>
            </div>
          ))}
          <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={confirm}>
            {busy ? '업로드 중...' : `${pending.length}개 파일 업로드 확정`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 대화 캘린더 ───
// 메모 유형별 색: 제안(초록) 질문(파랑) 요청(보라) 보고(회색) 미흡(빨강) 기타(노랑)
const KIND_COLOR = { '제안': C.ok, '질문': C.ac, '요청': C.pur, '보고': C.txd, '미흡': C.no, '기타': C.yel };

const todayStr = () => new Date().toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

function CalendarSection({ isAdmin, ownerId, uploads, staff }) {
  const [notes, setNotes] = useState([]);
  const [selStaff, setSelStaff] = useState('all');           // 관리자용 직원 필터
  const [ym, setYm] = useState(todayStr().slice(0, 7));       // 'YYYY-MM'
  const [selDay, setSelDay] = useState(null);

  useEffect(() => {
    (async () => {
      const list = await fetchChatNotes(isAdmin ? null : ownerId, daysAgo(120));
      setNotes(list);
    })();
  }, [isAdmin, ownerId]);

  // 관리자 필터 적용
  const visNotes = notes.filter(n => selStaff === 'all' || n.owner_id === selStaff);
  const visUploads = (uploads || []).filter(u => (selStaff === 'all' || u.owner_id === selStaff));

  // ── 브랜드별 마지막 대화일 → 무응답 경고 계산 ──
  const lastTalk = {}; // key: owner||client → { date, staffName, client }
  for (const u of visUploads) {
    const k = u.owner_id + '||' + u.client_name;
    if (!lastTalk[k] || u.last_date > lastTalk[k].date)
      lastTalk[k] = { date: u.last_date, staffName: u.uploader_name, client: u.client_name };
  }
  for (const n of visNotes) {
    if (n.kind === '미흡' && /대화.{0,4}없/.test(n.note || '')) continue;
    const k = n.owner_id + '||' + n.client_name;
    if (!lastTalk[k] || n.date > lastTalk[k].date)
      lastTalk[k] = { date: n.date, staffName: n.staff_name, client: n.client_name };
  }
  const today = todayStr();
  const warnings = Object.values(lastTalk)
    .map(v => ({ ...v, days: diffDays(v.date, today), due: addDays(v.date, 30) }))
    .filter(v => v.days >= 14)
    .sort((a, b) => b.days - a.days);

  // ── 달력 그리드 ──
  const [Y, M] = ym.split('-').map(Number);
  const firstDow = new Date(Y, M - 1, 1).getDay();
  const daysInMonth = new Date(Y, M, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);

  const notesByDay = {};
  for (const n of visNotes) (notesByDay[n.date] = notesByDay[n.date] || []).push(n);
  // 경고를 마감일 캘린더 칸에도 표시
  for (const w of warnings) {
    const cellDate = w.due >= today ? w.due : today;
    if (cellDate.slice(0, 7) === ym)
      (notesByDay[cellDate] = notesByDay[cellDate] || []).push({
        id: 'warn-' + w.client + w.staffName, kind: '경고', client_name: w.client, staff_name: w.staffName,
        note: `꼭 대화 필요 (${w.days}일째 대화 없음)`, date: cellDate,
      });
  }

  const moveMonth = (d) => {
    const nd = new Date(Y, M - 1 + d, 1);
    setYm(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`);
    setSelDay(null);
  };

  const chipColor = (n) => n.kind === '경고' ? C.no : (KIND_COLOR[n.kind] || C.yel);
  const chipLabel = (n) => (isAdmin && selStaff === 'all' ? `[${n.staff_name}] ` : '') + `${n.client_name}: ${n.note}`;

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>📅 대화 캘린더</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <select value={selStaff} onChange={e => setSelStaff(e.target.value)} style={selStyle}>
              <option value="all">전체 직원</option>
              {(staff || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <button style={btnGhost} onClick={() => moveMonth(-1)}>◀</button>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{Y}년 {M}월</span>
          <button style={btnGhost} onClick={() => moveMonth(1)}>▶</button>
        </div>
      </div>

      {/* 요일 헤더 + 날짜 칸 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 3 }}>
        {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: i === 0 ? C.no : i === 6 ? C.ac : C.txd, padding: '4px 0', fontWeight: 600 }}>{d}</div>
        ))}
        {cells.map((date, i) => (
          <div key={i} onClick={() => date && setSelDay(selDay === date ? null : date)}
            style={{
              minHeight: 64, background: date ? (date === today ? C.ac + '14' : C.sf2) : 'transparent',
              border: `1px solid ${date === selDay ? C.ac : C.bd}`, borderRadius: 6, padding: 4,
              cursor: date ? 'pointer' : 'default', overflow: 'hidden',
            }}>
            {date && <>
              <div style={{ fontSize: 10, color: date === today ? C.ac : C.txm, fontWeight: date === today ? 800 : 400 }}>{Number(date.slice(8))}</div>
              {(notesByDay[date] || []).slice(0, 3).map(n => (
                <div key={n.id} style={{
                  fontSize: 9.5, color: chipColor(n), background: chipColor(n) + '18',
                  borderRadius: 3, padding: '1px 3px', marginTop: 2,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{n.kind === '경고' ? '🔴 ' : ''}{chipLabel(n)}</div>
              ))}
              {(notesByDay[date] || []).length > 3 && <div style={{ fontSize: 9, color: C.txm, marginTop: 1 }}>+{notesByDay[date].length - 3}건 더</div>}
            </>}
          </div>
        ))}
      </div>

      {/* 선택한 날짜 상세 */}
      {selDay && (
        <div style={{ marginTop: 10, background: C.sf2, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.ac, marginBottom: 6 }}>{selDay}</div>
          {(notesByDay[selDay] || []).length === 0 && <div style={{ fontSize: 12, color: C.txm }}>이 날짜에는 기록이 없습니다.</div>}
          {(notesByDay[selDay] || []).map(n => (
            <div key={n.id} style={{ fontSize: 12.5, marginBottom: 4, display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ color: chipColor(n), fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>[{n.kind}]</span>
              <span style={{ color: C.tx }}>{(isAdmin ? `(${n.staff_name}) ` : '') + n.client_name} — {n.note}</span>
            </div>
          ))}
        </div>
      )}

      {/* 무응답 브랜드 경고 목록 */}
      {warnings.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.no, marginBottom: 6 }}>⚠️ 대화가 끊긴 브랜드</div>
          {warnings.map(w => (
            <div key={w.client + w.staffName} style={{
              fontSize: 12.5, padding: '6px 10px', marginBottom: 4, borderRadius: 6,
              background: (w.days >= 30 ? C.no : C.warn) + '14',
              borderLeft: `3px solid ${w.days >= 30 ? C.no : C.warn}`, color: C.tx,
            }}>
              <b>{w.client}</b>{isAdmin ? ` (${w.staffName})` : ''} — {w.due >= today
                ? `${Number(w.due.slice(5, 7))}월 ${Number(w.due.slice(8))}일까지 꼭 대화 필요 (${w.days}일째 대화 없음)`
                : `즉시 대화 필요 (${w.days}일째 대화 없음)`}
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 10.5, color: C.txm, marginTop: 8 }}>
        ※ 메모는 대화 분석이 완료될 때 자동으로 채워집니다. 14일 이상 대화가 없으면 주의, 30일 이상이면 경고로 표시됩니다.
      </div>
    </div>
  );
}

// ─── 직원용 화면 ───
function StaffView({ currentUser }) {
  const [uploads, setUploads] = useState([]);
  const [scores, setScores] = useState([]);

  const load = useCallback(async () => {
    const [u, s] = await Promise.all([
      fetchChatUploads(currentUser.id),
      fetchChatScores(currentUser.id),
    ]);
    setUploads(u); setScores(s);
  }, [currentUser.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <UploadSection currentUser={currentUser} isAdmin={false} onDone={load} />

      {/* 내 대화 캘린더 */}
      <CalendarSection isAdmin={false} ownerId={currentUser.id} uploads={uploads} />

      {/* 내 업로드 이력 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>내 업로드 이력</div>
        {uploads.length === 0 ? <div style={{ color: C.txm, fontSize: 13 }}>아직 업로드한 파일이 없습니다.</div> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>광고주</th><th style={th}>기간</th><th style={th}>올린 날짜</th><th style={th}>상태</th></tr></thead>
            <tbody>
              {uploads.slice(0, 20).map(u => (
                <tr key={u.id}>
                  <td style={td}>{u.client_name}</td>
                  <td style={{ ...td, fontSize: 12, color: C.txd }}>{u.new_from} ~ {u.last_date}</td>
                  <td style={{ ...td, fontSize: 12, color: C.txd }}>{(u.created_at || '').slice(0, 10)}</td>
                  <td style={{ ...td, color: u.status === '완료' ? C.ok : C.warn, fontWeight: 600 }}>{u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 내 점수 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>내 대화 품질 점수</div>
        <ScoreTable scores={scores} showStaff={false} />
      </div>
    </div>
  );
}

// ─── 관리자용: 현황판 ───
function AdminView({ currentUser }) {
  const [uploads, setUploads] = useState([]);
  const [scores, setScores] = useState([]);
  const [staff, setStaff] = useState([]);
  const [viewContent, setViewContent] = useState(null); // {name, text}

  const load = useCallback(async () => {
    const [u, s, users] = await Promise.all([fetchChatUploads(null), fetchChatScores(null), fetchUsers()]);
    setUploads(u); setScores(s);
    setStaff(users.filter(x => x.role === 'staff'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const weekAgo = daysAgo(7);
  const thisWeek = uploads.filter(u => (u.created_at || '') >= weekAgo);
  const waiting = uploads.filter(u => u.status === '대기');

  // 직원별 최근 평균 점수 (최근 4건)
  const staffAvg = (id) => {
    const list = scores.filter(s => s.owner_id === id).slice(0, 4);
    if (list.length === 0) return null;
    return Math.round(list.reduce((a, b) => a + (b.score_total || 0), 0) / list.length);
  };

  const openContent = async (u) => {
    const text = await fetchChatContent(u.id);
    setViewContent({ name: `${u.uploader_name} · ${u.client_name}`, text });
  };

  const removeUpload = async (u) => {
    if (!window.confirm(`"${u.client_name}" (${u.uploader_name}) 업로드를 삭제할까요?`)) return;
    await deleteChatUpload(u.id);
    load();
  };

  return (
    <div>
      {/* 요약 카드 */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <SummaryCard label="이번 주 업로드" value={`${thisWeek.length}건`} color={C.ac} />
        <SummaryCard label="분석 대기" value={`${waiting.length}건`} color={waiting.length > 0 ? C.warn : C.ok} />
        <SummaryCard label="누적 분석" value={`${scores.length}건`} color={C.pur} />
      </div>

      {/* 대표도 업로드 가능 (담당 직원 지정) */}
      <UploadSection currentUser={currentUser} isAdmin={true} staff={staff} onDone={load} />

      {/* 직원별 제출 현황 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>직원별 현황 (최근 7일)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={th}>직원</th><th style={th}>이번 주 제출</th><th style={th}>최근 평균 점수</th></tr></thead>
          <tbody>
            {staff.map(u => {
              const cnt = thisWeek.filter(x => x.owner_id === u.id).length;
              const avg = staffAvg(u.id);
              return (
                <tr key={u.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{u.name}</td>
                  <td style={{ ...td, color: cnt > 0 ? C.ok : C.no, fontWeight: 600 }}>{cnt > 0 ? `${cnt}건 제출` : '미제출'}</td>
                  <td style={{ ...td, fontWeight: 800, color: avg == null ? C.txm : scoreColor(avg) }}>{avg == null ? '-' : `${avg}점`}</td>
                </tr>
              );
            })}
            {staff.length === 0 && <tr><td colSpan={3} style={{ ...td, color: C.txm }}>직원 계정이 없습니다. 설정에서 직원을 추가하세요.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* 대화 캘린더 (전 직원) */}
      <CalendarSection isAdmin={true} ownerId={null} uploads={uploads} staff={staff} />

      {/* 분석 결과 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>대화 품질 점수 (전체)</div>
        <ScoreTable scores={scores} showStaff={true} />
      </div>

      {/* 업로드 목록 */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>업로드 파일 관리</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>직원</th><th style={th}>광고주</th><th style={th}>분석 기간</th><th style={th}>상태</th><th style={th}></th></tr></thead>
            <tbody>
              {uploads.slice(0, 50).map(u => (
                <tr key={u.id}>
                  <td style={td}>{u.uploader_name}</td>
                  <td style={td}>{u.client_name}</td>
                  <td style={{ ...td, fontSize: 12, color: C.txd }}>{u.new_from} ~ {u.last_date}</td>
                  <td style={{ ...td, color: u.status === '완료' ? C.ok : C.warn, fontWeight: 600 }}>{u.status}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    <button style={btnGhost} onClick={() => openContent(u)}>원문</button>{' '}
                    <button style={{ ...btnGhost, color: C.no }} onClick={() => removeUpload(u)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 원문 모달 */}
      {viewContent && (
        <div onClick={() => setViewContent(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.bd}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{viewContent.name}</span>
              <button style={btnGhost} onClick={() => setViewContent(null)}>닫기</button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto', fontSize: 12, color: C.txd, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {viewContent.text || '(내용 없음)'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ ...card, marginBottom: 0, flex: '1 1 140px', minWidth: 140 }}>
      <div style={{ fontSize: 12, color: C.txd }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ─── 메인 ───
export default function Conversations({ currentUser }) {
  const isAdmin = currentUser?.role === 'admin';
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>대화 분석</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 16 }}>
        {isAdmin ? '대화 업로드와 직원들의 광고주 대화 품질을 확인합니다' : '광고주 카톡 대화를 올리면 대화 품질 점수를 받아볼 수 있습니다'}
      </div>
      {isAdmin ? <AdminView currentUser={currentUser} /> : <StaffView currentUser={currentUser} />}
    </div>
  );
}
