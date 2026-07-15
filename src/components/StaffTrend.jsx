// ============================================
// 직원별 대화 품질 추세 (대화 분석 심화)
//   chat_scores 이력으로 직원별 점수 추세·최근 평균·방향·가장 약한 항목(개선 포인트)을 표시.
// ============================================

import React, { useMemo } from 'react';
import { C } from '../config';

const DIMS = [
  { key: 'score_call', label: '통화 적극성', max: 25 },
  { key: 'score_diagnosis', label: '진단력', max: 20 },
  { key: 'score_proposal', label: '제안력', max: 20 },
  { key: 'score_question', label: '질문·유도', max: 20 },
  { key: 'score_response', label: '광고주 반응', max: 10 },
  { key: 'score_proactive', label: '선제성', max: 5 },
];
const scoreColor = (s) => (s >= 70 ? C.ok : s >= 45 ? C.warn : C.no);

function Spark({ vals, color }) {
  if (vals.length < 2) return <span style={{ fontSize: 11, color: C.txm }}>이력 부족</span>;
  const W = 120, H = 34, mn = Math.min(...vals, 0), mx = Math.max(...vals, 100);
  const x = (i) => (i / (vals.length - 1)) * (W - 4) + 2;
  const y = (v) => H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="3" fill={color} />
    </svg>
  );
}

export default function StaffTrend({ scores, staff }) {
  const perStaff = useMemo(() => {
    return (staff || []).map(u => {
      const list = scores.filter(s => s.owner_id === u.id)
        .slice().sort((a, b) => (a.period_end || '').localeCompare(b.period_end || ''));
      const hist = list.map(s => s.score_total || 0);
      const latest = hist.length ? hist[hist.length - 1] : null;
      const prev = hist.length > 1 ? hist[hist.length - 2] : null;
      // 평균 약점 항목 (최근 4건)
      const recent = list.slice(-4);
      let weakest = null, weakestRatio = 2;
      if (recent.length) {
        DIMS.forEach(d => {
          const avg = recent.reduce((a, s) => a + (s[d.key] || 0), 0) / recent.length;
          const ratio = avg / d.max;
          if (ratio < weakestRatio) { weakestRatio = ratio; weakest = d.label; }
        });
      }
      return { u, hist, latest, prev, count: list.length, weakest, weakestPct: Math.round(weakestRatio * 100) };
    });
  }, [scores, staff]);

  const card = { background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 18, marginBottom: 16 };

  return (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>직원별 대화 품질 추세</div>
      <div style={{ fontSize: 12, color: C.txd, marginBottom: 12 }}>분석 이력이 쌓일수록 추세가 정확해집니다. 가장 약한 항목은 코칭 포인트로 활용하세요.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
        {perStaff.map(({ u, hist, latest, prev, count, weakest, weakestPct }) => {
          const diff = (latest != null && prev != null) ? latest - prev : null;
          return (
            <div key={u.id} style={{ background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</span>
                <span style={{ fontSize: 11, color: C.txm }}>분석 {count}회</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: latest == null ? C.txm : scoreColor(latest) }}>{latest == null ? '-' : latest}</span>
                <span style={{ fontSize: 11, color: C.txd, marginBottom: 4 }}>점</span>
                {diff != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: diff >= 0 ? C.ok : C.no }}>
                    {diff >= 0 ? '▲' : '▼'} {Math.abs(diff)}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8 }}><Spark vals={hist} color={scoreColor(latest || 0)} /></div>
              {weakest && (
                <div style={{ marginTop: 8, fontSize: 11.5, color: C.txd }}>
                  개선 포인트: <span style={{ color: C.warn, fontWeight: 700 }}>{weakest}</span> <span style={{ color: C.txm }}>({weakestPct}%)</span>
                </div>
              )}
            </div>
          );
        })}
        {perStaff.length === 0 && <div style={{ fontSize: 13, color: C.txm }}>직원 계정이 없습니다.</div>}
      </div>
    </div>
  );
}
