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

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const calculateScore = (auto, teleop, climb) => {
  return (Number(auto) * 2) + Number(teleop) + (climb ? 5 : 0);
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
  const [matches, setMatches] = useState([]);
  const [history, setHistory] = useState([]);
  const [picklist, setPicklist] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [qrPayload, setQrPayload] = useState('');

  const [loginName, setLoginName] = useState(CONFIG.APPROVED_NAMES[0] || '');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const emptyMatch = { match: '', team: '', autoPieces: 0, teleopPieces: 0, climb: false, defenseQuality: 0, defenseFouls: 0, notes: '' };
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
          const todayStr = getLocalDateString();
          const filtered = data.filter(ev => {
            if (ev.end_date) {
              return ev.end_date >= todayStr;
            }
            return ev.year >= CONFIG.YEAR;
          });
          setEvents(filtered);
          if (filtered.length > 0) setSelectedEvent(filtered[0].key);
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchTBA();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedEvent) return;
    const fetchMatches = async () => {
      try {
        const res = await fetch(`/.netlify/functions/get-matches?event=${selectedEvent}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const qmMatches = data
              .filter(m => m.comp_level === 'qm')
              .sort((a, b) => a.match_number - b.match_number);
            setMatches(qmMatches);
          }
        } else {
          setMatches([]);
        }
      } catch (e) {
        console.error(e);
        setMatches([]);
      }
    };
    fetchMatches();
  }, [selectedEvent]);

  const getAllTeams = () => {
    const uniqueTeams = new Set();
    matches.forEach(m => {
      if (m.alliances && m.alliances.red && m.alliances.red.teams) {
        m.alliances.red.teams.forEach(t => uniqueTeams.add(t.replace(/^frc/, '')));
      }
      if (m.alliances && m.alliances.blue && m.alliances.blue.teams) {
        m.alliances.blue.teams.forEach(t => uniqueTeams.add(t.replace(/^frc/, '')));
      }
    });
    history.forEach(h => {
      if (h.event === selectedEvent && h.data && h.data.team) {
        uniqueTeams.add(String(h.data.team));
      }
    });
    return Array.from(uniqueTeams);
  };

  useEffect(() => {
    if (!selectedEvent) return;
    const allTeams = getAllTeams();
    const teamsWithStats = allTeams.map(t => {
      const teamMatches = history.filter(h => h.type === 'match' && h.event === selectedEvent && String(h.data.team) === String(t));
      
      const avgOff = teamMatches.length > 0 
        ? parseFloat((teamMatches.reduce((sum, h) => sum + calculateScore(h.data.autoPieces, h.data.teleopPieces, h.data.climb), 0) / teamMatches.length).toFixed(1))
        : 0;

      const defIndices = teamMatches.map(h => {
        const dq = Number(h.data.defenseQuality || 0);
        const df = Number(h.data.defenseFouls || 0);
        if (dq === 0) return 0;
        return Math.max(0, dq - (df * 0.5));
      });

      const avgDef = teamMatches.length > 0
        ? parseFloat((defIndices.reduce((sum, val) => sum + val, 0) / teamMatches.length).toFixed(1))
        : 0;

      const hybrid = parseFloat((avgOff + (avgDef * 5)).toFixed(1));

      return { team: t, avgOff, avgDef, hybrid };
    });

    const savedOrder = localStorage.getItem(`husky_picklist_${selectedEvent}`);
    let ordered = [];
    if (savedOrder) {
      try {
        const savedArray = JSON.parse(savedOrder);
        const savedSet = new Set(savedArray);
        const inSaved = savedArray
          .map(tNum => teamsWithStats.find(t => t.team === tNum))
          .filter(Boolean);
        const notInSaved = teamsWithStats
          .filter(t => !savedSet.has(t.team))
          .sort((a, b) => b.hybrid - a.hybrid);
        ordered = [...inSaved, ...notInSaved];
      } catch (e) {
        ordered = teamsWithStats.sort((a, b) => b.hybrid - a.hybrid);
      }
    } else {
      ordered = teamsWithStats.sort((a, b) => b.hybrid - a.hybrid);
    }
    setPicklist(ordered);
  }, [selectedEvent, history, matches, view]);

  const moveTeam = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= picklist.length) return;
    const updated = [...picklist];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(newIndex, 0, movedItem);
    setPicklist(updated);
    localStorage.setItem(`husky_picklist_${selectedEvent}`, JSON.stringify(updated.map(t => t.team)));
  };

  const resetPicklist = () => {
    if (window.confirm("Reset picklist order back to Hybrid score ranking?")) {
      localStorage.removeItem(`husky_picklist_${selectedEvent}`);
      const allTeams = getAllTeams();
      const teamsWithStats = allTeams.map(t => {
        const teamMatches = history.filter(h => h.type === 'match' && h.event === selectedEvent && String(h.data.team) === String(t));
        const avgOff = teamMatches.length > 0 
          ? parseFloat((teamMatches.reduce((sum, h) => sum + calculateScore(h.data.autoPieces, h.data.teleopPieces, h.data.climb), 0) / teamMatches.length).toFixed(1))
          : 0;
        const defIndices = teamMatches.map(h => {
          const dq = Number(h.data.defenseQuality || 0);
          const df = Number(h.data.defenseFouls || 0);
          if (dq === 0) return 0;
          return Math.max(0, dq - (df * 0.5));
        });
        const avgDef = teamMatches.length > 0
          ? parseFloat((defIndices.reduce((sum, val) => sum + val, 0) / teamMatches.length).toFixed(1))
          : 0;
        const hybrid = parseFloat((avgOff + (avgDef * 5)).toFixed(1));
        return { team: t, avgOff, avgDef, hybrid };
      });
      setPicklist(teamsWithStats.sort((a, b) => b.hybrid - a.hybrid));
    }
  };

  const foundMatch = matches.find(m => String(m.match_number) === String(matchData.match));
  const teamsInMatch = foundMatch 
    ? [
        ...foundMatch.alliances.red.teams.map(t => ({ team: t.replace(/^frc/, ''), alliance: 'red' })),
        ...foundMatch.alliances.blue.teams.map(t => ({ team: t.replace(/^frc/, ''), alliance: 'blue' }))
      ]
    : [];

  useEffect(() => {
    if (teamsInMatch.length > 0) {
      const matchTeams = teamsInMatch.map(t => t.team);
      if (!matchTeams.includes(matchData.team)) {
        setMatchData(prev => ({ ...prev, team: matchTeams[0] }));
      }
    }
  }, [matchData.match, matches]);

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
    const score = calculateScore(matchData.autoPieces, matchData.teleopPieces, matchData.climb);
    const payload = `TYPE:MATCH|Scout:${currentUser}|Evnt:${selectedEvent}|M:${matchData.match}|T:${matchData.team}|Auto:${matchData.autoPieces}|Tele:${matchData.teleopPieces}|Climb:${matchData.climb?'Y':'N'}|DQ:${matchData.defenseQuality}|DF:${matchData.defenseFouls}|Score:${score}|Note:${matchData.notes||'None'}`;
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
            <button onClick={() => setView('picklist')} style={{ ...styles.btn, backgroundColor: '#8B5CF6', color: 'white' }}>ALLIANCE PICKLIST</button>
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
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted }}>MATCH #</label>
                  <input type="number" style={styles.input} value={matchData.match} onChange={e => setMatchData({ ...matchData, match: e.target.value })} required />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted }}>TEAM #</label>
                  {teamsInMatch.length > 0 ? (
                    <select
                      style={styles.input}
                      value={matchData.team}
                      onChange={e => setMatchData({ ...matchData, team: e.target.value })}
                      required
                    >
                      <option value="" disabled>Select Team...</option>
                      <optgroup label="Red Alliance" style={{ color: '#EF4444' }}>
                        {teamsInMatch.filter(t => t.alliance === 'red').map(t => (
                          <option key={t.team} value={t.team} style={{ color: 'white' }}>{t.team}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Blue Alliance" style={{ color: '#3B82F6' }}>
                        {teamsInMatch.filter(t => t.alliance === 'blue').map(t => (
                          <option key={t.team} value={t.team} style={{ color: 'white' }}>{t.team}</option>
                        ))}
                      </optgroup>
                    </select>
                  ) : (
                    <input
                      type="number"
                      style={styles.input}
                      placeholder="Type team #"
                      value={matchData.team}
                      onChange={e => setMatchData({ ...matchData, team: e.target.value })}
                      required
                    />
                  )}
                </div>
              </div>
              <Counter label="Auto Pieces" value={matchData.autoPieces} onUpdate={v => setMatchData({ ...matchData, autoPieces: v })} />
              <Counter label="Teleop Pieces" value={matchData.teleopPieces} onUpdate={v => setMatchData({ ...matchData, teleopPieces: v })} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '15px', marginBottom: '15px' }}>
                <span style={{ fontSize: '14px', fontWeight: '700' }}>Climb Successful?</span>
                <input type="checkbox" checked={matchData.climb} onChange={e => setMatchData({ ...matchData, climb: e.target.checked })} style={{ width: '24px', height: '24px', accentColor: theme.green }} />
              </div>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: theme.muted }}>DEFENSE QUALITY</label>
                <div style={{ display: 'flex', gap: '4px', marginTop: '5px' }}>
                  {[0, 1, 2, 3, 4, 5].map(q => (
                    <button key={q} type="button" onClick={() => setMatchData({ ...matchData, defenseQuality: q })} style={styles.pickerBtn(matchData.defenseQuality === q)}>
                      {q === 0 ? 'None' : q}
                    </button>
                  ))}
                </div>
              </div>
              <Counter label="Defense Fouls" value={matchData.defenseFouls} onUpdate={v => setMatchData({ ...matchData, defenseFouls: v })} />
              <div style={{ margin: '15px 0', padding: '12px', borderRadius: '10px', backgroundColor: '#0F172A', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `1px solid ${theme.border}` }}>
                <span style={{ fontSize: '14px', fontWeight: '700', color: theme.muted }}>Est. Match Points</span>
                <span style={{ fontSize: '18px', fontWeight: '900', color: theme.green }}>
                  {calculateScore(matchData.autoPieces, matchData.teleopPieces, matchData.climb)}
                </span>
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

        {view === 'picklist' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: '#8B5CF6' }}>ALLIANCE PICKLIST</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: theme.muted }}>RANKED BY HYBRID SCORE (W = 5)</span>
              <button onClick={resetPicklist} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' }}>Reset to Stats Default</button>
            </div>
            {picklist.length === 0 ? (
              <div style={{ ...styles.card, textAlign: 'center', color: theme.muted }}>No teams found for this event yet. Enter match schedule or scout teams to populate.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {picklist.map((item, index) => (
                  <div key={item.team} style={{ ...styles.card, margin: 0, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '900', color: theme.green, minWidth: '24px' }}>#{index + 1}</span>
                      <div>
                        <span style={{ fontSize: '16px', fontWeight: 'bold' }}>Team {item.team}</span>
                        <div style={{ fontSize: '11px', color: theme.muted, marginTop: '2px' }}>
                          Off Avg: {item.avgOff} | Def Avg: {item.avgDef} | Hybrid: {item.hybrid}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button"
                        disabled={index === 0} 
                        onClick={() => moveTeam(index, 'up')} 
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: index === 0 ? theme.border : 'white', fontWeight: 'bold', cursor: index === 0 ? 'not-allowed' : 'pointer' }}
                      >
                        ▲
                      </button>
                      <button 
                        type="button"
                        disabled={index === picklist.length - 1} 
                        onClick={() => moveTeam(index, 'down')} 
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: index === picklist.length - 1 ? theme.border : 'white', fontWeight: 'bold', cursor: index === picklist.length - 1 ? 'not-allowed' : 'pointer' }}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
                    <span>
                      {record.type.toUpperCase()} | Team {record.data.team}
                      {record.type === 'match' && ` (${calculateScore(record.data.autoPieces, record.data.teleopPieces, record.data.climb)} pts)`}
                    </span>
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