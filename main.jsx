import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QRCodeSVG } from 'qrcode.react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';

const getEnv = (key) => {
  const p = typeof process !== 'undefined' && process.env ? process.env : {};
  const m = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return p[`REACT_APP_${key}`] || m[`VITE_${key}`] || p[key] || m[key] || '';
};

const CONFIG = {
  APPROVED_NAMES: getEnv('APPROVED_NAMES') ? getEnv('APPROVED_NAMES').split(',').map(n => n.trim()).filter(Boolean) : [],
  TEAM_KEY: 'frc4585',
  YEAR: new Date().getFullYear(),
};

const theme = { green: '#22C55E', bg: '#0F172A', card: '#1E293B', text: '#F8FAFC', muted: '#94A3B8', border: '#334155' };

const styles = {
  container: { backgroundColor: theme.bg, minHeight: '100vh', padding: '16px', color: theme.text, fontFamily: 'sans-serif', boxSizing: 'border-box' },
  card: { backgroundColor: theme.card, borderRadius: '16px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.border}`, boxSizing: 'border-box' },
  input: { width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: '#0F172A', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' },
  btn: { width: '100%', padding: '16px', borderRadius: '12px', border: 'none', backgroundColor: theme.green, color: '#052e16', fontWeight: '900', fontSize: '16px', cursor: 'pointer', boxSizing: 'border-box' },
  btnOutline: { width: '100%', padding: '16px', borderRadius: '12px', border: `2px solid ${theme.green}`, backgroundColor: 'transparent', color: theme.green, fontWeight: '900', fontSize: '16px', cursor: 'pointer', boxSizing: 'border-box' },
  pickerBtn: (active) => ({
    padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', flex: 1,
    backgroundColor: active ? theme.green : '#0F172A', color: active ? '#052e16' : 'white', border: active ? `1px solid ${theme.green}` : `1px solid ${theme.border}`
  }),
};

const Counter = ({ label, value, onUpdate }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
    <span style={{ fontSize: '14px', fontWeight: '600' }}>{label}</span>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button type="button" onClick={() => onUpdate(Math.max(0, value - 1))} style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>-</button>
      <input type="number" value={value} onChange={(e) => onUpdate(Math.max(0, parseInt(e.target.value, 10) || 0))} style={{ width: '45px', backgroundColor: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '18px', fontWeight: '800', outline: 'none' }} />
      <button type="button" onClick={() => onUpdate(value + 1)} style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', backgroundColor: theme.green, color: '#000', fontWeight: 'bold', cursor: 'pointer' }}>+</button>
    </div>
  </div>
);

const HuskyScout = () => {
  const [db, setDb] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [view, setView] = useState('menu');
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState('');
  const [history, setHistory] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [qrPayload, setQrPayload] = useState('');

  const [loginName, setLoginName] = useState(CONFIG.APPROVED_NAMES[0] || '');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const emptyMatch = { match: '', team: '', autoPieces: 0, teleopPieces: 0, climb: false, notes: '' };
  const emptyPit = { team: '', drivetrain: 'Swerve', mechanism: 'Elevator', notes: '' };
  const [matchData, setMatchData] = useState({ ...emptyMatch });
  const [pitData, setPitData] = useState({ ...emptyPit });

  useEffect(() => {
    const initFirebase = async () => {
      try {
        const res = await fetch('/.netlify/functions/get-config');
        if (res.ok) {
          const config = await res.json();
          if (config.apiKey) {
            const app = initializeApp(config);
            const firestoreDb = getFirestore(app);
            setDb(firestoreDb);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    initFirebase();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('husky_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const fetchTBA = async () => {
      try {
        const res = await fetch('/.netlify/functions/get-events');
        if (res.ok) {
          const data = await res.json();
          const filtered = data.filter(ev => ev.year >= CONFIG.YEAR);
          setEvents(filtered);
          if (filtered.length > 0) setSelectedEvent(filtered[0].key);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchTBA();
  }, [currentUser]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginName) {
      setLoginError('No scouters configured in environment');
      return;
    }
    
    try {
      const res = await fetch('/.netlify/functions/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPass })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setCurrentUser(loginName);
      } else {
        setLoginError(result.error || 'Incorrect password');
      }
    } catch (err) {
      setLoginError('Error verifying password');
    }
  };

  const saveToHistory = async (type, data, payload) => {
    const record = { id: Date.now(), type, scouter: currentUser, event: selectedEvent, data, payload, timestamp: new Date().toLocaleTimeString() };
    const updated = [...history, record];
    setHistory(updated);
    localStorage.setItem('husky_history', JSON.stringify(updated));
    if (db) {
      try {
        await addDoc(collection(db, 'scouting_data'), record);
      } catch (e) {
        console.error(e);
      }
    }
    setShowQR(false);
    if (type === 'match') {
      const nextMatch = (parseInt(matchData.match, 10) || 0) + 1;
      setMatchData({ ...emptyMatch, match: String(nextMatch) });
    }
    if (type === 'pit') setPitData({ ...emptyPit });
    setView('menu');
  };

  const generateMatchQR = (e) => {
    e.preventDefault();
    const payload = `TYPE:MATCH|Scout:${currentUser}|Evnt:${selectedEvent}|M:${matchData.match}|T:${matchData.team}|Auto:${matchData.autoPieces}|Tele:${matchData.teleopPieces}|Climb:${matchData.climb?'Y':'N'}|Note:${matchData.notes||'None'}`;
    setQrPayload(payload);
    setShowQR(true);
  };

  const generatePitQR = (e) => {
    e.preventDefault();
    const payload = `TYPE:PIT|Scout:${currentUser}|Evnt:${selectedEvent}|T:${pitData.team}|Drv:${pitData.drivetrain}|Mech:${pitData.mechanism}|Note:${pitData.notes||'None'}`;
    setQrPayload(payload);
    setShowQR(true);
  };

  if (!currentUser) {
    return (
      <div style={styles.container}>
        <div style={{ maxWidth: '400px', margin: '40px auto', ...styles.card, textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '0 0 20px 0' }}>HUSKY<span style={{ color: theme.green }}>SCOUT</span></h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '10px', color: theme.muted, display: 'block', textAlign: 'left', marginBottom: '5px' }}>SCOUTER NAME</label>
              <select style={styles.input} value={loginName} onChange={(e) => setLoginName(e.target.value)}>
                {CONFIG.APPROVED_NAMES.length > 0 ? (
                  CONFIG.APPROVED_NAMES.map(name => <option key={name} value={name}>{name}</option>)
                ) : (
                  <option value="">No users set in environment</option>
                )}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: theme.muted, display: 'block', textAlign: 'left', marginBottom: '5px' }}>PASSWORD</label>
              <input type="password" style={styles.input} value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
            </div>
            {loginError && <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>{loginError}</span>}
            <button type="submit" style={styles.btn}>ACCESS SYSTEM</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0 }}>HUSKY<span style={{ color: theme.green }}>SCOUT</span></h1>
        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: theme.muted }}>Active: {currentUser}</p>
      </header>

      <main style={{ maxWidth: '500px', margin: '0 auto' }}>
        {view === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={styles.card}>
              <label style={{ fontSize: '10px', color: theme.green, fontWeight: '800' }}>ACTIVE EVENT (TBA)</label>
              {events.length > 0 ? (
                <select style={{ ...styles.input, marginTop: '5px' }} value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                  {events.map(ev => <option key={ev.key} value={ev.key}>{ev.name}</option>)}
                </select>
              ) : (
                <input style={{ ...styles.input, marginTop: '5px' }} placeholder="Manual Event Code (e.g. 2024utwv)" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} />
              )}
            </div>
            <button onClick={() => setView('match')} style={styles.btn}>MATCH SCOUTING</button>
            <button onClick={() => setView('pit')} style={{ ...styles.btn, backgroundColor: '#3B82F6', color: 'white' }}>PIT SCOUTING</button>
            <button onClick={() => setView('history')} style={styles.btnOutline}>VIEW HISTORY ({history.length})</button>
          </div>
        )}

        {view === 'match' && !showQR && (
          <form onSubmit={generateMatchQR}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <button type="button" onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: theme.green }}>MATCH SCOUTING</span>
            </div>
            <div style={styles.card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '15px' }}>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>MATCH #</label><input type="number" style={styles.input} value={matchData.match} onChange={e => setMatchData({ ...matchData, match: e.target.value })} required /></div>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>TEAM #</label><input type="number" style={styles.input} value={matchData.team} onChange={e => setMatchData({ ...matchData, team: e.target.value })} required /></div>
              </div>
              <Counter label="Auto Pieces" value={matchData.autoPieces} onUpdate={v => setMatchData({ ...matchData, autoPieces: v })} />
              <Counter label="Teleop Pieces" value={matchData.teleopPieces} onUpdate={v => setMatchData({ ...matchData, teleopPieces: v })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', marginBottom: '15px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>Climb Successful?</span>
                <input type="checkbox" checked={matchData.climb} onChange={e => setMatchData({ ...matchData, climb: e.target.checked })} style={{ width: '24px', height: '24px', accentColor: theme.green }} />
              </div>
              <textarea style={{ ...styles.input, height: '60px', resize: 'none' }} placeholder="Match notes..." value={matchData.notes} onChange={e => setMatchData({ ...matchData, notes: e.target.value })} />
            </div>
            <button type="submit" style={styles.btn}>GENERATE MATCH QR</button>
          </form>
        )}

        {view === 'pit' && !showQR && (
          <form onSubmit={generatePitQR}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <button type="button" onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>PIT SCOUTING</span>
            </div>
            <div style={styles.card}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: theme.muted }}>TEAM #</label>
                <input type="number" style={styles.input} value={pitData.team} onChange={e => setPitData({ ...pitData, team: e.target.value })} required />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: theme.muted }}>DRIVETRAIN</label>
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                  {['Swerve', 'Tank', 'Mecanum'].map(opt => (
                    <button key={opt} type="button" onClick={() => setPitData({ ...pitData, drivetrain: opt })} style={styles.pickerBtn(pitData.drivetrain === opt)}>{opt}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: theme.muted }}>PRIMARY MECHANISM</label>
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                  {['Elevator', 'Arm', 'Shooter', 'None'].map(opt => (
                    <button key={opt} type="button" onClick={() => setPitData({ ...pitData, mechanism: opt })} style={styles.pickerBtn(pitData.mechanism === opt)}>{opt}</button>
                  ))}
                </div>
              </div>
              <textarea style={{ ...styles.input, height: '80px', resize: 'none' }} placeholder="Robot specs, weight, auto capabilities, etc..." value={pitData.notes} onChange={e => setPitData({ ...pitData, notes: e.target.value })} />
            </div>
            <button type="submit" style={{ ...styles.btn, backgroundColor: '#3B82F6', color: 'white' }}>GENERATE PIT QR</button>
          </form>
        )}

        {view === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: theme.green }}>ARCHIVE</span>
            </div>
            {history.length === 0 ? (
              <div style={{ ...styles.card, textAlign: 'center', color: theme.muted }}>No records yet.</div>
            ) : (
              history.map(record => (
                <div key={record.id} style={{ ...styles.card, borderLeft: `4px solid ${record.type === 'pit' ? '#3B82F6' : theme.green}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.muted }}>
                    <span>{record.type.toUpperCase()} | Team {record.data.team}</span>
                    <span>{record.timestamp}</span>
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <button onClick={() => { setQrPayload(record.payload); setShowQR(true); }} style={{ padding: '6px 12px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: 'white', cursor: 'pointer', fontSize: '12px' }}>View QR</button>
                  </div>
                </div>
              )).reverse()
            )}
          </div>
        )}

        {showQR && (
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <h3 style={{ color: qrPayload.includes('TYPE:PIT') ? '#3B82F6' : theme.green }}>SCAN READY</h3>
            <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px' }}>
              <QRCodeSVG value={qrPayload} size={280} level="L" includeMargin={true} />
            </div>
            <button onClick={() => setShowQR(false)} style={{ ...styles.btnOutline, marginBottom: '10px' }}>BACK TO EDIT</button>
            <button onClick={() => saveToHistory(qrPayload.includes('TYPE:PIT') ? 'pit' : 'match', qrPayload.includes('TYPE:PIT') ? pitData : matchData, qrPayload)} style={{ ...styles.btn, backgroundColor: 'white', color: 'black' }}>ARCHIVE & CONTINUE</button>
          </div>
        )}
      </main>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<HuskyScout />);
}

export default HuskyScout;