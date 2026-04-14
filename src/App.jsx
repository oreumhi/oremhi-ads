// ============================================
// 메인 앱
// ============================================

import React, { useState } from 'react';
import { C } from './config';
import { useStore } from './store';
import { Layout } from './components/Layout';

import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Mapping from './pages/Mapping';
import Settings from './pages/Settings';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const { data, loading, uploadAdData, addMapping, removeMapping, clearAdData } = useStore();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 28, animation: 'pulse 1.5s ease infinite' }}>📊</div>
        <div style={{ color: C.txd, fontSize: 14, fontFamily: 'sans-serif' }}>데이터를 불러오는 중...</div>
        <style>{`@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.95)}}`}</style>
      </div>
    );
  }

  return (
    <Layout tab={tab} setTab={setTab}>
      {tab === 'dashboard' && <Dashboard data={data} />}
      {tab === 'upload' && <Upload data={data} uploadAdData={uploadAdData} />}
      {tab === 'mapping' && <Mapping data={data} addMapping={addMapping} removeMapping={removeMapping} />}
      {tab === 'settings' && <Settings data={data} clearAdData={clearAdData} />}
    </Layout>
  );
}
