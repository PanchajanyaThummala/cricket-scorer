// Generate random 4-digit PIN
export function generatePIN() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// Generate unique viewer and scorer PINs
export function generateMatchPINs() {
    const viewerPIN = generatePIN();
    let scorerPIN = generatePIN();
    let creatorPIN = generatePIN();

    // Ensure PINs are unique
    while (scorerPIN === viewerPIN) {
        scorerPIN = generatePIN();
    }
    while (creatorPIN === viewerPIN || creatorPIN === scorerPIN) {
        creatorPIN = generatePIN();
    }

    return { viewerPIN, scorerPIN, creatorPIN };
}

// Detect if PIN is viewer or scorer
export function detectPINType(matchData, enteredPIN) {
    if (!matchData) return null;

    if (enteredPIN === matchData.scorerPIN) {
        return 'scorer';
    }
    return 'viewer';
}

// ─── NEW: Run-Rate Calculator Feature ───────────────────────────────────────

/**
 * Calculate Current Run Rate (CRR)
 * @param {number} totalRuns - Runs scored so far
 * @param {number} ballsBowled - Number of legal deliveries bowled
 * @returns {number} Current run rate (runs per over), or 0 if no balls bowled
 * @throws {TypeError} If inputs are not numbers
 */
export function calculateRunRate(totalRuns, ballsBowled) {
    if (typeof totalRuns !== 'number' || typeof ballsBowled !== 'number') {
        throw new TypeError('totalRuns and ballsBowled must be numbers');
    }
    if (ballsBowled <= 0 || totalRuns < 0) return 0;
    const oversBowled = ballsBowled / 6;
    return parseFloat((totalRuns / oversBowled).toFixed(2));
}

/**
 * Calculate Required Run Rate (RRR)
 * @param {number} runsNeeded - Runs still required to win
 * @param {number} ballsRemaining - Legal deliveries remaining
 * @returns {number} Required run rate, or Infinity if no balls remain
 * @throws {TypeError} If inputs are not numbers
 */
export function calculateRequiredRunRate(runsNeeded, ballsRemaining) {
    if (typeof runsNeeded !== 'number' || typeof ballsRemaining !== 'number') {
        throw new TypeError('runsNeeded and ballsRemaining must be numbers');
    }
    if (ballsRemaining <= 0) return Infinity;
    if (runsNeeded <= 0) return 0;
    const oversRemaining = ballsRemaining / 6;
    return parseFloat((runsNeeded / oversRemaining).toFixed(2));
}

/**
 * Determine the match result
 * @param {number} team1Score - Team 1 total runs
 * @param {number} team2Score - Team 2 total runs
 * @param {number} team2Wickets - Team 2 wickets fallen (for win-by-wickets message)
 * @param {number} maxWickets - Max wickets per side (default 10)
 * @returns {object|null} Result object or null for invalid inputs
 * @throws {TypeError} If scores are not numbers
 */
export function getMatchResult(team1Score, team2Score, team2Wickets = 0, maxWickets = 10) {
    if (typeof team1Score !== 'number' || typeof team2Score !== 'number') {
        throw new TypeError('team1Score and team2Score must be numbers');
    }
    if (team1Score < 0 || team2Score < 0) return null;
    if (team2Score > team1Score) {
        const wicketsInHand = maxWickets - team2Wickets;
        return { result: 'team2_wins', margin: wicketsInHand, type: 'wickets' };
    } else if (team1Score > team2Score) {
        const runMargin = team1Score - team2Score;
        return { result: 'team1_wins', margin: runMargin, type: 'runs' };
    }
    return { result: 'tie', margin: 0, type: 'tie' };
}

/**
 * Format balls into overs display string (e.g. 13 balls → "2.1 overs")
 * @param {number} balls
 * @returns {string}
 * @throws {TypeError} If balls is not a number
 */
export function formatOvers(balls) {
    if (typeof balls !== 'number') {
        throw new TypeError('balls must be a number');
    }
    if (balls < 0) return '0.0';
    const overs = Math.floor(balls / 6);
    const remaining = balls % 6;
    return `${overs}.${remaining}`;
}
