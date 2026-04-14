/**
 * BITCOIN AI TRADING DASHBOARD v3.0
 * Configuration, Constants, and Core Utilities
 */

// ==================== API ENDPOINTS ====================

const URL_PRICE = 'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false';
const URL_FNG = 'https://api.alternative.me/fng/';
const URL_BINANCE = 'https://api.binance.com/api/v3/klines';

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];
const TF_LIMITS = {
  '1m': 60,
  '5m': 60,
  '15m': 60,
  '1h': 60,
  '4h': 50,
  '1d': 30
};

// ==================== CONFIGURATION ====================

const CONFIG = {
  ATR_PERIOD: 14,
  SWING_LOOKBACK: 12,
  RSI_PERIOD: 14,
  EMA_FAST: 12,
  EMA_SLOW: 26,
  MACD_SIGNAL: 9,
  SMA_QUICK: 50,
  SMA_LONG: 200,
  
  // ATR multipliers for zone sizing
  BUYZONE_ATR_MULT: 1.8,
  BUYZONE_WIDTH_ATR: 0.9,
  SELLZONE_ATR_MULT: 2.0,
  SELLZONE_WIDTH_ATR: 1.2,
  STOPLOSS_ATR_MULT: 0.8,
  
  // Timeframe weights for multi-TF scoring
  TF_WEIGHTS: {
    '1d': 0.25,
    '4h': 0.30,
    '1h': 0.20,
    '15m': 0.15,
    '5m': 0.10
  },
  
  // Confidence model weights (must sum to 1.0)
  CONFIDENCE_WEIGHTS: {
    trend: 0.25,
    momentum: 0.20,
    macro: 0.15,
    structure: 0.20,
    volatility: 0.10,
    liquidity: 0.10
  },
  
  MAX_CONFIDENCE: 92,
  MIN_CONFIDENCE_TO_TRADE: 85
};

// ==================== INDICATOR FUNCTIONS ====================

/**
 * Relative Strength Index (14-period)
 */
function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50;
  
  const validCloses = closes.map(c => parseFloat(c)).filter(isFinite);
  if (validCloses.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = validCloses.length - period; i < validCloses.length; i++) {
    const change = validCloses[i] - validCloses[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return isFinite(rsi) ? rsi : 50;
}

/**
 * Exponential Moving Average
 */
function computeEMA(closes, period) {
  if (!closes || closes.length === 0) return 0;
  
  const validCloses = closes.map(c => parseFloat(c)).filter(isFinite);
  if (validCloses.length === 0) return 0;
  
  const k = 2 / (period + 1);
  let ema = validCloses[0];
  for (let i = 1; i < validCloses.length; i++) {
    ema = validCloses[i] * k + ema * (1 - k);
  }
  return isFinite(ema) ? ema : 0;
}

/**
 * Simple Moving Average - Returns FULL ARRAY of SMA values per PDF spec
 * SMA = (P_t-n+1 + ... + P_t) / n
 * This calculates SMA for every point in the array, not just the last value
 */
function computeSMA(closes, period) {
  if (!closes || closes.length < period) return [];
  
  const validCloses = closes.map(c => parseFloat(c)).filter(isFinite);
  if (validCloses.length < period) return [];
  
  const smaArray = [];
  
  // For each position from 'period' onwards, calculate SMA
  for (let i = period - 1; i < validCloses.length; i++) {
    let sum = 0;
    // Sum the last 'period' values
    for (let j = i - period + 1; j <= i; j++) {
      sum += validCloses[j];
    }
    const sma = sum / period;
    
    // Only add valid finite values
    if (isFinite(sma) && sma > 0) {
      smaArray.push(sma);
    }
  }
  
  return smaArray;  // Always return array (empty if no valid data)
}

/**
 * Get Last SMA Value (for display purposes)
 */
function getLastSMA(closes, period) {
  const smaArray = computeSMA(closes, period);
  return smaArray.length > 0 ? smaArray[smaArray.length - 1] : 0;
}

/**
 * MACD (12-period EMA, 26-period EMA, 9-period signal)
 */
function computeMACD(closes) {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  
  if (!isFinite(ema12) || !isFinite(ema26)) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }
  
  const macdLine = ema12 - ema26;
  const signalLine = computeEMA([macdLine], 9);
  const histogram = macdLine - signalLine;
  
  return {
    macdLine: isFinite(macdLine) ? macdLine : 0,
    signalLine: isFinite(signalLine) ? signalLine : 0,
    histogram: isFinite(histogram) ? histogram : 0
  };
}

/**
 * Average True Range (14-period) per PDF spec
 * TR = max( (High – Low), |High – PrevClose|, |Low – PrevClose| )
 * ATR = (TR_i-13 + … + TR_i) / 14
 */
function computeATR(klines, period = 14) {
  if (!klines || klines.length < 2) return 0;
  
  // Calculate True Range for each candle
  const trueRanges = [];
  
  for (let i = 1; i < klines.length; i++) {
    const currentHigh = parseFloat(klines[i][2]);      // index 2 = High
    const currentLow = parseFloat(klines[i][3]);       // index 3 = Low
    const previousClose = parseFloat(klines[i - 1][4]); // index 4 = Close
    
    // Ensure all values are valid numbers
    if (!isFinite(currentHigh) || !isFinite(currentLow) || !isFinite(previousClose)) {
      continue;
    }
    
    // TRUE RANGE = max of:
    // 1. High - Low (current range)
    // 2. |High - PrevClose| (gap up)
    // 3. |Low - PrevClose| (gap down)
    const tr = Math.max(
      currentHigh - currentLow,
      Math.abs(currentHigh - previousClose),
      Math.abs(currentLow - previousClose)
    );
    
    // Only add non-negative finite values
    if (isFinite(tr) && tr >= 0) {
      trueRanges.push(tr);
    }
  }
  
  // If we don't have enough True Range values, return 0
  if (trueRanges.length === 0) return 0;
  
  // If we have fewer than 'period' values, average what we have
  if (trueRanges.length < period) {
    const avg = trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
    return isFinite(avg) ? avg : 0;
  }
  
  // Take the last 'period' True Range values and average them
  // ATR = (TR_i-13 + ... + TR_i) / 14
  const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  return isFinite(atr) ? atr : 0;
}

// ==================== ZONE CALCULATION ====================

function computeZones(klines, price, atrVal) {
  if (!klines || klines.length === 0 || !atrVal || !isFinite(price) || price === 0) {
    return {
      buyBottom: price - 500,
      buyTop: price - 200,
      sellLow: price + 500,
      sellHigh: price + 1000,
      stopLoss: price - 1000,
      rr: 1.0
    };
  }
  
  try {
    const closes = klines.map(c => parseFloat(c[4]));
    const lows = klines.map(c => parseFloat(c[3]));
    const highs = klines.map(c => parseFloat(c[2]));
    
    const swingLow = Math.min(...lows.slice(-CONFIG.SWING_LOOKBACK));
    const swingHigh = Math.max(...highs.slice(-CONFIG.SWING_LOOKBACK));
    
    if (!isFinite(swingLow) || !isFinite(swingHigh)) {
      throw new Error('Invalid swing calculations');
    }
    
    const buyBottom = Math.max(swingLow * 1.002, price - atrVal * CONFIG.BUYZONE_ATR_MULT);
    const buyTop = buyBottom + atrVal * CONFIG.BUYZONE_WIDTH_ATR;
    const sellLow = price + atrVal * CONFIG.SELLZONE_ATR_MULT;
    const sellHigh = sellLow + atrVal * CONFIG.SELLZONE_WIDTH_ATR;
    const stopLoss = buyBottom - atrVal * CONFIG.STOPLOSS_ATR_MULT;
    
    if (![buyBottom, buyTop, sellLow, sellHigh, stopLoss].every(isFinite)) {
      throw new Error('Invalid zone calculations');
    }
    
    const rr = buyTop !== stopLoss ? ((sellLow - buyTop) / (buyTop - stopLoss)).toFixed(2) : 0;
    
    return {
      buyBottom: Math.round(buyBottom),
      buyTop: Math.round(buyTop),
      sellLow: Math.round(sellLow),
      sellHigh: Math.round(sellHigh),
      stopLoss: Math.round(stopLoss),
      rr: isFinite(parseFloat(rr)) ? parseFloat(rr) : 1.0
    };
  } catch (e) {
    console.warn('Zone computation error:', e.message);
    return {
      buyBottom: Math.round(price - 500),
      buyTop: Math.round(price - 200),
      sellLow: Math.round(price + 500),
      sellHigh: Math.round(price + 1000),
      stopLoss: Math.round(price - 1000),
      rr: 1.0
    };
  }
}

// ==================== TIMEFRAME SCORING ====================

function scoreTF(klines) {
  if (!klines || klines.length < 20) return 50;
  
  const c = klines.map(k => parseFloat(k[4])).filter(isFinite);
  if (c.length < 20) return 50;
  
  const price = c.at(-1);
  const ema20 = computeEMA(c, 20);
  const ema50 = computeEMA(c, 50) || price;
  const rsi = computeRSI(c, 14);
  
  let score = 50;
  
  // Price vs EMAs
  if (price > ema20) score += 10;
  else score -= 10;
  
  if (price > ema50) score += 10;
  else score -= 10;
  
  // EMA alignment
  if (ema20 > ema50) score += 10;
  else score -= 5;
  
  // RSI scoring
  if (rsi > 50 && rsi < 70) score += 15;
  else if (rsi >= 70) score -= 10;
  else if (rsi < 30) score += 5;
  
  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * Weighted composite score across all timeframes
 */
function computeComposite(tfData) {
  let totalScore = 0;
  let totalWeight = 0;
  
  for (const [tf, weight] of Object.entries(CONFIG.TF_WEIGHTS)) {
    if (tfData[tf] && tfData[tf].length > 0) {
      totalScore += scoreTF(tfData[tf]) * weight;
      totalWeight += weight;
    }
  }
  
  // Normalize by available weight
  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;
}

// ==================== CONFIDENCE MODEL (6-factor) ====================

function computeConfidence(analysis) {
  const {
    trend = 50,
    momentum = 50,
    macro = 50,
    structure = 50,
    volatility = 50,
    liquidity = 50
  } = analysis || {};
  
  // Validate all inputs are finite numbers
  const factors = [trend, momentum, macro, structure, volatility, liquidity];
  if (!factors.every(f => isFinite(f) && f >= 0 && f <= 100)) {
    return 50;
  }
  
  const raw = 
    trend * CONFIG.CONFIDENCE_WEIGHTS.trend +
    momentum * CONFIG.CONFIDENCE_WEIGHTS.momentum +
    macro * CONFIG.CONFIDENCE_WEIGHTS.macro +
    structure * CONFIG.CONFIDENCE_WEIGHTS.structure +
    volatility * CONFIG.CONFIDENCE_WEIGHTS.volatility +
    liquidity * CONFIG.CONFIDENCE_WEIGHTS.liquidity;
  
  const confidence = Math.min(Math.round(raw), CONFIG.MAX_CONFIDENCE);
  
  return isFinite(confidence) ? Math.max(0, confidence) : 50;
}

// ==================== UTILITY FUNCTIONS ====================

function formatPrice(val) {
  if (!isFinite(val)) return '$0';
  return '$' + Math.round(val).toLocaleString();
}

function formatPercent(val) {
  if (!isFinite(val)) return '0.00%';
  return (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
}

function formatLargeNum(val) {
  if (!isFinite(val)) return '0';
  if (val >= 1e9) return (val / 1e9).toFixed(2) + 'B';
  if (val >= 1e6) return (val / 1e6).toFixed(2) + 'M';
  if (val >= 1e3) return (val / 1e3).toFixed(2) + 'K';
  return val.toFixed(0);
}

function safeSet(elementId, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  
  let displayValue = String(value || '');
  if (displayValue === 'NaN' || displayValue === 'null' || displayValue === 'undefined') {
    displayValue = '–';
  }
  
  if (el.textContent !== displayValue) {
    el.textContent = displayValue;
  }
}

function logConsole(message, type = 'info') {
  const consoleEl = document.getElementById('console-output');
  if (!consoleEl) return;
  
  const entry = document.createElement('div');
  entry.className = `console-entry ${type}`;
  
  const timestamp = new Date().toLocaleTimeString();
  const icon = type === 'info' ? 'ℹ' : type === 'success' ? '✓' : type === 'warning' ? '⚠' : '✕';
  
  entry.innerHTML = `<span style="color: #888;">[${timestamp}]</span> ${icon} ${message}`;
  consoleEl.appendChild(entry);
  
  // Auto-scroll to bottom
  consoleEl.scrollTop = consoleEl.scrollHeight;
  
  // Keep max 100 entries
  while (consoleEl.children.length > 100) {
    consoleEl.removeChild(consoleEl.firstChild);
  }
}

function clearConsole() {
  const consoleEl = document.getElementById('console-output');
  if (consoleEl) consoleEl.innerHTML = '';
  logConsole('Console cleared', 'info');
}

function setStatus(isOnline) {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusTxt');
  
  if (dot) {
    dot.className = isOnline ? 'status-dot online' : 'status-dot offline';
  }
  
  if (txt) {
    txt.textContent = isOnline ? '🟢 Live Data' : '🔴 Offline';
  }
}

function getCountdown() {
  const now = Date.now();
  const ms4h = 4 * 3600000;
  const remaining = ms4h - (now % ms4h);
  
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  
  return h + 'h ' + String(m).padStart(2, '0') + 'm ' + String(s).padStart(2, '0') + 's';
}

function toggleReasoning() {
  const panel = document.getElementById('reasoningPanel');
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  }
}

// ==================== SIGNAL HISTORY TRACKING ====================
// Per PDF: "For each signal, store predicted entry/exit/confidence and actual result (hit/loss)"

let _signalHistory = [];  // Global array to track all signals

/**
 * Record a new signal to history
 * Signal object: {
 *   timestamp: Date,
 *   signal: 'BUY'|'SELL'|'HOLD',
 *   confidence: 0-100,
 *   entryZone: { bottom, top },
 *   exitTarget: { low, high },
 *   stopLoss: number,
 *   entryPrice: number,
 *   actualEntry: null (filled on entry),
 *   actualExit: null (filled on exit),
 *   profitLoss: null (filled on exit),
 *   status: 'pending'|'entered'|'closed'|'stopped'
 * }
 */
function recordSignal(analysis, currentPrice) {
  if (!analysis) return null;
  
  const signal = {
    timestamp: new Date(),
    signal: analysis.signal,
    confidence: analysis.confidence,
    compositeScore: analysis.compositeScore,
    entryZone: {
      bottom: analysis.zones.buyBottom,
      top: analysis.zones.buyTop
    },
    exitTarget: {
      low: analysis.zones.sellLow,
      high: analysis.zones.sellHigh
    },
    stopLoss: analysis.zones.stopLoss,
    entryPrice: currentPrice,
    actualEntry: null,
    actualExit: null,
    profitLoss: null,
    profitLossPercent: null,
    status: 'pending'  // pending → entered → closed (or stopped)
  };
  
  _signalHistory.push(signal);
  
  // Keep only last 50 signals (PDF: "keep a history table of last N signals")
  if (_signalHistory.length > 50) {
    _signalHistory.shift();
  }
  
  return signal;
}

/**
 * Update signal with entry execution
 */
function updateSignalEntry(signalIndex, entryPrice) {
  if (signalIndex < 0 || signalIndex >= _signalHistory.length) return false;
  
  _signalHistory[signalIndex].actualEntry = entryPrice;
  _signalHistory[signalIndex].status = 'entered';
  logConsole('Signal #' + (signalIndex + 1) + ' entered at $' + formatPrice(entryPrice), 'info');
  
  return true;
}

/**
 * Update signal with exit execution and profit/loss
 */
function updateSignalExit(signalIndex, exitPrice) {
  if (signalIndex < 0 || signalIndex >= _signalHistory.length) return false;
  
  const sig = _signalHistory[signalIndex];
  if (!sig.actualEntry) return false;  // Can't exit without entry
  
  sig.actualExit = exitPrice;
  sig.profitLoss = exitPrice - sig.actualEntry;
  sig.profitLossPercent = (sig.profitLoss / sig.actualEntry) * 100;
  sig.status = sig.profitLoss >= 0 ? 'closed-profit' : 'closed-loss';
  
  logConsole(
    'Signal #' + (signalIndex + 1) + ' closed: ' + 
    (sig.profitLoss >= 0 ? '+' : '') + sig.profitLoss.toFixed(2) + 
    ' (' + sig.profitLossPercent.toFixed(2) + '%)',
    sig.profitLoss >= 0 ? 'success' : 'warning'
  );
  
  return true;
}

/**
 * Calculate win rate from signal history
 */
function calculateWinRate() {
  if (_signalHistory.length === 0) return { wins: 0, losses: 0, winRate: 0 };
  
  const closedSignals = _signalHistory.filter(s => s.status.includes('closed'));
  if (closedSignals.length === 0) return { wins: 0, losses: 0, winRate: 0 };
  
  const wins = closedSignals.filter(s => s.profitLoss >= 0).length;
  const losses = closedSignals.length - wins;
  const winRate = (wins / closedSignals.length) * 100;
  
  return {
    wins,
    losses,
    winRate: Math.round(winRate),
    total: closedSignals.length
  };
}

/**
 * Get formatted signal history for display
 */
function getSignalHistoryForDisplay(limit = 10) {
  const stats = calculateWinRate();
  const recentSignals = _signalHistory.slice(-limit).reverse();
  
  return {
    stats,
    signals: recentSignals.map((sig, idx) => ({
      id: _signalHistory.length - idx,
      timestamp: sig.timestamp.toLocaleTimeString(),
      signal: sig.signal,
      confidence: sig.confidence + '%',
      entry: sig.entryPrice ? '$' + Math.round(sig.entryPrice) : '–',
      exit: sig.actualExit ? '$' + Math.round(sig.actualExit) : '–',
      pnl: sig.profitLoss ? (sig.profitLoss >= 0 ? '+' : '') + sig.profitLoss.toFixed(2) : '–',
      pnlPercent: sig.profitLossPercent ? sig.profitLossPercent.toFixed(2) + '%' : '–',
      status: sig.status
    }))
  };
}
