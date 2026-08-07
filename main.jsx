import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, writeBatch } from 'firebase/firestore';

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
      <button 
        type="button" 
        onClick={() => onUpdate(Math.max(0, (parseInt(value, 10) || 0) - 1))} 
        style={{ width: '40px', height: '40px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}
      >
        -
      </button>
      <input 
        type="number" 
        value={value} 
        onChange={(e) => {
          const val = e.target.value;
          onUpdate(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
        }} 
        style={{ width: '45px', backgroundColor: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '18px', fontWeight: '800', outline: 'none' }} 
      />
      <button 
        type="button" 
        onClick={() => onUpdate((parseInt(value, 10) || 0) + 1)} 
        style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', backgroundColor: theme.green, color: '#000', fontWeight: 'bold', cursor: 'pointer' }}
      >
        +
      </button>
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
  const [customOrders, setCustomOrders] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const [manualEventMode, setManualEventMode] = useState(false);

  const [aiStrategy, setAiStrategy] = useState('balanced');
  const [ourRobotSpecs, setOurRobotSpecs] = useState('Swerve drive, elevator mechanism, high-scoring offensive, capable of climb.');
  
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [aiRecommendedOrder, setAiRecommendedOrder] = useState([]);
  const [previewAiOrder, setPreviewAiOrder] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState('');

  const [loginName, setLoginName] = useState(CONFIG.APPROVED_NAMES[0] || '');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const emptyMatch = { match: '', team: '', autoPieces: 0, teleopPieces: 0, climb: false, defenseQuality: 0, defenseFouls: 0, notes: '' };
  const emptyPit = { team: '', drivetrain: 'Swerve', mechanism: 'Elevator', notes: '' };
  const [matchData, setMatchData] = useState({ ...emptyMatch });
  const [pitData, setPitData] = useState({ ...emptyPit });

  const todayStr = useMemo(() => getLocalDateString(), []);

  const activeEventDetails = useMemo(() => {
    return events.find(e => e.key === selectedEvent);
  }, [events, selectedEvent]);

  const appMode = useMemo(() => {
    if (manualEventMode) {
      return 'active';
    }
    if (!activeEventDetails || !activeEventDetails.start_date || !activeEventDetails.end_date) {
      return 'test';
    }
    const getDaysDifference = (dateStr1, dateStr2) => {
      const d1 = new Date(dateStr1 + 'T00:00:00');
      const d2 = new Date(dateStr2 + 'T00:00:00');
      const diffTime = d1 - d2;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };
    const daysToStart = getDaysDifference(activeEventDetails.start_date, todayStr);
    if (todayStr >= activeEventDetails.start_date && todayStr <= activeEventDetails.end_date) {
      return 'active';
    } else if (daysToStart > 0 && daysToStart <= 7) {
      return 'preevent';
    }
    return 'test';
  }, [activeEventDetails, todayStr, manualEventMode]);

  const unsyncedCount = useMemo(() => {
    return history.filter(h => !h.synced).length;
  }, [history]);

  useEffect(() => {
    const handleOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const savedUser = localStorage.getItem('husky_scout_current_user');
    if (savedUser) {
      setCurrentUser(savedUser);
    }
  }, []);

  useEffect(() => {
    const viewTitles = {
      menu: 'HuskyScout',
      match: 'Match Scouting - HuskyScout',
      pit: 'Pit Scouting - HuskyScout',
      picklist: 'Alliance Picklist - HuskyScout',
      history: 'Archive - HuskyScout',
      ourMatches: 'Our Matches - HuskyScout',
    };
    document.title = viewTitles[view] || 'HuskyScout';
  }, [view]);

  useEffect(() => {
    const initFirebase = async () => {
      let config = null;
      try {
        const cached = localStorage.getItem('husky_scout_firebase_config');
        if (cached) {
          config = JSON.parse(cached);
        }
      } catch (e) {}

      if (isOnline) {
        try {
          const res = await fetch('/.netlify/functions/get-config');
          if (res.ok) {
            const remoteConfig = await res.json();
            if (remoteConfig.apiKey) {
              config = remoteConfig;
              localStorage.setItem('husky_scout_firebase_config', JSON.stringify(remoteConfig));
            }
          }
        } catch (e) {
          console.error(e);
        }
      }

      if (config && config.apiKey) {
        try {
          const app = initializeApp(config);
          const firestoreDb = getFirestore(app);
          setDb(firestoreDb);
        } catch (e) {
          console.error(e);
        }
      }
    };
    initFirebase();
  }, [isOnline]);

  const loadAndSyncHistory = async (firestoreDb) => {
    let localData = [];
    try {
      localData = JSON.parse(localStorage.getItem('husky_scout_history') || '[]');
    } catch (e) {}

    let remoteData = [];
    if (firestoreDb && isOnline) {
      try {
        const querySnapshot = await getDocs(collection(firestoreDb, 'scouting_data'));
        const batch = writeBatch(firestoreDb);
        let hasDeletes = false;
        for (const docSnap of querySnapshot.docs) {
          const docData = docSnap.data();
          if (docData.isTest && docData.dateString && docData.dateString !== todayStr) {
            batch.delete(doc(firestoreDb, 'scouting_data', docSnap.id));
            hasDeletes = true;
          } else {
            remoteData.push({ ...docData, firestoreId: docSnap.id });
          }
        }
        if (hasDeletes) {
          await batch.commit();
        }
      } catch (e) {
        console.error(e);
      }
    }

    const mergedMap = new Map();
    localData.forEach(item => mergedMap.set(String(item.id), item));
    remoteData.forEach(item => mergedMap.set(String(item.id), { ...item, synced: true }));

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => (a.id || 0) - (b.id || 0));

    setHistory(mergedList);
    localStorage.setItem('husky_scout_history', JSON.stringify(mergedList));

    if (firestoreDb && isOnline) {
      const unsynced = mergedList.filter(item => !item.synced);
      let listUpdated = false;
      for (const item of unsynced) {
        try {
          const { synced, firestoreId, ...toUpload } = item;
          await addDoc(collection(firestoreDb, 'scouting_data'), toUpload);
          item.synced = true;
          listUpdated = true;
        } catch (e) {
          console.error(e);
          break;
        }
      }
      if (listUpdated) {
        const updatedList = mergedList.map(item => ({ ...item }));
        setHistory(updatedList);
        localStorage.setItem('husky_scout_history', JSON.stringify(updatedList));
      }
    }
  };

  useEffect(() => {
    loadAndSyncHistory(db);
  }, [db, todayStr, isOnline]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchTBA = async () => {
      let cachedEvents = [];
      try {
        const cached = localStorage.getItem('husky_scout_events');
        if (cached) {
          cachedEvents = JSON.parse(cached);
          setEvents(cachedEvents);
          if (cachedEvents.length > 0) {
            const todayStrLocal = getLocalDateString();
            const activeOrFuture = cachedEvents.find(ev => !ev.end_date || ev.end_date >= todayStrLocal);
            setSelectedEvent(activeOrFuture ? activeOrFuture.key : cachedEvents[0].key);
          }
        }
      } catch (e) {}

      if (!isOnline) return;

      try {
        const res = await fetch('/.netlify/functions/get-events');
        if (res.ok) {
          const data = await res.json();
          const todayStrLocal = getLocalDateString();
          const filtered = data.filter(ev => {
            const isCurrentOrFutureYear = ev.year >= CONFIG.YEAR;
            const isNotPast = !ev.end_date || ev.end_date >= todayStrLocal;
            return isCurrentOrFutureYear && isNotPast;
          });
          setEvents(filtered);
          localStorage.setItem('husky_scout_events', JSON.stringify(filtered));
          if (filtered.length > 0) {
            const activeOrFuture = filtered.find(ev => !ev.end_date || ev.end_date >= todayStrLocal);
            setSelectedEvent(activeOrFuture ? activeOrFuture.key : filtered[0].key);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchTBA();
  }, [currentUser, isOnline]);

  useEffect(() => {
    if (!selectedEvent) return;
    const fetchMatches = async () => {
      let cachedMatches = [];
      try {
        const cached = localStorage.getItem(`husky_scout_matches_${selectedEvent}`);
        if (cached) {
          cachedMatches = JSON.parse(cached);
          setMatches(cachedMatches);
        }
      } catch (e) {}

      if (!isOnline) return;

      try {
        const res = await fetch(`/.netlify/functions/get-matches?event=${selectedEvent}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            const qmMatches = data
              .filter(m => m.comp_level === 'qm')
              .sort((a, b) => a.match_number - b.match_number);
            setMatches(qmMatches);
            localStorage.setItem(`husky_scout_matches_${selectedEvent}`, JSON.stringify(qmMatches));
          }
        } else {
          if (cachedMatches.length === 0) setMatches([]);
        }
      } catch (e) {
        console.error(e);
        if (cachedMatches.length === 0) setMatches([]);
      }
    };
    fetchMatches();
  }, [selectedEvent, isOnline]);

  const teamsInMatch = useMemo(() => {
    const foundMatch = matches.find(m => String(m.match_number) === String(matchData.match));
    return foundMatch 
      ? [
          ...foundMatch.alliances.red.teams.map(t => ({ team: String(t.replace(/^frc/, '')).trim(), alliance: 'red' })),
          ...foundMatch.alliances.blue.teams.map(t => ({ team: String(t.replace(/^frc/, '')).trim(), alliance: 'blue' }))
        ]
      : [];
  }, [matches, matchData.match]);

  useEffect(() => {
    if (teamsInMatch.length > 0) {
      const matchTeams = teamsInMatch.map(t => t.team);
      setMatchData(prev => {
        if (!matchTeams.includes(prev.team)) {
          return { ...prev, team: matchTeams[0] };
        }
        return prev;
      });
    }
  }, [teamsInMatch]);

  const ourMatches = useMemo(() => {
    return matches.filter(m => {
      const red = m.alliances?.red?.teams || [];
      const blue = m.alliances?.blue?.teams || [];
      return red.some(t => String(t.replace(/^frc/, '')).trim() === '4585') ||
             blue.some(t => String(t.replace(/^frc/, '')).trim() === '4585');
    });
  }, [matches]);

  const scoutedEventsInHistory = useMemo(() => {
    const set = new Set();
    history.forEach(h => {
      if (h.event) set.add(h.event);
    });
    return Array.from(set);
  }, [history]);

  const picklist = useMemo(() => {
    if (!selectedEvent) return [];

    const uniqueTeams = new Set();
    matches.forEach(m => {
      if (m.alliances?.red?.teams) {
        m.alliances.red.teams.forEach(t => uniqueTeams.add(String(t.replace(/^frc/, '')).trim()));
      }
      if (m.alliances?.blue?.teams) {
        m.alliances.blue.teams.forEach(t => uniqueTeams.add(String(t.replace(/^frc/, '')).trim()));
      }
    });
    history.forEach(h => {
      if (h.event === selectedEvent && h.data?.team) {
        uniqueTeams.add(String(h.data.team).trim());
      }
    });
    const allTeams = Array.from(uniqueTeams);

    const teamsWithStats = allTeams.map(t => {
      const teamMatches = history.filter(h => h.type === 'match' && h.event === selectedEvent && String(h.data.team).trim() === String(t).trim());
      
      const avgOff = teamMatches.length > 0 
        ? parseFloat((teamMatches.reduce((sum, h) => sum + calculateScore(h.data.autoPieces, h.data.teleopPieces, h.data.climb), 0) / teamMatches.length).toFixed(1))
        : 0;

      const playedDefMatches = teamMatches.filter(h => Number(h.data.defenseQuality || 0) > 0);
      const avgDef = playedDefMatches.length > 0
        ? parseFloat((playedDefMatches.reduce((sum, h) => {
            const dq = Number(h.data.defenseQuality || 0);
            const df = Number(h.data.defenseFouls || 0);
            return sum + Math.max(0, dq - (df * 0.5));
          }, 0) / playedDefMatches.length).toFixed(1))
        : 0;

      const hybrid = parseFloat((avgOff + (avgDef * 5)).toFixed(1));

      return { team: t, avgOff, avgDef, hybrid };
    });

    const activeOrder = (previewAiOrder && aiRecommendedOrder.length > 0) 
      ? aiRecommendedOrder 
      : customOrders[selectedEvent];

    if (activeOrder) {
      const savedSet = new Set(activeOrder.map(val => String(val).trim()));
      const inSaved = activeOrder
        .map(tNum => teamsWithStats.find(t => String(t.team).trim() === String(tNum).trim()))
        .filter(Boolean);
      const notInSaved = teamsWithStats
        .filter(t => !savedSet.has(String(t.team).trim()))
        .sort((a, b) => b.hybrid - a.hybrid);
      return [...inSaved, ...notInSaved];
    } else {
      return teamsWithStats.sort((a, b) => b.hybrid - a.hybrid);
    }
  }, [selectedEvent, history, matches, customOrders, previewAiOrder, aiRecommendedOrder]);

  const moveTeam = (index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= picklist.length) return;
    const updated = [...picklist];
    const [movedItem] = updated.splice(index, 1);
    updated.splice(newIndex, 0, movedItem);
    
    setCustomOrders(prev => ({
      ...prev,
      [selectedEvent]: updated.map(t => String(t.team).trim())
    }));
  };

  const resetPicklist = () => {
    if (window.confirm("Reset picklist order back to Hybrid score ranking?")) {
      setCustomOrders(prev => {
        const next = { ...prev };
        delete next[selectedEvent];
        return next;
      });
    }
  };

  const runRemoteAiAnalysis = async () => {
    if (!isOnline) {
      setAiError('AI generation requires an active network connection.');
      return;
    }
    setLoadingAi(true);
    setAiError('');
    setAiSuggestions('');
    try {
      if (picklist.length === 0) {
        throw new Error('No active teams are registered in the current event picklist.');
      }

      const payloadData = picklist.map((item, index) => {
        const teamHistory = history.filter(h => h.event === selectedEvent && String(h.data.team).trim() === String(item.team).trim());
        const pitRecords = teamHistory.filter(h => h.type === 'pit');
        const matchRecords = teamHistory.filter(h => h.type === 'match');
        
        const pitNotes = pitRecords.map(h => h.data.notes).filter(Boolean).join(' | ');
        const matchNotes = matchRecords.map(h => h.data.notes).filter(Boolean).join(' | ');
        
        const drivetrains = Array.from(new Set(pitRecords.map(h => h.data.drivetrain).filter(Boolean))).join(', ') || 'Unknown';
        const mechanisms = Array.from(new Set(pitRecords.map(h => h.data.mechanism).filter(Boolean))).join(', ') || 'Unknown';
        
        return `Rank #${index + 1} - Team ${item.team}:
  - Metrics: Avg Offense: ${item.avgOff}, Avg Defense: ${item.avgDef}, Hybrid: ${item.hybrid}
  - Pit Specs: Drivetrain [${drivetrains}], Primary Mechanism [${mechanisms}]
  - Pit Notes: ${pitNotes || 'None'}
  - Match Notes: ${matchNotes || 'None'}`;
      }).join('\n\n');

      const res = await fetch('/.netlify/functions/process-ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event: selectedEvent,
          specs: ourRobotSpecs,
          strategy: aiStrategy,
          payload: payloadData
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to analyze picklist via serverless function.');
      }

      const parsed = await res.json();
      
      if (!parsed.success) {
        throw new Error(parsed.error || 'Server processing error.');
      }

      setAiSuggestions(parsed.report || 'No analysis report returned.');
      if (Array.isArray(parsed.recommended_order)) {
        const stringifiedOrder = parsed.recommended_order.map(val => String(val).trim());
        setAiRecommendedOrder(stringifiedOrder);
        setPreviewAiOrder(true);
      }
    } catch (err) {
      setAiError(err.message || 'Error generating AI suggestions.');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    if (!loginName) {
      setLoginError('No user selected or configured');
      return;
    }

    if (!isOnline) {
      const offlinePassCached = localStorage.getItem('husky_scout_pass_verified');
      if (offlinePassCached === 'true') {
        setCurrentUser(loginName);
        localStorage.setItem('husky_scout_current_user', loginName);
      } else {
        setLoginError('Offline login requires at least one previous online verification on this device.');
      }
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
        localStorage.setItem('husky_scout_current_user', loginName);
        localStorage.setItem('husky_scout_pass_verified', 'true');
      } else {
        setLoginError(result.error || 'Incorrect password');
      }
    } catch (err) {
      setLoginError('Error verifying password');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('husky_scout_current_user');
    setCurrentUser(null);
    setView('menu');
  };

  const saveToHistory = async (type, data) => {
    const standardizedData = { ...data, team: String(data.team).trim() };
    const record = { 
      id: Date.now(), 
      type, 
      scouter: currentUser, 
      event: selectedEvent, 
      data: standardizedData, 
      timestamp: new Date().toLocaleTimeString(),
      isTest: appMode === 'test',
      dateString: todayStr,
      synced: false
    };

    const updated = [...history, record];
    setHistory(updated);
    localStorage.setItem('husky_scout_history', JSON.stringify(updated));

    if (db && isOnline) {
      try {
        const { synced, ...toUpload } = record;
        await addDoc(collection(db, 'scouting_data'), toUpload);
        const syncedList = updated.map(item => item.id === record.id ? { ...item, synced: true } : item);
        setHistory(syncedList);
        localStorage.setItem('husky_scout_history', JSON.stringify(syncedList));
      } catch (e) {
        console.error(e);
      }
    }
    if (type === 'match') {
      const nextMatch = (parseInt(data.match, 10) || 0) + 1;
      setMatchData({ ...emptyMatch, match: String(nextMatch) });
    }
    if (type === 'pit') setPitData({ ...emptyPit });
    setView('menu');
  };

  const handleMatchSubmit = (e) => {
    e.preventDefault();
    saveToHistory('match', matchData);
  };

  const handlePitSubmit = (e) => {
    e.preventDefault();
    saveToHistory('pit', pitData);
  };

  if (!currentUser) {
    return (
      <div style={styles.container}>
        <div style={{ maxWidth: '400px', margin: '40px auto', ...styles.card, textAlign: 'center' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: '0 0 20px 0' }}>HUSKY<span style={{ color: theme.green }}>SCOUT</span></h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div>
              <label style={{ fontSize: '10px', color: theme.muted, display: 'block', textAlign: 'left', marginBottom: '5px' }}>SCOUTER NAME</label>
              {CONFIG.APPROVED_NAMES.length > 0 ? (
                <select style={styles.input} value={loginName} onChange={(e) => setLoginName(e.target.value)}>
                  {CONFIG.APPROVED_NAMES.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              ) : (
                <input type="text" style={styles.input} placeholder="Scouter Name" value={loginName} onChange={(e) => setLoginName(e.target.value)} required />
              )}
            </div>
            <div>
              <label style={{ fontSize: '10px', color: theme.muted, display: 'block', textAlign: 'left', marginBottom: '5px' }}>PASSWORD</label>
              <input type="password" style={styles.input} value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required />
            </div>
            {loginError && <span style={{ color: '#ef4444', fontSize: '12px', fontWeight: 'bold' }}>{loginError}</span>}
            <button type="submit" style={styles.btn}>ACCESS SYSTEM</button>
          </form>
          <div style={{ marginTop: '15px', fontSize: '12px', fontWeight: 'bold' }}>
            {isOnline ? (
              <span style={{ color: theme.green }}>🟢 DEVICE IS ONLINE</span>
            ) : (
              <span style={{ color: '#F59E0B' }}>⚠️ DEVICE IS OFFLINE (Bypassing credentials requires past verification)</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0 }}>HUSKY<span style={{ color: theme.green }}>SCOUT</span></h1>
        <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: theme.muted }}>
          Active: {currentUser} | <span onClick={handleLogout} style={{ color: '#EF4444', cursor: 'pointer', textDecoration: 'underline' }}>Logout</span>
        </p>
        <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 'bold' }}>
          {isOnline ? (
            <span style={{ color: theme.green }}>🟢 ONLINE MODE</span>
          ) : (
            <span style={{ color: '#F59E0B' }}>🔴 OFFLINE MODE (Saving data locally)</span>
          )}
        </div>
      </header>

      <main style={{ maxWidth: '500px', margin: '0 auto' }}>
        {unsyncedCount > 0 && (
          <div style={{ ...styles.card, border: '1px solid #F59E0B', textAlign: 'center', padding: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#F59E0B' }}>
              {unsyncedCount} UNSYNCED RECORDS SAVED LOCALLY
            </span>
            {isOnline && db && (
              <button 
                onClick={() => loadAndSyncHistory(db)} 
                style={{ ...styles.btn, marginTop: '8px', padding: '10px', fontSize: '12px', backgroundColor: '#F59E0B', color: 'black' }}
              >
                SYNC DATA NOW
              </button>
            )}
          </div>
        )}

        {view === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <label style={{ fontSize: '10px', color: theme.green, fontWeight: '800' }}>ACTIVE EVENT</label>
                <label style={{ fontSize: '10px', color: theme.muted, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={manualEventMode} onChange={e => { setManualEventMode(e.target.checked); setSelectedEvent(''); }} style={{ accentColor: theme.green }} />
                  Manual Event Entry
                </label>
              </div>
              
              {manualEventMode ? (
                <input 
                  style={styles.input} 
                  placeholder="Type Event Code (e.g. 2026utwv or custom_offseason)" 
                  value={selectedEvent} 
                  onChange={e => setSelectedEvent(e.target.value)} 
                />
              ) : (
                <div>
                  {events.length > 0 ? (
                    <select style={{ ...styles.input, marginTop: '5px' }} value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)}>
                      {events.map(ev => <option key={ev.key} value={ev.key}>{ev.name}</option>)}
                    </select>
                  ) : (
                    <input style={{ ...styles.input, marginTop: '5px' }} placeholder="Type Event Code (e.g. 2026utwv)" value={selectedEvent} onChange={e => setSelectedEvent(e.target.value)} />
                  )}
                </div>
              )}

              <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                {appMode === 'test' && <span style={{ color: '#F59E0B' }}>⚠️ TEST MODE ACTIVE (Data deletes daily)</span>}
                {appMode === 'preevent' && <span style={{ color: '#3B82F6' }}>📅 PRE-EVENT MODE (Pit scouting only)</span>}
                {appMode === 'active' && <span style={{ color: theme.green }}>🟢 EVENT ACTIVE (All features unlocked)</span>}
              </div>
            </div>
            
            <button 
              onClick={() => { if (appMode !== 'preevent') setView('match'); }} 
              disabled={appMode === 'preevent'}
              style={{ 
                ...styles.btn, 
                backgroundColor: appMode === 'preevent' ? '#334155' : theme.green, 
                color: appMode === 'preevent' ? theme.muted : '#052e16',
                cursor: appMode === 'preevent' ? 'not-allowed' : 'pointer'
              }}
            >
              {appMode === 'preevent' ? 'MATCH SCOUTING (LOCKED)' : 'MATCH SCOUTING'}
            </button>

            <button onClick={() => setView('pit')} style={{ ...styles.btn, backgroundColor: '#3B82F6', color: 'white' }}>PIT SCOUTING</button>

            <button 
              onClick={() => { if (appMode !== 'preevent') setView('picklist'); }} 
              disabled={appMode === 'preevent'}
              style={{ 
                ...styles.btn, 
                backgroundColor: appMode === 'preevent' ? '#334155' : '#8B5CF6', 
                color: appMode === 'preevent' ? theme.muted : 'white',
                cursor: appMode === 'preevent' ? 'not-allowed' : 'pointer'
              }}
            >
              {appMode === 'preevent' ? 'ALLIANCE PICKLIST (LOCKED)' : 'ALLIANCE PICKLIST'}
            </button>

            <button onClick={() => setView('ourMatches')} style={{ ...styles.btn, backgroundColor: '#EC4899', color: 'white' }}>OUR MATCHES (4585)</button>

            <button onClick={() => setView('history')} style={styles.btnOutline}>VIEW ARCHIVE ({scoutedEventsInHistory.length} Events)</button>
          </div>
        )}

        {view === 'match' && (
          <form onSubmit={handleMatchSubmit}>
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
                      onChange={e => setMatchData({ ...matchData, team: String(e.target.value).trim() })}
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
                      onChange={e => setMatchData({ ...matchData, team: String(e.target.value).trim() })}
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
            <button type="submit" style={styles.btn}>SUBMIT & SAVE MATCH</button>
          </form>
        )}

        {view === 'pit' && (
          <form onSubmit={handlePitSubmit}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <button type="button" onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>PIT SCOUTING</span>
            </div>
            <div style={styles.card}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ fontSize: '10px', color: theme.muted }}>TEAM #</label>
                <input type="number" style={styles.input} value={pitData.team} onChange={e => setPitData({ ...pitData, team: String(e.target.value).trim() })} required />
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
            <button type="submit" style={{ ...styles.btn, backgroundColor: '#3B82F6', color: 'white' }}>SUBMIT & SAVE PIT</button>
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

            {previewAiOrder && aiRecommendedOrder.length > 0 && (
              <div style={{ ...styles.card, border: `1px solid #F59E0B`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#F59E0B', display: 'block' }}>PREVIEWING SUGGESTED ORDER</span>
                  <span style={{ fontSize: '11px', color: theme.muted }}>Review recommendations below. Click Approve to save.</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => {
                      setCustomOrders(prev => ({ ...prev, [selectedEvent]: aiRecommendedOrder }));
                      setPreviewAiOrder(false);
                    }} 
                    style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', backgroundColor: theme.green, color: '#052e16', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Approve
                  </button>
                  <button 
                    onClick={() => {
                      setPreviewAiOrder(false);
                      setAiRecommendedOrder([]);
                    }} 
                    style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: 'white', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}

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
                        disabled={index === 0 || previewAiOrder} 
                        onClick={() => moveTeam(index, 'up')} 
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: (index === 0 || previewAiOrder) ? theme.border : 'white', fontWeight: 'bold', cursor: (index === 0 || previewAiOrder) ? 'not-allowed' : 'pointer' }}
                      >
                        ▲
                      </button>
                      <button 
                        type="button"
                        disabled={index === picklist.length - 1 || previewAiOrder} 
                        onClick={() => moveTeam(index, 'down')} 
                        style={{ width: '32px', height: '32px', borderRadius: '6px', border: `1px solid ${theme.border}`, backgroundColor: '#1E293B', color: (index === picklist.length - 1 || previewAiOrder) ? theme.border : 'white', fontWeight: 'bold', cursor: (index === picklist.length - 1 || previewAiOrder) ? 'not-allowed' : 'pointer' }}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...styles.card, marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '14px', fontWeight: '800', color: '#8B5CF6' }}>STRATEGIC SELECTION ADVISOR</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted }}>ALLIANCE FOCUS STRATEGY</label>
                  <select style={{ ...styles.input, marginTop: '5px' }} value={aiStrategy} onChange={e => setAiStrategy(e.target.value)}>
                    <option value="balanced">Complementary / Balanced Alliance</option>
                    <option value="offense">Maximum Offensive Cycling Power</option>
                    <option value="defense">Defensive Guard & Field Control</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted }}>OUR ROBOT SPECS (FOR ALIGNMENT MATRIX)</label>
                  <textarea style={{ ...styles.input, height: '60px', resize: 'none' }} value={ourRobotSpecs} onChange={e => setOurRobotSpecs(e.target.value)} />
                </div>
              </div>
              <button onClick={runRemoteAiAnalysis} disabled={loadingAi} style={{ ...styles.btn, backgroundColor: '#8B5CF6', color: 'white' }}>
                {loadingAi ? 'ANALYZING MATRIX PROFILES...' : 'GENERATE STRATEGIC SUGGESTIONS'}
              </button>
              {aiError && <div style={{ color: '#EF4444', fontSize: '12px', marginTop: '10px', fontWeight: 'bold' }}>{aiError}</div>}
              {aiSuggestions && (
                <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#0F172A', borderRadius: '10px', border: `1px solid ${theme.border}`, maxHeight: '300px', overflowY: 'auto' }}>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', fontSize: '12px', color: theme.text, margin: 0, lineHeight: '1.5' }}>{aiSuggestions}</pre>
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'ourMatches' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: '#EC4899' }}>4585 MATCHES</span>
            </div>
            {ourMatches.length === 0 ? (
              <div style={{ ...styles.card, textAlign: 'center', color: theme.muted }}>No matches loaded for team 4585 at this event.</div>
            ) : (
              ourMatches.map(m => {
                const isRed = m.alliances.red.teams.some(t => String(t.replace(/^frc/, '')).trim() === '4585');
                return (
                  <div key={m.match_number} style={{ ...styles.card, borderLeft: `4px solid ${isRed ? '#EF4444' : '#3B82F6'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 'bold' }}>Match QM {m.match_number}</span>
                      <span style={{ fontSize: '12px', color: isRed ? '#EF4444' : '#3B82F6', fontWeight: 'bold' }}>
                        {isRed ? 'RED ALLIANCE' : 'BLUE ALLIANCE'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#EF44441F', border: '1px solid #EF44443F' }}>
                        <div style={{ fontSize: '10px', color: '#EF4444', fontWeight: 'bold', marginBottom: '4px' }}>RED</div>
                        {m.alliances.red.teams.map(t => {
                          const num = String(t.replace(/^frc/, '')).trim();
                          return (
                            <div key={t} style={{ fontSize: '13px', fontWeight: num === '4585' ? 'bold' : 'normal', color: num === '4585' ? theme.green : 'white' }}>
                              Team {num} {num === '4585' && '★'}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: '6px', borderRadius: '6px', backgroundColor: '#3B82F61F', border: '1px solid #3B82F63F' }}>
                        <div style={{ fontSize: '10px', color: '#3B82F6', fontWeight: 'bold', marginBottom: '4px' }}>BLUE</div>
                        {m.alliances.blue.teams.map(t => {
                          const num = String(t.replace(/^frc/, '')).trim();
                          return (
                            <div key={t} style={{ fontSize: '13px', fontWeight: num === '4585' ? 'bold' : 'normal', color: num === '4585' ? theme.green : 'white' }}>
                              Team {num} {num === '4585' && '★'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {view === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <button onClick={() => setView('menu')} style={{ background: 'none', border: 'none', color: theme.muted, cursor: 'pointer' }}>← Back</button>
              <span style={{ fontWeight: 'bold', color: theme.green }}>ARCHIVE</span>
            </div>
            {scoutedEventsInHistory.length === 0 ? (
              <div style={{ ...styles.card, textAlign: 'center', color: theme.muted }}>No records yet.</div>
            ) : (
              scoutedEventsInHistory.map(eventKey => {
                const eventName = events.find(e => e.key === eventKey)?.name || eventKey.toUpperCase();
                const eventRecords = history.filter(h => h.event === eventKey);
                const matchRecords = eventRecords.filter(h => h.type === 'match');
                const pitRecords = eventRecords.filter(h => h.type === 'pit');

                return (
                  <div key={eventKey} style={{ ...styles.card, marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '18px', color: theme.green, margin: '0 0 15px 0', borderBottom: `1px solid ${theme.border}`, paddingBottom: '8px' }}>
                      {eventName}
                    </h2>
                    
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '14px', color: '#3B82F6', margin: '0 0 10px 0', fontWeight: '900' }}>PIT SCOUTING</h3>
                      {pitRecords.length === 0 ? (
                        <div style={{ fontSize: '12px', color: theme.muted, fontStyle: 'italic' }}>No pit records for this event.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {pitRecords.map(record => (
                            <div key={record.id} style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#0F172A', border: `1px solid ${theme.border}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.muted }}>
                                <span style={{ fontWeight: 'bold', color: '#3B82F6' }}>Team {record.data.team}</span>
                                <span>{record.timestamp}</span>
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '13px' }}>
                                <div>Drivetrain: {record.data.drivetrain}</div>
                                <div>Mechanism: {record.data.mechanism}</div>
                                {record.data.notes && <div style={{ color: theme.muted, marginTop: '4px', fontStyle: 'italic' }}>"{record.data.notes}"</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 style={{ fontSize: '14px', color: theme.green, margin: '0 0 10px 0', fontWeight: '900' }}>MATCH SCOUTING</h3>
                      {matchRecords.length === 0 ? (
                        <div style={{ fontSize: '12px', color: theme.muted, fontStyle: 'italic' }}>No match records for this event.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {matchRecords.map(record => (
                            <div key={record.id} style={{ padding: '12px', borderRadius: '10px', backgroundColor: '#0F172A', border: `1px solid ${theme.border}` }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.muted }}>
                                <span style={{ fontWeight: 'bold', color: theme.green }}>Match {record.data.match} | Team {record.data.team}</span>
                                <span>{record.timestamp}</span>
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '13px' }}>
                                <div>Auto: {record.data.autoPieces} | Teleop: {record.data.teleopPieces} | Climb: {record.data.climb ? 'Yes' : 'No'}</div>
                                <div>Defense Quality: {record.data.defenseQuality} (Fouls: {record.data.defenseFouls})</div>
                                <div style={{ fontWeight: 'bold', color: theme.green, marginTop: '4px' }}>
                                  Est. Score: {calculateScore(record.data.autoPieces, record.data.teleopPieces, record.data.climb)} pts
                                </div>
                                {record.data.notes && <div style={{ color: theme.muted, marginTop: '4px', fontStyle: 'italic' }}>"{record.data.notes}"</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
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