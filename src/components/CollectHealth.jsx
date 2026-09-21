// ============================================
// 수집 상태 경고 띠  (2026-09-21)
//
// 왜 만들었나:
//   2026-09-18 새벽부터 네이버 로그인이 풀려 광고 수집이 나흘간 멈췄습니다.
//   알림은 울렸지만 홈의 '오늘 챙길 것' 15건 속에 묻혀 아무도 못 봤고,
//   그동안 대시보드·리포트·하락진단이 전부 9/16 숫자를 보고 있었습니다.
//
//   수집이 멈추면 화면의 모든 숫자가 거짓이 됩니다. 그래서 이 경고만은
//   홈이 아니라 '모든 화면 맨 위'에 뜨고, 닫을 수 없게 만들었습니다.
// ============================================

import React, { useState, useEffect } from 'react';
import { C } from '../config';
import { sb } from '../store';

const CACHE_KEY = 'oha_collect_health';
const CACHE_MIN = 10;                       // 10분간은 다시 묻지 않음

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

async function maxDate(table) {
  if (!sb) return null;
  const { data, error } = await sb.from(table).select('date').order('date', { ascending: false }).limit(1);
  if (error || !data || !data.length) return null;
  return data[0].date;
}

export default function CollectHealth({ isAdmin }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      // 최근에 확인했으면 그 결과를 그대로 쓴다
      try {
        const c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (c && Date.now() - c.at < CACHE_MIN * 60 * 1000) { setInfo(c.v); return; }
      } catch { /* 무시 */ }

      let v = null;
      try {
        const [rawLatest, dailyLatest] = await Promise.all([maxDate('ad_data'), maxDate('ad_daily')]);
        if (rawLatest) {
          const now = new Date();
          // 어제치는 새벽 4시 30분 수집이 끝나야 들어온다. 오전 7시 전에는 그저께까지만 기대한다.
          const expected = now.getHours() < 7 ? addDays(ymd(now), -2) : addDays(ymd(now), -1);
          const behind = diffDays(rawLatest, expected);        // 며칠 밀렸나
          if (behind > 0) {
            v = { kind: 'stopped', days: behind, last: rawLatest };
          } else if (dailyLatest && diffDays(dailyLatest, rawLatest) > 0) {
            v = { kind: 'lag', last: dailyLatest, raw: rawLatest };
          }
        }
      } catch { /* 조회 실패 시엔 아무것도 띄우지 않는다 — 괜한 공포는 금물 */ }

      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), v })); } catch { /* 무시 */ }
      if (alive) setInfo(v);
    })();
    return () => { alive = false; };
  }, []);

  if (!info) return null;

  const stopped = info.kind === 'stopped';
  const severe = stopped && info.days >= 2;
  const bd = severe ? C.no : C.warn;

  return (
    <div style={{
      border: `1px solid ${bd}`,
      background: severe ? 'rgba(240,112,112,0.10)' : 'rgba(245,164,69,0.10)',
      borderLeft: `5px solid ${bd}`,
      borderRadius: 10,
      padding: '13px 16px',
      marginBottom: 16,
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{ fontSize: 20, lineHeight: 1.2 }}>{severe ? '🚨' : '⚠️'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {stopped ? (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: bd }}>
              광고 데이터 수집이 {info.days}일째 멈춰 있습니다
            </div>
            <div style={{ fontSize: 12.5, color: C.txd, marginTop: 5, lineHeight: 1.7 }}>
              마지막으로 들어온 날짜는 <b style={{ color: C.tx }}>{info.last}</b> 입니다.
              이 화면을 포함해 성과·리포트·하락진단의 숫자는 그 이후로 <b style={{ color: C.tx }}>갱신되지 않았습니다.</b>
              {' '}지금 보이는 값으로 판단하지 마세요.
            </div>
            {isAdmin && (
              <div style={{ fontSize: 12, color: C.txd, marginTop: 8, lineHeight: 1.8 }}>
                <b style={{ color: C.tx }}>복구 방법</b> — 바탕화면 <code style={codeSt}>보고서수집</code> 폴더에서
                <br />
                1. <code style={codeSt}>2_네이버로그인.bat</code> 실행 → 네이버 로그인
                {' '}(<b style={{ color: bd }}>"로그인 상태 유지" 체크 필수</b>)
                <br />
                2. {info.days >= 2
                  ? <>빠진 날짜가 여러 날이므로 <b style={{ color: C.tx }}>백필</b>이 필요합니다. 클로드에게 “{info.last} 이후 결측 복구”라고 알려주세요.</>
                  : <>다음 새벽 04:30 자동수집에서 저절로 채워집니다.</>}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 800, color: bd }}>
              집계가 아직 갱신되지 않았습니다
            </div>
            <div style={{ fontSize: 12.5, color: C.txd, marginTop: 5, lineHeight: 1.7 }}>
              원본 데이터는 <b style={{ color: C.tx }}>{info.raw}</b>까지 들어왔지만,
              화면이 쓰는 집계는 <b style={{ color: C.tx }}>{info.last}</b>에 멈춰 있습니다.
              보통 5분 안에 저절로 맞춰집니다. 계속 이 상태면 클로드에게 알려주세요.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const codeSt = {
  background: C.sf2, border: `1px solid ${C.bd}`, borderRadius: 4,
  padding: '1px 5px', fontSize: 11.5, color: C.tx,
};
