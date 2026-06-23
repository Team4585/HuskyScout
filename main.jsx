import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const cBtn = { width: '40px', height: '40px', borderRadius: '10px', border: '1px solid #334155', backgroundColor: '#1E293B', color: 'white', fontWeight: 'bold' };
const cInput = { width: '45px', backgroundColor: 'transparent', border: 'none', color: 'white', textAlign: 'center', fontSize: '18px', fontWeight: '800', outline: 'none' };

const Counter = ({ theme, label, value, onUpdate }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
    <span style={{ fontSize: '14px', fontWeight: '600' }}>{label}</span>
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      <button type="button" onClick={() => onUpdate(Math.max(0, value - 1))} style={cBtn}>-</button>
      <input type="number" value={value} onChange={(e) => onUpdate(parseInt(e.target.value) || 0)} style={cInput} />
      <button type="button" onClick={() => onUpdate(value + 1)} style={{ ...cBtn, backgroundColor: theme.green, color: '#000', border: 'none' }}>+</button>
    </div>
  </div>
);

const HuskyScout = () => {
  const emptyTeam = { 
    team: '', drivetrain: 'Swerve', mechanism: 'Elevator', 
    autoPieces: 0, teleopPieces: 0, climb: false, notes: '' 
  };
  
  const [matchMetadata, setMatchMetadata] = useState({ scouter: '', match: '' });
  const [teamsInMatch, setTeamsInMatch] = useState([ { ...emptyTeam } ]);
  const [history, setHistory] = useState([]); 
  const [searchMatch, setSearchMatch] = useState(''); 
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('husky_history');
    if (saved) {
      try { setHistory(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  const updateMeta = (field, val) => setMatchMetadata(prev => ({ ...prev, [field]: val }));

  const updateTeam = (index, field, val) => {
    const newTeams = [...teamsInMatch];
    newTeams[index][field] = val;
    setTeamsInMatch(newTeams);
  };

  const addTeamSlot = () => setTeamsInMatch([...teamsInMatch, { ...emptyTeam }]);

  const saveToHistory = () => {
    const sessionRecord = { ...matchMetadata, teams: teamsInMatch, timestamp: new Date().toLocaleTimeString() };
    
    setHistory(prevHistory => {
      const exists = prevHistory.findIndex(m => String(m.match) === String(matchMetadata.match));
      
      let updatedHistory;
      if (exists !== -1) {
        updatedHistory = [...prevHistory];
        updatedHistory[exists] = sessionRecord;
      } else {
        updatedHistory = [...prevHistory, sessionRecord];
      }
      
      localStorage.setItem('husky_history', JSON.stringify(updatedHistory));
      return updatedHistory;
    });
    
    setTeamsInMatch([{ ...emptyTeam }]);
    setMatchMetadata({ ...matchMetadata, match: '' });
    setShowQR(false);
  };

  const qrValue = `
HUSKY MASTER REPORT - M${matchMetadata.match}
------------------
${(teamsInMatch || []).map(t => `
TEAM ${t?.team || '???'}:
- ${t?.drivetrain} | ${t?.mechanism}
- Auto: ${t?.autoPieces} | Tele: ${t?.teleopPieces}
- Climb: ${t?.climb ? 'YES' : 'NO'}
- Notes: ${t?.notes || 'None'}
`).join('\n')}
`.trim();

  const foundMatch = history.find(m => String(m.match) === String(searchMatch));

  const theme = { green: '#22C55E', bg: '#0F172A', card: '#1E293B', text: '#F8FAFC', muted: '#94A3B8', border: '#334155' };

  const styles = {
    container: { backgroundColor: theme.bg, minHeight: '100vh', padding: '16px', color: theme.text, fontFamily: 'sans-serif' },
    card: { backgroundColor: theme.card, borderRadius: '16px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.border}` },
    input: { width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: '#0F172A', color: 'white', fontSize: '16px', outline: 'none' },
    pickerBtn: (active) => ({
      padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', flex: 1,
      backgroundColor: active ? theme.green : '#0F172A', color: active ? '#052e16' : 'white', border: active ? `1px solid ${theme.green}` : `1px solid ${theme.border}`
    }),
    submitBtn: { width: '100%', padding: '18px', borderRadius: '12px', border: 'none', backgroundColor: theme.green, color: '#052e16', fontWeight: '900', fontSize: '16px', cursor: 'pointer' }
  };

  return (
    <div style={styles.container}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0 }}>HUSKY<span style={{ color: theme.green }}>SCOUT</span></h1>
      </header>

      <main style={{ maxWidth: '500px', margin: '0 auto' }}>
        
        <div style={{ ...styles.card, border: `1px solid ${theme.green}44` }}>
          <label style={{ fontSize: '10px', fontWeight: '800', color: theme.green }}>HISTORY LOOKUP</label>
          <input style={styles.input} placeholder="Search Match #" value={searchMatch} onChange={(e) => setSearchMatch(e.target.value)} />
          {foundMatch && (
            <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#064E3B', borderRadius: '10px', border: `1px solid ${theme.green}` }}>
              <p style={{ margin: 0, fontSize: '13px' }}><strong>Match {foundMatch.match}</strong>: {foundMatch.teams?.length || 1} teams.</p>
              <button 
                onClick={() => { setMatchMetadata(foundMatch); setTeamsInMatch(foundMatch.teams || [foundMatch]); setSearchMatch(''); setShowQR(true); }} 
                style={{ marginTop: '10px', background: 'white', border: 'none', padding: '8px 12px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
              >View QR</button>
            </div>
          )}
        </div>

        {!showQR ? (
          <form onSubmit={(e) => { e.preventDefault(); setShowQR(true); }}>
            <div style={styles.card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '12px' }}>
                <div><label style={{fontSize: '10px', color: theme.muted}}>SCOUTER</label><input style={styles.input} value={matchMetadata.scouter} onChange={e => updateMeta('scouter', e.target.value)} required /></div>
                <div><label style={{fontSize: '10px', color: theme.muted}}>MATCH #</label><input style={styles.input} type="number" value={matchMetadata.match} onChange={e => updateMeta('match', e.target.value)} required /></div>
              </div>
            </div>

            {teamsInMatch.map((team, idx) => (
              <div key={idx} style={{ ...styles.card, borderLeft: `6px solid ${theme.green}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '900' }}>TEAM {idx + 1}</h3>
                  <input style={{ ...styles.input, width: '120px', border: `1px solid ${theme.green}` }} type="number" placeholder="TEAM #" value={team?.team || ''} onChange={e => updateTeam(idx, 'team', e.target.value)} required />
                </div>
                
                <div style={{ marginBottom: '15px' }}>
                    <label style={{fontSize: '10px', color: theme.muted}}>BOT CONFIG</label>
                    <div style={{ display: 'flex', gap: '5px', marginTop: '5px', marginBottom: '8px' }}>
                        {['Swerve', 'Tank'].map(opt => (
                            <button key={opt} type="button" onClick={() => updateTeam(idx, 'drivetrain', opt)} style={styles.pickerBtn(team?.drivetrain === opt)}>{opt}</button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        {['Arm', 'Elevator', 'Wrist', 'Other'].map(opt => (
                            <button key={opt} type="button" onClick={() => updateTeam(idx, 'mechanism', opt)} style={styles.pickerBtn(team?.mechanism === opt)}>{opt}</button>
                        ))}
                    </div>
                </div>

                <Counter theme={theme} label="Auto" value={team?.autoPieces || 0} onUpdate={v => updateTeam(idx, 'autoPieces', v)} />
                <Counter theme={theme} label="Tele" value={team?.teleopPieces || 0} onUpdate={v => updateTeam(idx, 'teleopPieces', v)} />
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', marginBottom: '15px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '700' }}>Climb?</span>
                  <input type="checkbox" checked={team?.climb || false} onChange={e => updateTeam(idx, 'climb', e.target.checked)} style={{ width: '24px', height: '24px', accentColor: theme.green }} />
                </div>

                <textarea style={{ ...styles.input, fontSize: '14px', height: '60px', resize: 'none' }} placeholder="Notes..." value={team?.notes || ''} onChange={e => updateTeam(idx, 'notes', e.target.value)} />
              </div>
            ))}

            <button type="button" onClick={addTeamSlot} style={{ ...styles.submitBtn, backgroundColor: 'transparent', border: `2px dashed ${theme.border}`, color: theme.muted, marginBottom: '15px' }}>+ ADD TEAM</button>
            <button type="submit" style={styles.submitBtn}>GENERATE QR</button>
          </form>
        ) : (
          <div style={{ ...styles.card, textAlign: 'center' }}>
            <h3 style={{ color: theme.green }}>MATCH {matchMetadata.match} QR</h3>
            <div style={{ backgroundColor: 'white', padding: '12px', borderRadius: '12px', display: 'inline-block', marginBottom: '20px' }}>
              <QRCodeSVG value={qrValue} size={280} level="L" includeMargin={true} />
            </div>
            <button onClick={() => setShowQR(false)} style={{ ...styles.submitBtn, backgroundColor: 'transparent', color: theme.green, border: `2px solid ${theme.green}`, marginBottom: '10px' }}>EDIT</button>
            <button onClick={saveToHistory} style={{ ...styles.submitBtn, backgroundColor: 'white', color: 'black' }}>ARCHIVE (OVERRIDES OLD)</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default HuskyScout;
