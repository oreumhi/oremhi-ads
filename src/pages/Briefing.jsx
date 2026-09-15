// ============================================
// 클로드 자료 만들기  (2026-09-15)
//
// 직원이 담당 브랜드와 기간을 고르고 버튼을 누르면,
// 클로드에 그대로 붙여넣을 수 있는 성과 자료가 만들어진다.
//
// 보이는 브랜드는 allowedBrands(담당 브랜드)로 제한된다.
// 관리자는 전부 보인다.
// ============================================

import React, { useState, useMemo } from 'react';
import { C } from '../config';
import { buildBriefing } from '../briefing';

const PERIODS = [
  { label: '7일', days: 7 },
  { label: '14일', days: 14 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
];

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Briefing({ data, allowedBrands, currentUser, changeRange, rangeLoading }) {
  const { adData = [], mappings = [] } = data || {};

  const brands = useMemo(() => {
    const set = new Set();
    mappings.forEach((m) => { if (m.brand) set.add(m.brand); });
    let list = [...set].sort();
    if (allowedBrands) list = list.filter((b) => allowedBrands.includes(b));
    return list;
  }, [mappings, allowedBrands]);

  const [brand, setBrand] = useState(() => (allowedBrands && allowedBrands.length === 1 ? allowedBrands[0] : ''));
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const to = ymd(new Date());
  const from = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1));
    return ymd(d);
  }, [days]);

  const pickPeriod = async (d) => {
    setDays(d); setText(''); setErr('');
    if (changeRange) { try { await changeRange(d); } catch { /* 화면은 그대로 두고 진행 */ } }
  };

  const make = async () => {
    if (!brand) { setErr('브랜드를 먼저 고르세요.'); return; }
    setBusy(true); setErr(''); setText(''); setCopied(false);
    try {
      const t = await buildBriefing({
        brand, adData, mappings, from, to,
        viewerName: currentUser ? currentUser.name : '',
      });
      setText(t);
    } catch (e) {
      setErr('자료를 만들지 못했습니다: ' + String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
    } catch {
      const el = document.getElementById('briefing-text');
      if (!el) return;
      el.focus(); el.select();
      try {
        document.execCommand('copy');
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      } catch {
        setErr('자동 복사가 막혀 있습니다. 아래 글상자를 클릭하고 Ctrl+A → Ctrl+C 로 복사해 주세요.');
      }
    }
  };

  const download = () => {
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${brand}_광고자료_${from}_${to}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const chip = (label, active, onClick) => (
    <button key={label} onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
      fontWeight: active ? 700 : 400,
      background: active ? C.ac : C.sf,
      color: active ? '#fff' : C.txd,
      border: `1px solid ${active ? C.ac : C.bd}`,
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>클로드 자료 만들기</h2>
        <div style={{ fontSize: 13, color: C.txd, marginTop: 4, lineHeight: 1.7 }}>
          담당 브랜드의 성과 자료를 한 덩어리 글로 만들어 드립니다.
          복사해서 클로드에 붙여넣으면 그 브랜드에 대해 바로 물어볼 수 있습니다.
        </div>
      </div>

      {/* 1단계 — 브랜드 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>1. 브랜드 고르기</div>
        {brands.length === 0 ? (
          <div style={{ fontSize: 13, color: C.txd }}>보여드릴 브랜드가 없습니다. 담당 브랜드가 지정되어 있는지 설정에서 확인해 주세요.</div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {brands.map((b) => chip(b, brand === b, () => { setBrand(b); setText(''); setErr(''); }))}
          </div>
        )}
      </div>

      {/* 2단계 — 기간 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16, marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          2. 기간 고르기
          <span style={{ fontWeight: 400, color: C.txm, marginLeft: 8, fontSize: 12 }}>{from} ~ {to}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {PERIODS.map((p) => chip(p.label, days === p.days, () => pickPeriod(p.days)))}
          {rangeLoading && <span style={{ fontSize: 12, color: C.txd, marginLeft: 6 }}>불러오는 중…</span>}
        </div>
      </div>

      {/* 3단계 — 만들기 */}
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>3. 자료 만들기</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={make} disabled={busy || !brand} style={{
            padding: '10px 20px', borderRadius: 9, border: 'none',
            cursor: busy || !brand ? 'default' : 'pointer',
            fontSize: 14, fontWeight: 700,
            background: busy || !brand ? C.bd : C.ac,
            color: busy || !brand ? C.txm : '#fff',
          }}>{busy ? '모으는 중…' : '자료 만들기'}</button>

          {text && (
            <>
              <button onClick={copy} style={{
                padding: '10px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, background: copied ? C.ok : C.sf3, color: '#fff',
              }}>{copied ? '복사됨 ✓' : '복사하기'}</button>
              <button onClick={download} style={{
                padding: '10px 18px', borderRadius: 9, cursor: 'pointer',
                fontSize: 13, fontWeight: 500, background: C.sf, color: C.txd,
                border: `1px solid ${C.bd}`,
              }}>파일로 저장</button>
              <span style={{ fontSize: 12, color: C.txm }}>약 {text.length.toLocaleString('ko-KR')}자</span>
            </>
          )}
        </div>

        {err && <div style={{ fontSize: 13, color: C.no, marginTop: 12, lineHeight: 1.7 }}>{err}</div>}

        {text && (
          <>
            <ol style={{ fontSize: 13, color: C.txd, lineHeight: 1.9, margin: '14px 0 10px', paddingLeft: 20 }}>
              <li><b>복사하기</b>를 누르세요.</li>
              <li>클로드를 열고 붙여넣으세요. (웹이든 앱이든 상관없습니다)</li>
              <li>그 아래에 궁금한 걸 그냥 물어보세요. 예: “지금 제일 문제인 시간대가 어디야?”</li>
            </ol>
            <textarea
              id="briefing-text"
              readOnly
              value={text}
              onFocus={(e) => e.target.select()}
              style={{
                width: '100%', height: 340, fontSize: 12, lineHeight: 1.55,
                fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                padding: 12, borderRadius: 10, border: `1px solid ${C.bd}`,
                background: C.bg, color: C.tx, resize: 'vertical', boxSizing: 'border-box',
              }} />
          </>
        )}
      </div>
    </div>
  );
}
