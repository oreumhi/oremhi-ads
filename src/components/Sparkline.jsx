// ============================================
// 스파크라인 차트 컴포넌트
// 수정: 0%일 때 흰색(회색) 표시
// ============================================

import React from 'react';

export function Sparkline({ data, color = '#5b8def', width = 110, height = 28 }) {
  if (!data || data.length < 2) {
    return <span style={{ color: '#555c74', fontSize: 11 }}>-</span>;
  }

  const vals = data.map(d => (typeof d === 'number' ? d : d.value || 0));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const points = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(' ');

  const first = vals[0] || 0;
  const last = vals[vals.length - 1] || 0;
  const trend = first > 0 ? ((last - first) / first * 100) : 0;
  const trendPct = Math.abs(trend).toFixed(0);

  // 0%면 회색, 양수면 초록, 음수면 빨강
  const trendColor = Number(trendPct) === 0 ? '#8890a6' : (trend > 0 ? '#3dd9a0' : '#f07070');
  const arrow = Number(trendPct) === 0 ? '' : (trend > 0 ? '▲' : '▼');

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <svg width={width} height={height} style={{ display: 'block', flexShrink: 0 }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span style={{
        fontSize: 10, fontWeight: 600, color: trendColor,
        minWidth: 32, textAlign: 'right',
      }}>
        {arrow}{trendPct}%
      </span>
    </div>
  );
}
