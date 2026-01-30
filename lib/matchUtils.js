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
