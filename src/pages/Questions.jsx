// ============================================
// AI 질문 (부사수 Y/N)
//   AI가 광고 데이터를 보고 만든 질문에 Y/N 으로만 답하는 화면.
//   답은 저장소(attachments/ai/questions.json)에 기록되고,
//   AI가 다음 질문을 만들 때 읽어 같은 질문을 반복하지 않습니다.
//   담당 직원은 자기 브랜드 질문만 보입니다 (allowedBrands).
// ============================================

import React, { useState, useEffect, useCallback } from 'react';
import { C } from '../config';
import { sb } from '../store';

const PATH = 'ai/questions.json';

async function loadQuestions() {
  if (!sb) return null;
  const { data } = sb.storage.from('attachments').getPublicUrl(PATH);
  try {
    const r = await fetch(data.publicUrl + '?t=' + Date.now());
    if (!r.ok) return { questions: [] };
    return await r.json();
  } catch { return { questions: [] }; }
}

async function saveQuestions(doc) {
  if (!sb) return false;
  const blob = new Blob([JSON.stringify(doc, null, 1)], { type: 'application/json' });
  // 저장소 정책상 '수정'이 막혀 있어 지우고 새로 올립니다 (updater.py와 같은 방식)
  try { await sb.storage.from('attachments').remove([PATH]); } catch { /* ignore */ }
  const { error } = await sb.storage.from('attachments').upload(PATH, blob, { contentType: 'application/json', upsert: true });
  if (error) { console.error('[AI질문] 저장 실패:', error.message); return false; }
  return true;
}

const TYPE_BADGE = {
  '매체설정': { bg: '#7c3aed22', fg: '#a78bfa' },
  '전환없음': { bg: '#dc262622', fg: '#f87171' },
  'CPA적자': { bg: '#ea580c22', fg: '#fb923c' },
  '저효율':   { bg: '#ca8a0422', fg: '#facc15' },
  '증액':     { bg: '#16a34a22', fg: '#4ade80' },
};

export default function Questions({ currentUser, allowedBrands }) {
  const [doc, setDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState({});          // qid → 입력 중인 이유
  const [showDone, setShowDone] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadQuestions().then(setDoc); }, []);

  const patch = useCallback(async (qid, fields, okMsg) => {
    if (!doc || saving) return;
    setSaving(true);
    const fresh = await loadQuestions();            // 다른 사람 답과 충돌 방지: 저장 직전 다시 읽음
    const base = fresh && fresh.questions ? fresh : doc;
    const qs = base.questions.map(q => q.id === qid ? { ...q, ...fields } : q);
    const next = { ...base, questions: qs, updated_at: new Date().toISOString() };
    const ok = await saveQuestions(next);
    if (ok) { setDoc(next); setMsg(okMsg); setTimeout(() => setMsg(''), 1500); }
    else setMsg('저장 실패 — 잠시 후 다시 눌러주세요');
    setSaving(false);
  }, [doc, saving]);

  const answer = (qid, yn) => patch(qid, {
    answer: yn, note: (notes[qid] || '').trim() || '',
    answered_by: currentUser?.name || '', answered_at: new Date().toISOString(),
  }, '저장됨');

  const markDone = (qid) => patch(qid, {
    executed_by: currentUser?.name || '', executed_at: new Date().toISOString(),
  }, '실행 기록됨');

  if (!doc) return <div style={{ color: C.txd, padding: 30 }}>질문을 불러오는 중...</div>;

  const isAdmin = currentUser?.role === 'admin';
  const mine = (doc.questions || []).filter(q =>
    isAdmin || !allowedBrands || allowedBrands.length === 0 || allowedBrands.includes(q.brand));
  const open = mine.filter(q => !q.answer);
  const todo = mine.filter(q => q.answer === 'Y' && !q.executed_at);   // Y인데 아직 실행 안 함
  const done = mine.filter(q => q.answer && !(q.answer === 'Y' && !q.executed_at));
  const list = showDone === 'done' ? done : showDone === 'todo' ? todo : open;

  const brands = [...new Set(open.map(q => q.brand))];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0 }}>🙋 AI 질문</h2>
        <span style={{ fontSize: 12, color: C.txd }}>Y/N만 눌러주시면 됩니다</span>
        {msg && <span style={{ fontSize: 12, color: msg.includes('실패') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
      <div style={{ fontSize: 11, color: C.txm, marginBottom: 14, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {[['open', `질문 ${open.length}`], ['todo', `실행 대기 ${todo.length}`], ['done', `완료 ${done.length}`]].map(([k, lb]) => (
          <button key={k} onClick={() => setShowDone(k)} style={{
            background: (showDone === k || (!showDone && k === 'open')) ? C.ac + '22' : 'none',
            border: `1px solid ${(showDone === k || (!showDone && k === 'open')) ? C.ac : C.bd}`,
            borderRadius: 6, padding: '3px 10px',
            color: (showDone === k || (!showDone && k === 'open')) ? C.ac : C.txd,
            cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>{lb}</button>
        ))}
        <span>{doc.generated_at ? `· 생성 ${String(doc.generated_at).slice(0, 10)}` : ''}{brands.length > 0 && <> · {brands.join(' · ')}</>}</span>
      </div>

      {list.length === 0 && (
        <div style={{ color: C.txd, padding: '40px 0', textAlign: 'center' }}>
          {showDone === 'done' ? '아직 완료된 항목이 없습니다.'
            : showDone === 'todo' ? 'Y 답변 중 실행을 기다리는 항목이 없습니다.'
            : '남은 질문이 없습니다. 수고하셨습니다! 🎉'}
        </div>
      )}

      {list.map(q => {
        const badge = TYPE_BADGE[q.qtype] || { bg: C.ac + '22', fg: C.ac };
        return (
          <div key={q.id} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: badge.bg, color: badge.fg, fontWeight: 600 }}>{q.qtype}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{q.brand}</span>
              <span style={{ fontSize: 11, color: C.txd }}>{q.media} · {q.campaign} · {q.adgroup}</span>
            </div>
            <div style={{ fontSize: 13, color: C.tx, marginBottom: 4 }}>{q.q}</div>
            {q.metrics && (
              <div style={{ fontSize: 11, color: C.txd, marginBottom: 8 }}>{q.metrics}</div>
            )}
            {!q.answer ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button disabled={saving} onClick={() => answer(q.id, 'Y')}
                  style={{ padding: '7px 26px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>Y</button>
                <button disabled={saving} onClick={() => answer(q.id, 'N')}
                  style={{ padding: '7px 26px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>N</button>
                <input placeholder="이유 (선택, 한 단어면 충분)" value={notes[q.id] || ''}
                  onChange={e => setNotes({ ...notes, [q.id]: e.target.value })}
                  style={{ flex: 1, minWidth: 140, background: C.bg, border: `1px solid ${C.bd}`, borderRadius: 7, padding: '7px 10px', color: C.tx, fontSize: 12 }} />
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: C.txd }}>
                  <b style={{ color: q.answer === 'Y' ? '#4ade80' : '#f87171', fontSize: 14 }}>{q.answer}</b>
                  {q.note && <> · {q.note}</>}
                  {q.answered_by && <> · {q.answered_by}</>}
                  {q.answered_at && <> · {String(q.answered_at).slice(5, 10)}</>}
                </div>
                {q.answer === 'Y' && !q.executed_at && (
                  <button disabled={saving} onClick={() => markDone(q.id)}
                    style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: '#ea580c', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                    광고시스템에 반영했습니다 ✓
                  </button>
                )}
                {q.executed_at && (
                  <span style={{ fontSize: 11, color: '#4ade80' }}>
                    ✅ 실행됨 · {q.executed_by} · {String(q.executed_at).slice(5, 10)}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
