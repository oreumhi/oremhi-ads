// ============================================
// 오늘 챙길 것 (이상 감지 알림)
//   최근 7일 vs 직전 7일을 브랜드별로 비교해
//   ROAS 급락 · 전환 급감 · 광고비 급증(효율저하) · 노출 중단(광고 꺼짐 의심)을 자동 감지.
//   종합 요약 상단에 표시.
// ============================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { C } from '../config';
import { fetchAdDaily } from '../store';
import { fetchTodayPromises, fetchOpenPerfAlerts } from '../team';
import { fmtWon, fmtNum } from '../utils';

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const won = (n) => '₩' + fmtNum(Math.round(n || 0));
const growth = (cur, prev) => (prev > 0 ? (cur - prev) / prev * 100 : (cur > 0 ? 100 : 0));
const sumM = (rows) => rows.reduce((a, r) => ({
  impressions: a.impressions + (+r.impressions || 0), clicks: a.clicks + (+r.clicks || 0),
  cost: a.cost + (+r.cost || 0), conversions: a.conversions + (+r.conversions || 0),
  revenue: a.revenue + (+(r.revenue ?? r.conv_revenue) || 0),
}), { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const roasOf = (m) => m.cost > 0 ? m.revenue / m.cost * 100 : 0;

export default function TodayAlerts({ currentUser, allowedBrands }) {
  const isAdmin = currentUser?.role === 'admin';
  const [adData, setAdData] = useState([]);
  const [promises, setPromises] = useState([]);
  const [perfAlerts, setPerfAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [ad, pr, pf] = await Promise.all([
      fetchAdDaily(16, isAdmin ? null : currentUser.id),   // 서버 집계 테이블 (고속)
      fetchTodayPromises(ymd(new Date())),
      fetchOpenPerfAlerts(),
    ]);
    setAdData(ad); setPromises(pr); setPerfAlerts(pf); setLoading(false);
  }, [isAdmin, currentUser]);
  useEffect(() => { load(); }, [load]);

  const alerts = useMemo(() => {
    if (!adData.length) return [];
    const today = ymd(new Date());
    const rEnd = addDays(today, -1), rStart = addDays(today, -7);          // 최근 7일 (어제까지)
    const pEnd = addDays(today, -8), pStart = addDays(today, -14);          // 직전 7일
    const last2 = addDays(today, -2);                                       // 최근 2일 시작

    // 브랜드별 집계 (ad_daily는 이미 브랜드 단위로 집계되어 있음)
    const byBrand = {};
    adData.forEach(r => {
      if (allowedBrands && !allowedBrands.includes(r.brand)) return;
      const b = (byBrand[r.brand] = byBrand[r.brand] || { recent: [], prev: [], recentDaily: {} });
      if (r.date >= rStart && r.date <= rEnd) b.recent.push(r);
      if (r.date >= pStart && r.date <= pEnd) b.prev.push(r);
      if (r.date >= last2 && r.date <= rEnd) b.recentDaily[r.date] = (b.recentDaily[r.date] || 0) + (+r.impressions || 0);
    });

    const out = [];
    Object.entries(byBrand).forEach(([brand, d]) => {
      const rec = sumM(d.recent), prev = sumM(d.prev);
      if (rec.cost < 1000 && prev.cost < 1000) return;   // 거의 집행 안 한 브랜드 제외
      const rRoas = roasOf(rec), pRoas = roasOf(prev);

      // 1) 노출 중단(광고 꺼짐 의심): 직전엔 노출 많았는데 최근 2일 노출 거의 0
      const recent2Imp = Object.values(d.recentDaily).reduce((a, b) => a + b, 0);
      const prevDailyAvg = prev.impressions / 7;
      if (prevDailyAvg > 500 && recent2Imp < prevDailyAvg * 0.2) {
        out.push({ sev: 'high', brand, title: '노출 급감 — 광고 중단 의심', desc: `최근 노출이 이전 평균의 20% 미만입니다.`, action: '광고 ON/OFF·예산·소재 상태를 확인하세요.' });
        return; // 노출이 끊겼으면 다른 지표는 의미 없음
      }
      // 2) ROAS 급락
      if (pRoas > 50 && rec.cost > 30000 && rRoas < pRoas * 0.7) {
        out.push({ sev: 'high', brand, title: 'ROAS 하락', desc: `ROAS ${(pRoas / 100).toFixed(2)}배 → ${(rRoas / 100).toFixed(2)}배 (${growth(rRoas, pRoas).toFixed(0)}%)`, action: '효율 낮은 소재·키워드 점검, 입찰/타겟 조정을 검토하세요.' });
      }
      // 3) 전환 급감 (광고비는 유지/증가인데 전환만 감소)
      if (prev.conversions >= 3 && rec.conversions <= prev.conversions * 0.6 && rec.cost >= prev.cost * 0.8) {
        out.push({ sev: 'high', brand, title: '전환 급감', desc: `전환 ${fmtNum(prev.conversions)}건 → ${fmtNum(rec.conversions)}건 (${growth(rec.conversions, prev.conversions).toFixed(0)}%), 광고비는 유지`, action: '랜딩/품절/전환추적 상태와 소재 반응을 확인하세요.' });
      }
      // 4) 광고비 급증인데 효율 저하
      if (prev.cost > 30000 && rec.cost >= prev.cost * 1.4 && growth(rec.conversions, prev.conversions) < growth(rec.cost, prev.cost) / 2) {
        out.push({ sev: 'mid', brand, title: '광고비 급증 · 효율 저하', desc: `광고비 ${won(prev.cost)} → ${won(rec.cost)} (+${growth(rec.cost, prev.cost).toFixed(0)}%)인데 전환 증가는 못 따라옴`, action: '예산 급증 원인 확인, 성과 낮은 구간 예산 재배분을 검토하세요.' });
      }
    });
    // 위험(high) 먼저
    return out.sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'high' ? -1 : 1));
  }, [adData, allowedBrands]);

  const high = alerts.filter(a => a.sev === 'high').length;
  const sevColor = (s) => s === 'high' ? C.no : C.warn;

  return (
    <div style={{ background: C.sf, border: `1px solid ${alerts.length ? (high ? C.no : C.warn) + '66' : C.bd}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>🔔 오늘 챙길 것</span>
          {loading ? <span style={{ fontSize: 12, color: C.txd }}>확인 중…</span> :
            (alerts.length + promises.length + perfAlerts.length) === 0 ? <span style={{ fontSize: 12, color: C.ok }}>이상 없음</span> :
              <span style={{ fontSize: 12, fontWeight: 700, color: (high || perfAlerts.some(p => p.severity === 'alert')) ? C.no : C.warn }}>
                {alerts.length + perfAlerts.length}건{promises.length ? ` · 오늘 약속 ${promises.length}건` : ''}</span>}
        </div>
        <span style={{ fontSize: 12, color: C.txd }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && !loading && (
        <div style={{ marginTop: 12 }}>
          {promises.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.yel, marginBottom: 6 }}>📞 오늘 연락드리기로 한 약속 ({promises.length}건)</div>
              {promises.map(p => (
                <div key={p.id} style={{ background: 'rgba(240,199,70,0.08)', border: '1px solid rgba(240,199,70,0.35)', borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>[{p.brand}] {p.title}</div>
                  <div style={{ fontSize: 12, color: C.txd, marginTop: 2, whiteSpace: 'pre-wrap' }}>{(p.memo || '').split('\n').slice(-1)[0]}</div>
                </div>
              ))}
            </div>
          )}
          {perfAlerts.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.pink, marginBottom: 6 }}>📉 성과 경고 — 조치 필요 ({perfAlerts.length}건, 팀 업무→캘린더에서 조치 입력)</div>
              {perfAlerts.map(p => (
                <div key={p.id} style={{ background: 'rgba(237,110,160,0.08)', border: '1px solid rgba(237,110,160,0.35)', borderRadius: 10, padding: '8px 12px', marginBottom: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{p.severity === 'alert' ? '🚨' : '⚠'} {p.title}</div>
                  <div style={{ fontSize: 12, color: C.txd, marginTop: 2 }}>{p.memo}</div>
                </div>
              ))}
            </div>
          )}
          {alerts.length === 0 ? (
            <div style={{ fontSize: 13, color: C.txd }}>최근 7일 기준 특별히 챙길 이상 신호가 없습니다. 좋은 흐름입니다. 👍</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, background: sevColor(a.sev) + '12', border: `1px solid ${sevColor(a.sev)}44`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 16, lineHeight: 1.2 }}>{a.sev === 'high' ? '🔴' : '🟡'}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      <span style={{ color: sevColor(a.sev) }}>[{a.brand}]</span> {a.title}
                    </div>
                    <div style={{ fontSize: 12.5, color: C.txd, marginTop: 3 }}>{a.desc}</div>
                    <div style={{ fontSize: 12, color: C.tx, marginTop: 4 }}>👉 {a.action}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: C.txm, marginTop: 10 }}>최근 7일 vs 직전 7일 비교 기준 · 매일 수집 데이터 반영</div>
        </div>
      )}
    </div>
  );
}
