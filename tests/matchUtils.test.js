import { 
    calculateRunRate, 
    calculateRequiredRunRate, 
    getMatchResult, 
    formatOvers 
} from '../lib/matchUtils';

// ─── Calculate Run Rate Tests ────────────────────────────────────────────────

// Positive Tests
test('test_calculateRunRate_positive', () => {
    expect(calculateRunRate(120, 60)).toBe(12.00);
});

test('test_calculateRunRate_zero_balls', () => {
    expect(calculateRunRate(100, 0)).toBe(0);
});

test('test_calculateRunRate_negative_runs', () => {
    expect(calculateRunRate(-10, 60)).toBe(0);
});

test('test_calculateRunRate_negative_balls', () => {
    expect(calculateRunRate(100, -10)).toBe(0);
});

// Negative Tests
test('test_calculateRunRate_non_number_inputs', () => {
    expect(() => calculateRunRate('100', '60')).toThrow(TypeError);
});

test('test_calculateRunRate_non_numeric_string', () => {
    expect(() => calculateRunRate('abc', 'xyz')).toThrow(TypeError);
});

// Boundary Tests
test('test_calculateRunRate_boundary_zero_runs', () => {
    expect(calculateRunRate(0, 60)).toBe(0);
});

test('test_calculateRunRate_boundary_zero_balls', () => {
    expect(calculateRunRate(0, 0)).toBe(0);
});

// Edge Tests
test('test_calculateRunRate_edge_case_high_balls', () => {
    expect(calculateRunRate(100, 120)).toBe(5.00);
});

// ─── Calculate Required Run Rate Tests ───────────────────────────────────────

// Positive Tests
test('test_calculateRequiredRunRate_positive', () => {
    expect(calculateRequiredRunRate(50, 30)).toBe(10.00);
});

test('test_calculateRequiredRunRate_zero_balls', () => {
    expect(calculateRequiredRunRate(50, 0)).toBe(Infinity);
});

test('test_calculateRequiredRunRate_negative_runs', () => {
    expect(calculateRequiredRunRate(-10, 30)).toBe(0);
});

// Negative Tests
test('test_calculateRequiredRunRate_non_number_inputs', () => {
    expect(() => calculateRequiredRunRate('50', '30')).toThrow(TypeError);
});

test('test_calculateRequiredRunRate_non_numeric_string', () => {
    expect(() => calculateRequiredRunRate('abc', 'xyz')).toThrow(TypeError);
});

// Edge Tests
test('test_calculateRequiredRunRate_edge_case_high_balls', () => {
    expect(calculateRequiredRunRate(50, 120)).toBe(2.50);
});

// ─── Get Match Result Tests ──────────────────────────────────────────────────

// Positive Tests
test('test_getMatchResult_positive_team1_wins', () => {
    expect(getMatchResult(100, 90, 5)).toEqual({ result: 'team1_wins', margin: 10, type: 'runs' });
});

test('test_getMatchResult_positive_team2_wins', () => {
    expect(getMatchResult(90, 100, 5)).toEqual({ result: 'team2_wins', margin: 5, type: 'wickets' });
});

test('test_getMatchResult_tie', () => {
    expect(getMatchResult(100, 100)).toEqual({ result: 'tie', margin: 0, type: 'tie' });
});

// Negative Tests
test('test_getMatchResult_invalid_scores', () => {
    expect(getMatchResult(-10, 90)).toBeNull();
});

test('test_getMatchResult_non_number_inputs', () => {
    expect(() => getMatchResult('100', '90')).toThrow(TypeError);
});

// Edge Tests
test('test_getMatchResult_edge_case_wickets', () => {
    expect(getMatchResult(100, 90, 10)).toEqual({ result: 'team1_wins', margin: 10, type: 'runs' });
});

// ─── Format Overs Tests ──────────────────────────────────────────────────────

// Positive Tests
test('test_formatOvers_positive', () => {
    expect(formatOvers(13)).toBe('2.1');
});

test('test_formatOvers_zero_balls', () => {
    expect(formatOvers(0)).toBe('0.0');
});

test('test_formatOvers_negative_balls', () => {
    expect(formatOvers(-5)).toBe('0.0');
});

// Negative Tests
test('test_formatOvers_non_number_inputs', () => {
    expect(() => formatOvers('13')).toThrow(TypeError);
});

test('test_formatOvers_non_numeric_string', () => {
    expect(() => formatOvers('abc')).toThrow(TypeError);
});
