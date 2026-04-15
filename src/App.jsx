// ============================================
// 메인 앱 - 비밀번호 잠금 기능 추가 (#6)
// ============================================

import React, { useState, useEffect } from 'react';
import { C } from './config';
import { hashPin } from './utils';
import { useStore, loadSettings, saveSettings } from './store';
import { Layout } from './components/Layout';

import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Mapping from './pages/Mapping';
import Settings from './pages/Settings';

// ─── 비밀번호 잠금 화면 ───
function PasswordLock({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    const hash = await hashPin(pin);
    const settings = await loadSettings();
    if (hash === settings.pin_hash) {
      onUnlock();
    } else {
      setError('비밀번호가 틀렸습니다');
      setPin('');
    }
  };

  const handleKey = (e) => { if (e.key === 'Enter') submit(); };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
      <div style={{ background: C.sf, border: `1px solid ${C.bd}`, borderRadius: 16, padding: 40, textAlign: 'center', maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.ac, marginBottom: 6 }}>주식회사 오름히</div>
        <div style={{ fontSize: 13, color: C.txd, marginBottom: 24 }}>광고 성과 대시보드</div>
        <input
          style={{ background: C.sf2, border: `1px solid ${error ? C.no : C.bd}`, borderRadius: 8, padding: '12px 16px', color: C.tx, fontSize: 18, outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center', letterSpacing: 8 }}
          type="password"
          placeholder="비밀번호"
          value={pin}
          onChange={e => { setPin(e.target.value); setError(''); }}
          onKeyDown={handleKey}
          autoFocus
        />
        {error && <div style={{ color: C.no, fontSize: 13, marginTop: 8 }}>{error}</div>}
        <button onClick={submit} style={{ background: C.ac, color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', cursor: 'pointer', fontWeight: 600, fontSize: 15, width: '100%', marginTop: 16 }}>
          잠금 해제
        </button>
      </div>
    </div>
  );
}

// ─── 메인 앱 ───
export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [locked, setLocked] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState({ pin_hash: null });
  const { data, loading, uploadAdData, addMapping, removeMapping, clearAdData } = useStore();

  // 설정 로드
  useEffect(() => {
    (async () => {
      const s = await loadSettings();
      setSettings(s || { pin_hash: null });
      if (!s?.pin_hash) setLocked(false);
      setSettingsLoaded(true);
    })();
  }, []);

  // 로딩
  if (!settingsLoaded || loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 28, animation: 'pulse 1.5s ease infinite' }}>📊</div>
        <div style={{ color: C.txd, fontSize: 14, fontFamily: 'sans-serif' }}>데이터를 불러오는 중...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.95)}}`}</style>
      </div>
    );
  }

  // 비밀번호 잠금
  if (locked && settings.pin_hash) {
    return <PasswordLock onUnlock={() => setLocked(false)} />;
  }

  return (
    <Layout tab={tab} setTab={setTab}>
      {tab === 'dashboard' && <Dashboard data={data} />}
      {tab === 'upload' && <Upload data={data} uploadAdData={uploadAdData} />}
      {tab === 'mapping' && <Mapping data={data} addMapping={addMapping} removeMapping={removeMapping} />}
      {tab === 'settings' && <Settings data={data} clearAdData={clearAdData} settings={settings} setSettings={setSettings} />}
    </Layout>
  );
}
