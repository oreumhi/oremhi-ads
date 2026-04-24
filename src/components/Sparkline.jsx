// ============================================
// 스파크라인 차트 컴포넌트 (성능 최적화)
// - React.memo로 불필요한 리렌더 방지
// - Math.min/max 대신 reduce 사용 (대량 데이터 안전)
// ============================================

import React from 'react';

export const Sparkline = React.memo(function Sparkline({ data, color = '#5b8def', width = 110, height = 28 }) {
  if (!data || data.length < 2) {
    return <span style={{ color: '#555c74', fontSize: 11 }}>-</span>;
  }

  const vals = data.map(d => (typeof d === 'number' ? d : d.value || 0));

  // reduce 사용 (spread 연산자는 대량 배열에서 stack overflow 가능)
  let min = vals[0], max = vals[0];
  for (let i = 1; i < vals.length; i++) {
    if (vals[i] < min) min = vals[i];
    if (vals[i] > max) max = vals[i];
  }
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
});
