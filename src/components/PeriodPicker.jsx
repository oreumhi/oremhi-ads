// ============================================
// 공용 기간 지정 (시작일 → 종료일 + 적용/해제)
//   여러 페이지에서 같은 모양·같은 동작으로 사용.
// ============================================

import React, { useState, useEffect } from 'react';
import { C } from '../config';
import { fmtNum } from '../utils';

export default function PeriodPicker({ value, onApply, onClear }) {
  const [from, setFrom] = useState(value?.from || '');
  const [to, setTo] = useState(value?.to || '');
  useEffect(() => { setFrom(value?.from || ''); setTo(value?.to || ''); }, [value]);
  const inp = { background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 7, padding: '6px 8px', color: C.tx, fontSize: 12, colorScheme: 'dark', outline: 'none' };
  const ok = from && to && from <= to;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
      <span style={{ color: C.txm, fontSize: 12 }}>→</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
      <button disabled={!ok} onClick={() => ok && onApply(from, to)} style={{
        background: ok ? C.ac : C.sf3, border: 'none', borderRadius: 7, padding: '7px 14px',
        color: ok ? '#fff' : C.txm, fontSize: 12, fontWeight: 700, cursor: ok ? 'pointer' : 'default',
      }}>적용</button>
      {value && onClear && (
        <button onClick={onClear} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 7, padding: '6px 11px', color: C.txd, fontSize: 12, cursor: 'pointer' }}>해제</button>
      )}
    </div>
  );
}

// 네이버 성과지표 스타일 요약 카드 (블랙 버전)
export function NaverCards({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 14 }}>
      {items.map(it => (
        <div key={it.label} style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: '14px 17px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.txd, fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: it.color }} />{it.label}
          </div>
          <div style={{ fontSize: 23, fontWeight: 800, color: it.color, marginTop: 7, letterSpacing: -0.5 }}>
            {typeof it.value === 'number' ? fmtNum(Math.round(it.value)) : it.value}{it.unit || ''}
          </div>
          {it.sub && <div style={{ fontSize: 10.5, color: C.txm, marginTop: 4 }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}
