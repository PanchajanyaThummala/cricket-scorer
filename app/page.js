'use client';

import { useState, useEffect } from 'react';
import { ref, set, onValue, update } from 'firebase/database';
import { db } from '../lib/firebase';
import { generateMatchPINs, detectPINType } from '../lib/matchUtils';
import './cricket-scorer.css';

export default function CricketScorer() {
  // App mode: 'landing' | 'setup' | 'pinDisplay' | 'join' | 'match'
  const [appMode, setAppMode] = useState('landing');
  const [userMode, setUserMode] = useState(null); // 'creator' | 'viewer' | 'scorer'
  const [matchPINs, setMatchPINs] = useState(null); // { viewerPIN, scorerPIN }
  const [currentMatchPIN, setCurrentMatchPIN] = useState(null); // PIN user joined with
  const [joinPIN, setJoinPIN] = useState('');

  // Game setup state
  const [team1Name, setTeam1Name] = useState('Team 1');
  const [team2Name, setTeam2Name] = useState('Team 2');
  const [totalOvers, setTotalOvers] = useState(10);
  const [extrasScoring, setExtrasScoring] = useState(true);

  // Game state
  const [matchStarted, setMatchStarted] = useState(false);
  const [currentInnings, setCurrentInnings] = useState(1);
  const [matchEnded, setMatchEnded] = useState(false);

  // Team data
  const [team1, setTeam1] = useState({ runs: 0, wickets: 0, completedOvers: 0, currentOverBalls: [], allOvers: [] });
  const [team2, setTeam2] = useState({ runs: 0, wickets: 0, completedOvers: 0, currentOverBalls: [], allOvers: [] });

  // History for undo
  const [history, setHistory] = useState([]);

  // UI state
  const [showHistory, setShowHistory] = useState(false);
  const [showPinDropdown, setShowPinDropdown] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '', type: 'info' });

  // Show toast notification
  const showToast = (message, type = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'info' }), 3000);
  };

  // Get current team data
  const currentTeam = currentInnings === 1 ? team1 : team2;
  const setCurrentTeam = currentInnings === 1 ? setTeam1 : setTeam2;
  const currentTeamName = currentInnings === 1 ? team1Name : team2Name;

  // Firebase real-time sync
  useEffect(() => {
    if (!currentMatchPIN || appMode !== 'match') return;

    const matchRef = ref(db, `matches/${currentMatchPIN}`);
    const unsubscribe = onValue(matchRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setTeam1Name(data.team1Name);
        setTeam2Name(data.team2Name);
        setTotalOvers(data.totalOvers);
        setExtrasScoring(data.extrasScoring);
        if (data.matchStarted !== undefined) setMatchStarted(data.matchStarted);

        // Anti-Revert Protection: Don't go back to Innings 1 if we are already in Innings 2
        // unless it's a manual undo (which we can detect by history) - but for now, simple check.
        if (data.currentInnings > currentInnings) {
          setCurrentInnings(data.currentInnings);
        } else if (data.currentInnings === currentInnings) {
          // Same innings, fine
        } else {
          console.warn("Received stale innings data from Firebase. Ignoring.");
        }

        setMatchEnded(data.matchEnded || false);
        // Sanitize data (Firebase removes empty arrays, preventing crash)
        setTeam1({
          ...data.team1,
          currentOverBalls: data.team1?.currentOverBalls || [],
          allOvers: data.team1?.allOvers || []
        });
        setTeam2({
          ...data.team2,
          currentOverBalls: data.team2?.currentOverBalls || [],
          allOvers: data.team2?.allOvers || []
        });
      }
    });

    return () => unsubscribe();
  }, [currentMatchPIN, appMode]);

  const [pendingExtra, setPendingExtra] = useState(null); // 'wide' | 'noball'
  const [isCreating, setIsCreating] = useState(false);

  // Create new match
  const createMatch = async (e) => {
    if (e) e.preventDefault(); // Prevent any default form submission

    // DEBUGGING: Alert to see if function starts
    // alert("Starting createMatch..."); 

    setIsCreating(true);
    try {
      if (!db) throw new Error("Firebase DB not initialized");

      const pins = generateMatchPINs();

      // Reset Local State completely
      setCurrentInnings(1);
      setMatchEnded(false);
      setHistory([]);
      setTeam1({
        name: team1Name,
        runs: 0,
        wickets: 0,
        completedOvers: 0,
        currentOverBalls: [],
        allOvers: []
      });
      setTeam2({
        name: team2Name,
        runs: 0,
        wickets: 0,
        completedOvers: 0,
        currentOverBalls: [],
        allOvers: []
      });

      const matchData = {
        team1Name,
        team2Name,
        totalOvers: parseInt(totalOvers),
        extrasScoring,
        matchStarted: true,
        currentInnings: 1,
        matchCreated: Date.now(),
        creatorPIN: pins.creatorPIN,
        viewerPIN: pins.viewerPIN,
        scorerPIN: pins.scorerPIN,
        team1: {
          name: team1Name,
          runs: 0,
          wickets: 0,
          completedOvers: 0,
          currentOverBalls: [],
          allOvers: []
        },
        team2: {
          name: team2Name,
          runs: 0,
          wickets: 0,
          completedOvers: 0,
          currentOverBalls: [],
          allOvers: []
        }
      };

      await set(ref(db, `matches/${pins.viewerPIN}`), matchData);
      await set(ref(db, `scorerIndex/${pins.scorerPIN}`), pins.viewerPIN);

      setMatchPINs(pins);
      setCurrentMatchPIN(pins.viewerPIN);
      setUserMode('creator');

      // CRITICAL FIX: Update local state so we exit the Setup Screen loop
      setMatchStarted(true);
      setAppMode('pinDisplay');

      showToast('✅ Match Created!', 'success');
    } catch (error) {
      alert(`ERROR: ${error.message}`);
      console.error("FIREBASE ERROR:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const [isJoining, setIsJoining] = useState(false);

  // Join existing match
  const joinMatch = async () => {
    if (!joinPIN || joinPIN.length !== 4) {
      alert('⚠️ Please enter a valid 4-digit PIN');
      return;
    }

    setIsJoining(true);
    try {
      // Check if it's a scorer PIN first
      const scorerIndexRef = ref(db, `scorerIndex/${joinPIN}`);
      const scorerSnapshot = await new Promise((resolve) => {
        onValue(scorerIndexRef, resolve, { onlyOnce: true });
      });

      let matchPIN = joinPIN;
      let mode = 'viewer';

      if (scorerSnapshot.val()) {
        // It's a scorer PIN, get the actual match PIN
        matchPIN = scorerSnapshot.val();
        mode = 'scorer';
      }

      // Load match data
      const matchRef = ref(db, `matches/${matchPIN}`);
      const matchSnapshot = await new Promise((resolve) => {
        onValue(matchRef, resolve, { onlyOnce: true });
      });

      if (!matchSnapshot.val()) {
        alert('❌ Match not found. Check PIN.');
        return;
      }

      const data = matchSnapshot.val();
      // Pre-sanitize before setting state
      if (data.team1) {
        data.team1.currentOverBalls = data.team1.currentOverBalls || [];
        data.team1.allOvers = data.team1.allOvers || [];
      }
      if (data.team2) {
        data.team2.currentOverBalls = data.team2.currentOverBalls || [];
        data.team2.allOvers = data.team2.allOvers || [];
      }

      setCurrentMatchPIN(matchPIN);
      setUserMode(mode);
      setMatchStarted(true);
      setAppMode('match');
      showToast(`✅ Joined as ${mode}`, 'success');
    } catch (error) {
      alert(`❌ Error: ${error.message}`);
      console.error(error);
    } finally {
      setIsJoining(false);
    }
  };

  const addBall = async (runs, isWicket, isExtra, extraType, scoredRuns = 0) => {
    console.log(`[addBall] Innings: ${currentInnings}, Team: ${currentInnings === 1 ? team1Name : team2Name}, Overs: ${currentTeam.completedOvers}`);

    // Check if innings is over (total overs reached or 10 wickets)
    const legalBallsInCurrentOver = currentTeam.currentOverBalls.filter(b => !b.isExtra).length;
    const totalOversCompleted = currentTeam.completedOvers + (legalBallsInCurrentOver / 6);

    if (totalOversCompleted >= totalOvers || currentTeam.wickets >= 10) {
      showToast('⚠️ Innings complete! Please end innings to continue.', 'warning');
      return;
    }

    // Save history
    // ... existing logic ...
    setHistory([...history, { team1: { ...team1 }, team2: { ...team2 }, currentInnings }]);

    // Deep copy for immutability
    const newTeam = {
      ...currentTeam,
      currentOverBalls: [...currentTeam.currentOverBalls],
      allOvers: [...currentTeam.allOvers]
    };

    newTeam.runs += runs;

    if (isWicket) {
      newTeam.wickets += 1;
    }

    // Store scoredRuns explicitly for display
    newTeam.currentOverBalls.push({ runs, isWicket, isExtra, extraType, scoredRuns });

    // Check if over is complete (6 legal balls)
    const newLegalBalls = newTeam.currentOverBalls.filter(b => !b.isExtra).length;
    if (newLegalBalls === 6) {
      newTeam.allOvers.push([...newTeam.currentOverBalls]);
      newTeam.completedOvers += 1;
      newTeam.currentOverBalls = [];
      showToast(`🏏 Over ${newTeam.completedOvers} complete!`, 'success');
    }

    // Check if innings is complete after this ball
    const newTotalOvers = newTeam.completedOvers + (newTeam.currentOverBalls.filter(b => !b.isExtra).length / 6);

    // Target Check (2nd Innings)
    const targetReached = currentInnings === 2 && newTeam.runs > team1.runs;

    // DEBUG: Log why match is ending
    if (currentInnings === 2) {
      console.log(`[Target Check] Team2 Runs: ${newTeam.runs}, Target: ${team1.runs + 1}, Reached? ${targetReached}`);
    }

    // Auto-switch logic
    if (newTotalOvers >= totalOvers || newTeam.wickets >= 10 || targetReached) {
      console.log("[Match End Triggered] Reason:", {
        Overs: newTotalOvers >= totalOvers,
        Wickets: newTeam.wickets >= 10,
        Target: targetReached
      });

      if (currentInnings === 1) {
        showToast(`🏏 Innings Complete! Switching to ${team2Name}...`, 'info');

        // Critical: Update Firebase with new innings AND state
        await update(ref(db, `matches/${currentMatchPIN}`), {
          team1: newTeam,
          currentInnings: 2
        });

        setTimeout(() => {
          setCurrentInnings(2);
        }, 2000);
      } else {
        // Match End
        await update(ref(db, `matches/${currentMatchPIN}`), {
          team2: newTeam,
          matchEnded: true
        });
      }
    } else {
      // Normal update
      try {
        await update(ref(db, `matches/${currentMatchPIN}`), {
          [`team${currentInnings}`]: newTeam
        });
      } catch (error) {
        console.error('Failed to update:', error);
      }
    }
  };

  const addExtra = (type) => {
    // Stage 1: Trigger modal
    setPendingExtra(type);
  };

  const confirmExtraRuns = (scoredRuns) => {
    // Stage 2: Calculate total and submit
    const penalty = extrasScoring ? 1 : 0;
    const totalRuns = penalty + scoredRuns;
    // Pass scoredRuns as the 5th argument
    addBall(totalRuns, false, true, pendingExtra, scoredRuns);
    setPendingExtra(null);
  };
  // ... (skip down to UI rendering)

  // Helper for rendering ball label
  const getBallLabel = (ball) => {
    if (ball.isExtra) {
      const type = ball.extraType === 'wide' ? 'Wd' : 'Nb';
      // If there are scored runs (e.g., 4 runs off a wide), show "Wd+4"
      if (ball.scoredRuns !== undefined && ball.scoredRuns > 0) {
        return `${type}+${ball.scoredRuns}`;
      }
      return type;
    }
    if (ball.isWicket) return 'W';
    return ball.runs;
  };

  const forceNewOver = async () => {
    if (currentTeam.currentOverBalls.length === 0) return;
    if (confirm('Start new over? Current over incomplete.')) {
      setHistory([...history, { team1: { ...team1 }, team2: { ...team2 }, currentInnings }]);

      const newTeam = {
        ...currentTeam,
        currentOverBalls: [...currentTeam.currentOverBalls],
        allOvers: [...currentTeam.allOvers]
      };

      newTeam.allOvers.push([...newTeam.currentOverBalls]);
      newTeam.completedOvers += 1;
      newTeam.currentOverBalls = [];

      try {
        await update(ref(db, `matches/${currentMatchPIN}`), {
          [`team${currentInnings}`]: newTeam
        });
        showToast('🔄 New over started', 'success');
      } catch (error) {
        console.error('Failed to update:', error);
      }
    }
  };

  const undoLastBall = async () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];

    try {
      await update(ref(db, `matches/${currentMatchPIN}`), {
        team1: last.team1,
        team2: last.team2,
        currentInnings: last.currentInnings,
        matchEnded: false
      });
      setHistory(history.slice(0, -1));
      showToast('↶ Undone', 'info');
    } catch (error) {
      console.error('Failed to undo:', error);
    }
  };

  const endInnings = async () => {
    const newTeam = {
      ...currentTeam,
      currentOverBalls: [...currentTeam.currentOverBalls],
      allOvers: [...currentTeam.allOvers]
    };

    if (newTeam.currentOverBalls.length > 0) {
      newTeam.allOvers.push([...newTeam.currentOverBalls]);
      newTeam.currentOverBalls = [];
    }

    try {
      const updates = {};
      updates[`team${currentInnings}`] = newTeam;

      if (currentInnings === 1) {
        updates.currentInnings = 2;
      } else {
        updates.matchEnded = true;
      }

      await update(ref(db, `matches/${currentMatchPIN}`), updates);

      // Optimistic update to prevent race conditions
      if (currentInnings === 1) {
        setCurrentInnings(2);
        showToast(`🔄 Switch to ${team2Name}`, 'success');
      }
    } catch (error) {
      console.error('Failed to end innings:', error);
    }
  };

  const endMatch = async () => {
    if (confirm('Are you sure you want to end the match?')) {
      await endInnings();
      try {
        await update(ref(db, `matches/${currentMatchPIN}`), {
          matchEnded: true
        });
      } catch (error) {
        console.error('Failed to end match:', error);
      }
    }
  };

  const resetMatch = () => {
    if (confirm('Start a new match? This will return to the setup screen.')) {
      setAppMode('landing');
      setMatchStarted(false);
      setMatchEnded(false);
      setCurrentMatchPIN(null);
      setMatchPINs(null);
      setUserMode(null);
    }
  };

  const getOversDisplay = (team) => {
    if (!team) return "0.0";
    const balls = team.currentOverBalls || [];
    const legalBalls = balls.filter(b => !b.isExtra).length;
    return `${team.completedOvers}.${legalBalls}`;
  };

  const getWinner = () => {
    if (team1.runs > team2.runs) {
      return `🏆 ${team1Name} wins by ${team1.runs - team2.runs} runs!`;
    } else if (team2.runs > team1.runs) {
      return `🏆 ${team2Name} wins by ${10 - team2.wickets} wickets!`;
    }
    return '🤝 Match Tied!';
  };

  // Landing Page
  if (appMode === 'landing') {
    return (
      <div className="container">
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <h1>Cricket Scorer</h1>
            <p className="description" style={{ marginBottom: '2rem' }}>Real-time multiplayer scoring</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button className="start-btn" onClick={() => setAppMode('setup')}>🆕 Create New Match</button>
              <button className="run-btn" onClick={() => setAppMode('join')}>🔗 Join Match</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Setup Modal
  if (appMode === 'setup' && !matchStarted) {
    return (
      <div className="modal active">
        <div className="modal-content">
          <h1>Cricket Scorer</h1>
          <p className="modal-subtitle">Set up your match</p>

          <div className="setup-section">
            <label>Team 1 Name</label>
            <input className="team-input" value={team1Name} onChange={e => setTeam1Name(e.target.value)} placeholder="Team 1" />
          </div>

          <div className="setup-section">
            <label>Team 2 Name</label>
            <input className="team-input" value={team2Name} onChange={e => setTeam2Name(e.target.value)} placeholder="Team 2" />
          </div>

          <div className="setup-section">
            <label>Total Overs</label>
            <div className="overs-input-group">
              <input
                type="number"
                value={totalOvers}
                onChange={e => setTotalOvers(e.target.value === '' ? '' : parseInt(e.target.value))}
                min="1"
                max="50"
              />
            </div>
            <div className="preset-buttons">
              {[5, 10, 20, 50].map(o => (
                <button key={o} className={`preset-btn ${totalOvers === o ? 'active' : ''}`} onClick={() => setTotalOvers(o)}>{o}</button>
              ))}
            </div>
          </div>

          <div className="setup-section">
            <label>Extras Scoring (1 Run Penalty)</label>
            <div className="toggle-container">
              <span className={`toggle-label ${!extrasScoring ? 'active' : ''}`}>Off</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={extrasScoring} onChange={e => setExtrasScoring(e.target.checked)} />
                <span className="toggle-slider"></span>
              </label>
              <span className={`toggle-label ${extrasScoring ? 'active' : ''}`}>On</span>
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
              {extrasScoring ? 'Wides/No-balls add 1 run (+ any scored runs)' : 'Wides/No-balls add 0 runs (+ any scored runs)'}
            </p>
          </div>

          <button
            className="start-btn"
            onClick={createMatch}
            disabled={isCreating}
            style={{ opacity: isCreating ? 0.7 : 1, cursor: isCreating ? 'wait' : 'pointer' }}
          >
            {isCreating ? '⏳ Creating...' : '✓ Start Match'}
          </button>
        </div>
      </div>
    );
  }

  // PIN DISPLAY SCREEN
  if (appMode === 'pinDisplay' && matchPINs) {
    return (
      <div className="container">
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <h1>✅ Match Created!</h1>
            <div style={{ marginBottom: 'var(--space-lg)', padding: 'var(--space-md)', background: 'var(--color-bg-card)', borderRadius: 'var(--radius-md)' }}>
              <p><strong>{team1Name} vs {team2Name}</strong></p>
              <p>{totalOvers} Overs Match</p>
            </div>

            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>👥 VIEWER PIN</h3>
              <div style={{ padding: 'var(--space-lg)', background: 'rgba(70, 130, 180, 0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--color-accent-navy)', marginBottom: 'var(--space-sm)' }}>{matchPINs.viewerPIN}</div>
                <button className="run-btn" onClick={() => { navigator.clipboard.writeText(matchPINs.viewerPIN); showToast('📋 Copied!', 'success'); }} style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>📋 Copy PIN</button>
              </div>
            </div>

            <div style={{ marginBottom: 'var(--space-xl)' }}>
              <h3 style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>🔐 SCORER PIN</h3>
              <div style={{ padding: 'var(--space-lg)', background: 'rgba(212, 175, 55, 0.1)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--color-accent-gold)', marginBottom: 'var(--space-sm)' }}>{matchPINs.scorerPIN}</div>
                <button className="run-btn" onClick={() => { navigator.clipboard.writeText(matchPINs.scorerPIN); showToast('📋 Copied!', 'success'); }} style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}>📋 Copy PIN</button>
              </div>
            </div>

            <button className="start-btn" onClick={() => setAppMode('match')}>Start Scoring →</button>
          </div>
        </div>
      </div>
    );
  }

  // JOIN SCREEN
  if (appMode === 'join') {
    return (
      <div className="container">
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h1>🔗 Join Match</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
              Enter the 4-digit PIN to join
            </p>
            <input
              type="text"
              maxLength={4}
              placeholder="Enter PIN"
              value={joinPIN}
              onChange={(e) => setJoinPIN(e.target.value.replace(/\D/g, ''))}
              style={{
                width: '100%',
                padding: 'var(--space-lg)',
                fontSize: '2rem',
                textAlign: 'center',
                marginBottom: 'var(--space-lg)',
                background: 'var(--color-bg-card)',
                border: '2px solid var(--color-gradient-1)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-primary)'
              }}
            />
            <button
              className="start-btn"
              onClick={joinMatch}
              disabled={joinPIN.length !== 4 || isJoining}
              style={{ opacity: isJoining ? 0.7 : 1, cursor: isJoining ? 'wait' : 'pointer' }}
            >
              {isJoining ? '⏳ Joining...' : 'Join Match'}
            </button>
            <button className="run-btn" onClick={() => { setAppMode('landing'); setJoinPIN(''); }} style={{ marginTop: 'var(--space-md)', width: '100%' }}>← Back</button>
          </div>
        </div>
      </div>
    );
  }

  // Match End Modal
  if (matchEnded) {
    return (
      <div className="modal active">
        <div className="modal-content match-summary">
          <h1>🏆 Match Complete!</h1>

          <div className="final-scores-grid">
            <div className="team-score-card">
              <div className="team-header">{team1Name}</div>
              <div className="team-score">{team1.runs}/{team1.wickets}</div>
              <div className="team-overs">({getOversDisplay(team1)} overs)</div>
            </div>

            <div className="vs-divider">VS</div>

            <div className="team-score-card">
              <div className="team-header">{team2Name}</div>
              <div className="team-score">{team2.runs}/{team2.wickets}</div>
              <div className="team-overs">({getOversDisplay(team2)} overs)</div>
            </div>
          </div>

          <div className="winner-announcement">{getWinner()}</div>

          <div className="innings-comparison">
            <h3>📊 Ball-by-Ball Summary</h3>
            <div className="innings-grid">
              {/* Team 1 Innings */}
              <div className="innings-column">
                <div className="innings-header">{team1Name} Innings</div>
                <div className="innings-stats">
                  {(team1.allOvers.length > 0 || team1.currentOverBalls.length > 0) ? (
                    [...team1.allOvers, ...(team1.currentOverBalls.length > 0 ? [team1.currentOverBalls] : [])].map((over, idx) => (
                      <div key={idx} className="over-summary">
                        <div className="over-label">Over {idx + 1}</div>
                        <div className="over-balls-mini">
                          {over.map((ball, ballIdx) => (
                            <span key={ballIdx} className={`mini-ball ${ball.isExtra ? 'extra' : ball.isWicket ? 'wicket' : `runs-${ball.runs}`}`}>
                              {getBallLabel(ball)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-data">No data</p>
                  )}
                </div>
              </div>

              {/* Team 2 Innings */}
              <div className="innings-column">
                <div className="innings-header">{team2Name} Innings</div>
                <div className="innings-stats">
                  {(team2.allOvers.length > 0 || team2.currentOverBalls.length > 0) ? (
                    [...team2.allOvers, ...(team2.currentOverBalls.length > 0 ? [team2.currentOverBalls] : [])].map((over, idx) => (
                      <div key={idx} className="over-summary">
                        <div className="over-label">Over {idx + 1}</div>
                        <div className="over-balls-mini">
                          {over.map((ball, ballIdx) => (
                            <span key={ballIdx} className={`mini-ball ${ball.isExtra ? 'extra' : ball.isWicket ? 'wicket' : `runs-${ball.runs}`}`}>
                              {getBallLabel(ball)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="no-data">No data</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <button className="start-btn" onClick={resetMatch}>🔄 New Match</button>
        </div>
      </div>
    );
  }

  // LANDING PAGE
  if (appMode === 'landing') {
    return (
      <div className="container">
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px' }}>
            <h1>Cricket Scorer</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xl)' }}>
              Live cricket scoring for you and your friends
            </p>
            <button className="start-btn" onClick={() => setAppMode('setup')}>
              📝 Create New Match
            </button>
            <button className="start-btn" style={{ marginTop: 'var(--space-md)' }} onClick={() => setAppMode('join')}>
              🔗 Join Match
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main App
  const progressPercent = (currentTeam.completedOvers / totalOvers) * 100;

  return (
    <div className="container">
      {/* Toast Notification */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'linear-gradient(135deg, #ef4444, #dc2626)' :
            toast.type === 'warning' ? 'linear-gradient(135deg, #f59e0b, #d97706)' :
              toast.type === 'success' ? 'linear-gradient(135deg, #10b981, #059669)' :
                'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '0.75rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          fontSize: '1rem',
          fontWeight: '600',
          animation: 'slideIn 0.3s ease',
          maxWidth: '300px'
        }}>
          {toast.message}
        </div>
      )}

      {/* Extras Runs Modal */}
      {pendingExtra && (
        <div className="modal-overlay" style={{ zIndex: 5000 }}>
          <div className="modal-content" style={{ maxWidth: '350px' }}>
            <h2>{pendingExtra === 'wide' ? 'Wide Ball' : 'No Ball'}</h2>
            <p style={{ marginBottom: '1rem', color: '#ccc' }}>Any runs scored from this ball?</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
              {[0, 1, 2, 3, 4, 6].map(runs => (
                <button
                  key={runs}
                  className="start-btn"
                  style={{ padding: '1rem', fontSize: '1.2rem', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-gradient-3)' }}
                  onClick={() => confirmExtraRuns(runs)}
                >
                  +{runs}
                </button>
              ))}
            </div>

            <button className="run-btn" style={{ width: '100%' }} onClick={() => setPendingExtra(null)}>Cancel</button>
          </div>
        </div>
      )}

      <header className="app-header">
        <div className="header-left">
          <h1>Cricket Scorer</h1>
          <div className="current-team">{currentTeamName} Batting</div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {/* PIN Dropdown for Creators */}
          {userMode === 'creator' && matchPINs && (
            <div style={{ position: 'relative' }}>
              <button
                className="icon-btn"
                onClick={() => setShowPinDropdown(!showPinDropdown)}
                title="Show Match PINs"
                style={{ background: showPinDropdown ? 'var(--color-bg-card)' : 'transparent' }}
              >
                🔐
              </button>

              {showPinDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '120%',
                  right: 0,
                  background: 'var(--color-bg-card)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  minWidth: '220px',
                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                  zIndex: 100
                }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>👥 VIEWER PIN</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--color-accent-navy)' }}>{matchPINs.viewerPIN}</span>
                      <button onClick={() => { navigator.clipboard.writeText(matchPINs.viewerPIN); showToast('Copied!', 'success') }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>📋</button>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>🔐 SCORER PIN</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 'bold', color: 'var(--color-accent-gold)' }}>{matchPINs.scorerPIN}</span>
                      <button onClick={() => { navigator.clipboard.writeText(matchPINs.scorerPIN); showToast('Copied!', 'success') }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>📋</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <button className="icon-btn" onClick={resetMatch} title="Start New Match">🔄</button>
        </div>
      </header>


      <div className="score-card">
        <div className="score-main">
          <div className="score-display">
            <div className="runs">{currentTeam.runs}</div>
            <div className="separator">/</div>
            <div className="wickets">{currentTeam.wickets}</div>
          </div>
          <div className="score-label">Runs / Wickets</div>
        </div>

        <div className="overs-display">
          <div className="overs-value">
            <span>{getOversDisplay(currentTeam)}</span>
            <span className="separator">/</span>
            <span>{totalOvers}</span>
          </div>
          <div className="overs-label">Overs</div>
        </div>
      </div>

      {/* Team 2 Target Display */}
      {currentInnings === 2 && team2 && (
        <div className="target-display">
          <div className="target-info">
            <div className="target-needed">
              <span className="target-label">Need </span>
              <span className="target-value">{Math.max(0, team1.runs - team2.runs + 1)}</span>
              <span className="target-label"> runs in </span>
              <span className="target-value">
                {Math.max(0, (totalOvers * 6) - (team2.completedOvers * 6 + team2.currentOverBalls.filter(b => !b.isExtra).length))}
              </span>
              <span className="target-label"> balls</span>
            </div>
            <div className="required-rr">
              RRR: {
                (() => {
                  const ballsLeft = Math.max(0, (totalOvers * 6) - (team2.completedOvers * 6 + team2.currentOverBalls.filter(b => !b.isExtra).length));
                  const runsNeeded = Math.max(0, team1.runs - team2.runs + 1);
                  return ballsLeft > 0 ? ((runsNeeded / ballsLeft) * 6).toFixed(2) : '0.00';
                })()
              }
            </div>
          </div>
        </div>
      )}

      <div className="progress-container">
        <div className="progress-bar" style={{ width: `${Math.min(progressPercent, 100)}%` }}></div>
      </div>


      <div className="current-over-section">
        <h3>Current Over</h3>
        <div className="ball-indicators">
          {currentTeam.currentOverBalls.map((ball, i) => (
            <div key={i} className={`ball-indicator ${ball.isExtra ? 'extra' : ball.isWicket ? 'wicket' : `runs-${ball.runs}`}`}>
              {getBallLabel(ball)}
            </div>
          ))}
          {[...Array(6 - currentTeam.currentOverBalls.filter(b => !b.isExtra).length)].map((_, i) => (
            <div key={`empty-${i}`} className="ball-indicator" style={{ opacity: 0.3 }}>•</div>
          ))}
        </div>
      </div>

      {/* Scoring buttons - only for creators and scorers */}
      {(userMode === 'creator' || userMode === 'scorer') && (
        <>
          <div className="scoring-section">
            <h3>Score Runs</h3>
            <div className="run-buttons">
              {[0, 1, 2, 3, 4, 6].map(runs => (
                <button key={runs} className="run-btn" onClick={() => addBall(runs, false, false, null, runs)}>{runs}</button>
              ))}
            </div>

            <button className="wicket-btn" onClick={() => addBall(0, true, false, null, 0)}>
              <span>Wicket</span>
            </button>

            <h3>Extras</h3>
            <div className="extras-buttons">
              <button className="extra-btn" onClick={() => addExtra('wide')}>
                <span className="extra-label">Wide...</span>
                <span className="extra-score">{extrasScoring ? '+1 + ?' : '+0 + ?'}</span>
              </button>
              <button className="extra-btn" onClick={() => addExtra('noball')}>
                <span className="extra-label">No Ball...</span>
                <span className="extra-score">{extrasScoring ? '+1 + ?' : '+0 + ?'}</span>
              </button>
            </div>
            <p className="extras-note">* Extras don't count as legal deliveries</p>
          </div>


          <div className="controls">
            <button className="control-btn" onClick={undoLastBall} disabled={history.length === 0}>↶ Undo</button>
            <button className="control-btn" onClick={forceNewOver} disabled={currentTeam.currentOverBalls.length === 0}>New Over</button>
          </div>

          {currentInnings === 1 && (
            <button className="end-innings-btn" onClick={() => {
              setCurrentInnings(2);
              showToast(`🔄 ${team2Name} batting now!`, 'success');
            }} style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              ▶️ Start 2nd Innings ({team2Name})
            </button>
          )}

          <button className="end-innings-btn" onClick={endMatch} style={{ marginTop: currentInnings === 1 ? '0.5rem' : '0' }}>
            🏁 End Match
          </button>


          <div className="history-section">
            <h3>Match History</h3>
            <button className="history-toggle" onClick={() => setShowHistory(!showHistory)}>
              <span>View Ball-by-Ball History</span>
              <span>{showHistory ? '▲' : '▼'}</span>
            </button>

            {showHistory && (
              <div className="history-content">
                {[{ name: team1Name, data: team1, isCurrent: currentInnings === 1 },
                { name: team2Name, data: team2, isCurrent: currentInnings === 2 }].map(({ name, data, isCurrent }, idx) => (
                  (data.allOvers.length > 0 || (isCurrent && data.currentOverBalls.length > 0)) && (
                    <div key={idx} className="innings-history">
                      <div className="innings-title">{name} - {data.runs}/{data.wickets} ({getOversDisplay(data)} overs)</div>

                      {/* Completed Overs */}
                      {data.allOvers.map((over, overIdx) => (
                        <div key={overIdx} className="over-history">
                          <div className="over-number">Over {overIdx + 1}</div>
                          <div className="over-balls">
                            {over.map((ball, ballIdx) => (
                              <div key={ballIdx} className={`history-ball ${ball.isExtra ? 'extra' : ball.isWicket ? 'wicket' : `runs-${ball.runs}`}`}>
                                {getBallLabel(ball)}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Current Over (if any balls) */}
                      {isCurrent && data.currentOverBalls.length > 0 && (
                        <div className="over-history current-over-highlight">
                          <div className="over-number">Over {data.completedOvers + 1} (In Progress)</div>
                          <div className="over-balls">
                            {data.currentOverBalls.map((ball, ballIdx) => (
                              <div key={ballIdx} className={`history-ball ${ball.isExtra ? 'extra' : ball.isWicket ? 'wicket' : `runs-${ball.runs}`}`}>
                                {getBallLabel(ball)}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Viewers see match info only */}
      {userMode === 'viewer' && (
        <div style={{ padding: 'var(--space-xl)', textAlign: 'center', background: 'rgba(70, 130, 180, 0.1)', borderRadius: 'var(--radius-md)', margin: 'var(--space-xl) 0' }}>
          <p>👁️ <strong>Viewing Mode</strong></p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>You're watching the match live</p>
        </div>
      )}

    </div>
  );
}
