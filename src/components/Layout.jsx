// ============================================
// 레이아웃 (사이드바 + 반응형 + 사용자 정보)
// ============================================

import React, { useState, useEffect } from 'react';
import { C, TABS } from '../config';
import { hasSB } from '../store';

export function Layout({ tab, setTab, currentUser, onLogout, children }) {
  const [mobile, setMobile] = useState(false);
  const [menuOpen, setMenu] = useState(false);

  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check(); window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const go = (id) => { setTab(id); setMenu(false); };

  const roleName = currentUser?.role === 'admin' ? '관리자' : '직원';

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.tx, fontFamily: "'Noto Sans KR',-apple-system,sans-serif", fontSize: 14 }}>
      {/* 모바일 상단바 */}
      {mobile && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 50, background: C.sf, borderBottom: `1px solid ${C.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', zIndex: 20 }}>
          <button onClick={() => setMenu(!menuOpen)} style={{ background: 'none', border: 'none', color: C.tx, fontSize: 20, cursor: 'pointer' }}>{menuOpen ? '✕' : '☰'}</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.ac }}>오름히 광고대시보드</span>
          <div style={{ width: 28 }} />
        </div>
      )}

      {/* 오버레이 */}
      {mobile && menuOpen && <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 25 }} />}

      {/* 사이드바 */}
      <div style={{ width: 200, background: C.sf, borderRight: `1px solid ${C.bd}`, position: 'fixed', top: 0, left: mobile ? (menuOpen ? 0 : -200) : 0, bottom: 0, display: 'flex', flexDirection: 'column', zIndex: 30, transition: mobile ? 'left 0.25s' : 'none' }}>
        <div style={{ padding: '18px 14px 12px', borderBottom: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.ac }}>주식회사 오름히</div>
          <div style={{ fontSize: 10, color: C.txd, marginTop: 2 }}>광고 성과 대시보드</div>
        </div>

        {/* 탭 메뉴 */}
        <div style={{ padding: '10px 6px', flex: 1 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => go(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '10px 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 13, marginBottom: 2,
              fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? C.ac + '18' : 'transparent',
              color: tab === t.id ? C.ac : C.txd,
            }}>
              <span style={{ fontSize: 15 }}>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* 사용자 정보 + 로그아웃 */}
        <div style={{ padding: '10px 12px', borderTop: `1px solid ${C.bd}` }}>
          {currentUser && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: C.txd }}>{roleName} · {currentUser.username}</div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: C.txm }}>💾 {hasSB ? '☁️ 클라우드' : '📱 로컬'}</span>
            {onLogout && (
              <button onClick={onLogout} style={{ background: 'none', border: `1px solid ${C.bd}`, borderRadius: 5, padding: '3px 8px', color: C.txd, cursor: 'pointer', fontSize: 10 }}>
                로그아웃
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 메인 */}
      <div style={{ marginLeft: mobile ? 0 : 200, padding: mobile ? '64px 14px 20px' : '20px 24px', minHeight: '100vh' }}>
        {children}
      </div>
    </div>
  );
}
