/**
 * BITCOIN AI TRADING DASHBOARD v3.0
 * Master Application Logic - FULLY FIXED
 */

// ==================== GLOBAL STATE ====================
let _chart = null;
let _currentTF = '4h';
let _isAnalyzing = false;
let _lastPrice = 45000; // Fallback price
let _cachedKlines = {}; // Cache klines data
let _lastAnalysis = null; // Cache last good analysis

// ==================== ASYNC DATA FETCHING ====================

/**
 * Fetch BTC price with robust fallback
 */
async function fetchPrice() {
  try {
    logConsole('📡 Fetching price from CoinGecko...', 'info');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const r = await fetch(URL_PRICE, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!r.ok) throw new Error('HTTP ' + r.status);
    
    const d = await r.json();
    const md = d.market_data;
    
    const priceData = {
      price: md.current_price.usd || 45000,
      change24h: md.price_change_percentage_24h || 0,
      high24h: md.high_24h.usd || 46000,
      low24h: md.low_24h.usd || 44000,
      marketCap: md.market_cap.usd || 900e9,
      volume24h: md.total_volume.usd || 30e9
    };
    
    _lastPrice = priceData.price;
    logConsole('✓ Price: $' + formatPrice(priceData.price), 'success');
    setStatus(true);
    return priceData;
  } catch (e) {
    logConsole('⚠ Price fetch failed (' + e.message + '), using fallback', 'warning');
    setStatus(false);
    // Return stable fallback
    return {
      price: _lastPrice,
      change24h: 0,
      high24h: _lastPrice * 1.02,
      low24h: _lastPrice * 0.98,
      marketCap: 900e9,
      volume24h: 30e9
    };
  }
}

/**
 * Fetch Fear & Greed Index
 */
async function fetchFearGreed() {
  try {
    const r = await fetch(URL_FNG);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    
    const d = await r.json();
    const value = parseInt(d.data[0].value) || 50;
    return {
      value: value,
      label: d.data[0].value_classification || 'Neutral'
    };
  } catch (e) {
    logConsole('⚠ Fear & Greed fetch failed', 'warning');
    return { value: 50, label: 'Neutral' };
  }
}

/**
 * Fetch klines from Binance with timeout
 */
async function fetchKlines(tf, limit = 60) {
  try {
    const url = URL_BINANCE + '?symbol=BTCUSDT&interval=' + tf + '&limit=' + limit;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!r.ok) throw new Error('HTTP ' + r.status);
    
    const data = await r.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('No data in response');
    }
    
    // Cache successful fetch
    _cachedKlines[tf] = data;
    logConsole('✓ Klines(' + tf + '): ' + data.length + ' candles', 'success');
    return data;
  } catch (e) {
    logConsole('⚠ Klines(' + tf + '): ' + e.message, 'warning');
    // Return cached data if available
    if (_cachedKlines[tf]) {
      logConsole('Using cached ' + tf + ' data', 'info');
      return _cachedKlines[tf];
    }
    return [];
  }
}

/**
 * Fetch all timeframes in parallel
 */
async function fetchAllTimeframes() {
  logConsole('Fetching all timeframes in parallel...', 'info');
  
  const results = await Promise.allSettled([
    fetchKlines('5m', 60),
    fetchKlines('1h', 60),
    fetchKlines('4h', 50),
    fetchKlines('1d', 30)
  ]);
  
  const tfs = ['5m', '1h', '4h', '1d'];
  const tfData = {};
  
  for (let i = 0; i < tfs.length; i++) {
    const tf = tfs[i];
    if (results[i].status === 'fulfilled') {
      tfData[tf] = results[i].value;
    } else {
      tfData[tf] = _cachedKlines[tf] || [];
    }
  }
  
  return tfData;
}

// ==================== CHART DATA TRANSFORMATION ====================

/**
 * Convert Binance klines to OHLC format for Chart.js
 * Binance: [time, open, high, low, close, volume, ...]
 * OHLC: {x: time, o: open, h: high, l: low, c: close}
 */
function klinesToOHLC(klines) {
  if (!Array.isArray(klines) || klines.length === 0) {
    logConsole('⚠ klinesToOHLC: Empty or invalid klines', 'warning');
    return [];
  }
  
  try {
    return klines.map(k => {
      if (!Array.isArray(k) || k.length < 5) return null;
      return {
        x: k[0],  // timestamp
        o: parseFloat(k[1]),  // open
        h: parseFloat(k[2]),  // high
        l: parseFloat(k[3]),  // low
        c: parseFloat(k[4])   // close
      };
    }).filter(p => p !== null);
  } catch (e) {
    logConsole('ERROR in klinesToOHLC: ' + e.message, 'error');
    return [];
  }
}

/**
 * Compute SMA data points - Now handles ARRAY return from computeSMA()
 * Per PDF spec: "SMA = (P_t-n+1 + ... + P_t) / n"
 */
function computeSMAData(klines, period) {
  try {
    if (!Array.isArray(klines) || klines.length < period) {
      return [];
    }
    
    // Extract closes and times
    const closes = klines.map(k => parseFloat(k[4]));
    const times = klines.map(k => k[0]);
    
    // Get SMA array - now properly returns full array
    const smaValues = computeSMA(closes, period);
    
    // Defensive check - ensure smaValues is array
    if (!Array.isArray(smaValues)) {
      logConsole('⚠ SMA computation returned non-array: ' + typeof smaValues, 'warning');
      return [];
    }
    
    // Convert to [x, y] points for Chart.js
    // Per PDF: "SMA would be a second dataset with mode line on the same time axis"
    const result = [];
    const startIdx = klines.length - smaValues.length;  // Align SMA with klines
    
    for (let i = 0; i < smaValues.length && i + startIdx < times.length; i++) {
      const val = smaValues[i];
      if (typeof val === 'number' && val > 0 && !isNaN(val)) {
        result.push({
          x: times[i + startIdx],
          y: val
        });
      }
    }
    
    logConsole('✓ SMA(' + period + '): ' + result.length + ' points', 'success');
    return result;
  } catch (e) {
    logConsole('ERROR in computeSMAData: ' + e.message, 'error');
    return [];  // Always return array, never undefined
  }
}

// ==================== CHART RENDERING ====================

/**
 * Render or update candlestick chart - CRITICAL FIX
 * Uses smooth update instead of destroy/recreate
 */
async function renderCandleChart(klines, zones) {
  try {
    const canvas = document.getElementById('priceChart');
    if (!canvas) {
      logConsole('ERROR: Chart canvas #priceChart not found', 'error');
      return false;
    }
    
    logConsole('Preparing chart data...', 'info');
    
    // Transform data
    const ohlc = klinesToOHLC(klines);
    if (ohlc.length === 0) {
      logConsole('ERROR: No valid OHLC data', 'error');
      return false;
    }
    
    const sma50Data = computeSMAData(klines, 50);
    const sma200Data = computeSMAData(klines, 200);
    
    logConsole('OHLC: ' + ohlc.length + ' | SMA50: ' + sma50Data.length + ' | SMA200: ' + sma200Data.length, 'info');
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      logConsole('ERROR: Cannot get canvas 2D context', 'error');
      return false;
    }
    
    // Prepare datasets
    const datasets = [
      {
        type: 'candlestick',
        label: 'BTC/USD',
        data: ohlc,
        color: {
          up: '#00e676',
          down: '#ff5252',
          unchanged: '#888'
        },
        borderColor: {
          up: '#00e676',
          down: '#ff5252',
          unchanged: '#888'
        }
      },
      {
        type: 'line',
        label: 'SMA 50',
        data: sma50Data,
        borderColor: '#ffd740',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true
      },
      {
        type: 'line',
        label: 'SMA 200',
        data: sma200Data,
        borderColor: '#448aff',
        borderWidth: 1.5,
        borderDash: [9, 4],
        pointRadius: 0,
        tension: 0,
        fill: false,
        spanGaps: true
      }
    ];
    
    if (_chart) {
      // SMOOTH UPDATE - don't destroy
      logConsole('Updating chart smoothly...', 'info');
      _chart.data.datasets = datasets;
      _chart.update('none');  // Update without animation
    } else {
      // First creation
      logConsole('Creating new chart instance...', 'info');
      _chart = new Chart(ctx, {
        type: 'candlestick',
        data: { datasets: datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          plugins: {
            legend: {
              display: true,
              labels: {
                color: '#ccc',
                font: { size: 11, weight: '500' },
                padding: 15,
                usePointStyle: true
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(0,0,0,0.8)',
              titleColor: '#fff',
              bodyColor: '#ccc',
              borderColor: '#3fb950',
              borderWidth: 1,
              padding: 10,
              displayColors: true
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'hour',
                displayFormats: { hour: 'HH:mm' }
              },
              ticks: { color: '#888', maxTicksLimit: 8 },
              grid: { color: 'rgba(255,255,255,0.05)' }
            },
            y: {
              position: 'right',
              ticks: {
                color: '#888',
                callback: function(v) {
                  return '$' + (v >= 1000 ? (v/1000).toFixed(0) + 'K' : v.toFixed(0));
                }
              },
              grid: { color: 'rgba(255,255,255,0.05)' }
            }
          }
        }
      });
    }
    
    logConsole('✓ Chart rendered successfully', 'success');
    return true;
  } catch (e) {
    logConsole('ERROR renderChart: ' + e.message, 'error');
    console.error(e);
    return false;
  }
}

// ==================== AI ENGINE ====================

/**
 * Run AI analysis across all timeframes
 * Per PDF & PDF spec: Records signal predictions with entry/exit/confidence
 */
function runAIEngine(tfData, priceData) {
  try {
    if (!priceData || !priceData.price || priceData.price <= 0) {
      logConsole('ERROR: Invalid price data for AI', 'error');
      return null;
    }
    
    const price = priceData.price;
    logConsole('🤖 Running AI Engine with 6-Factor Model...', 'info');
    
    // Get multi-timeframe data
    const klines5m = tfData['5m'] || [];
    const klines1h = tfData['1h'] || [];
    const klines4h = tfData['4h'] || [];
    const klines1d = tfData['1d'] || [];
    
    if (klines4h.length === 0) {
      logConsole('⚠ No 4h data for AI analysis', 'warning');
      return null;
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 1: TREND SCORE (25% weight)
    // Analyze the overall trend across multiple timeframes
    // ═════════════════════════════════════════════════════════════════════════════════
    const compositeScore = computeComposite(tfData);
    
    // Multi-timeframe trend confirmation
    const closes1d = klines1d.length > 0 ? klines1d.map(k => parseFloat(k[4])) : [];
    const closes4h = klines4h.map(k => parseFloat(k[4]));
    const closes1h = klines1h.length > 0 ? klines1h.map(k => parseFloat(k[4])) : [];
    
    const sma50_1d = getLastSMA(closes1d, 50);
    const sma200_1d = getLastSMA(closes1d, 200);
    const ema12_4h = computeEMA(closes4h, 12);
    const ema26_4h = computeEMA(closes4h, 26);
    
    let trendScore = 50;
    if (compositeScore > 65) {
      if (closes1d.length > 0 && closes1d[closes1d.length - 1] > sma50_1d && sma50_1d > sma200_1d) {
        trendScore = 90;  // Strong uptrend confirmed across timeframes
      } else if (ema12_4h > ema26_4h) {
        trendScore = 75;  // Intermediate uptrend
      } else {
        trendScore = 60;
      }
    } else if (compositeScore < 45) {
      if (closes1d.length > 0 && closes1d[closes1d.length - 1] < sma50_1d && sma50_1d < sma200_1d) {
        trendScore = 15;  // Strong downtrend
      } else if (ema12_4h < ema26_4h) {
        trendScore = 30;  // Intermediate downtrend
      } else {
        trendScore = 40;
      }
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 2: MOMENTUM SCORE (20% weight)
    // RSI, MACD, rate of change
    // ═════════════════════════════════════════════════════════════════════════════════
    const rsi14 = computeRSI(closes4h, 14);
    const macd = computeMACD(closes4h);
    
    let momentumScore = 50;
    if (rsi14 > 70) {
      momentumScore = 30;  // Overbought - pullback risk
    } else if (rsi14 > 60) {
      momentumScore = 70;  // Strong momentum
    } else if (rsi14 > 50) {
      momentumScore = 65;  // Healthy momentum
    } else if (rsi14 > 40) {
      momentumScore = 45;  // Weak momentum
    } else if (rsi14 < 30) {
      momentumScore = 70;  // Oversold - bounce risk
    } else {
      momentumScore = 35;  // Weak momentum downside
    }
    
    // MACD confirmation
    if (macd.macdLine > macd.signalLine && macd.histogram > 0) {
      momentumScore = Math.min(100, momentumScore + 15);
    } else if (macd.macdLine < macd.signalLine && macd.histogram < 0) {
      momentumScore = Math.max(0, momentumScore - 15);
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 3: MACRO SCORE (15% weight)
    // Fear & Greed Index, overall market sentiment
    // ═════════════════════════════════════════════════════════════════════════════════
    let macroScore = priceData.fearGreedScore || 50;
    // Fear & Greed is already on 0-100 scale
    // Extreme Fear (0-25) = contrarian bullish
    // Fear (25-45) = bearish
    // Neutral (45-55) = neutral
    // Greed (55-75) = bullish
    // Extreme Greed (75-100) = contrarian bearish
    
    if (macroScore < 25 || macroScore > 75) {
      macroScore = 50;  // Extreme readings are contrarian, neutral for now
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 4: STRUCTURE SCORE (20% weight)
    // Swing highs/lows, support/resistance, breakouts
    // ═════════════════════════════════════════════════════════════════════════════════
    const lows4h = klines4h.map(k => parseFloat(k[3]));
    const highs4h = klines4h.map(k => parseFloat(k[2]));
    
    const last20Lows = lows4h.slice(-20);
    const last20Highs = highs4h.slice(-20);
    const recent20Low = Math.min(...last20Lows);
    const recent20High = Math.max(...last20Highs);
    const currentPrice = closes4h[closes4h.length - 1];
    
    let structureScore = 50;
    const supportDistance = ((currentPrice - recent20Low) / currentPrice) * 100;
    const resistanceDistance = ((recent20High - currentPrice) / currentPrice) * 100;
    
    if (supportDistance > resistanceDistance * 1.5) {
      structureScore = 75;  // Closer to support
    } else if (resistanceDistance > supportDistance * 1.5) {
      structureScore = 30;  // Closer to resistance
    } else {
      structureScore = 50;  // Mid-range
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 5: VOLATILITY SCORE (10% weight)
    // ATR, standard deviation - too high or too low is risk
    // ═════════════════════════════════════════════════════════════════════════════════
    const atrVal = computeATR(klines4h) || (price * 0.015);
    const atrPercent = (atrVal / price) * 100;
    
    let volatilityScore = 50;
    if (atrPercent > 3) {
      volatilityScore = 40;  // Too volatile
    } else if (atrPercent > 2) {
      volatilityScore = 60;  // Healthy volatility
    } else if (atrPercent > 1) {
      volatilityScore = 70;  // Good volatility for trading
    } else {
      volatilityScore = 30;  // Too low, potential breakout risk
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // FACTOR 6: LIQUIDITY SCORE (10% weight)
    // Trading volume, order book depth assessment
    // ═════════════════════════════════════════════════════════════════════════════════
    let liquidityScore = 50;
    if (priceData.volume24h > 30e9) {
      liquidityScore = 85;  // Excellent liquidity
    } else if (priceData.volume24h > 25e9) {
      liquidityScore = 75;
    } else if (priceData.volume24h > 20e9) {
      liquidityScore = 65;
    } else if (priceData.volume24h > 15e9) {
      liquidityScore = 55;
    } else if (priceData.volume24h > 10e9) {
      liquidityScore = 40;
    } else {
      liquidityScore = 25;  // Low liquidity
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // COMPUTE WEIGHTED CONFIDENCE
    // ═════════════════════════════════════════════════════════════════════════════════
    const factors = {
      trend: trendScore,
      momentum: momentumScore,
      macro: macroScore,
      structure: structureScore,
      volatility: volatilityScore,
      liquidity: liquidityScore
    };
    
    const confidence = computeConfidence(factors);
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // GENERATE SIGNAL & STRENGTH
    // ═════════════════════════════════════════════════════════════════════════════════
    let signal = 'HOLD';
    if (trendScore > 70 && momentumScore > 55 && confidence > 65) {
      signal = 'BUY';
    } else if (trendScore < 35 && momentumScore < 45 && confidence > 65) {
      signal = 'SELL';
    }
    
    const strength = confidence >= 85 ? 'VERY STRONG' :
                    confidence >= 75 ? 'STRONG' :
                    confidence >= 60 ? 'MODERATE' :
                    confidence >= 45 ? 'WEAK' : 'VERY WEAK';
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // COMPUTE TRADE ZONES
    // ═════════════════════════════════════════════════════════════════════════════════
    const zones = computeZones(klines4h, price, atrVal);
    
    logConsole('Signal: ' + signal + ' | Confidence: ' + confidence + '% | Strength: ' + strength, 'success');
    logConsole('Trend:' + trendScore + '% | Momentum:' + momentumScore + '% | Macro:' + macroScore + '% | Vol:' + volatilityScore + '%', 'info');
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // BUILD ANALYSIS OBJECT
    // ═════════════════════════════════════════════════════════════════════════════════
    const analysis = {
      compositeScore,
      confidence,
      signal,
      strength,
      zones,
      atrVal,
      rsi14,
      macd,
      trendScore,
      momentumScore: momentumScore,
      macroScore,
      structureScore,
      volatilityScore,
      liquidityScore,
      // For compatibility with UI
      factorTrend: trendScore,
      factorMomentum: momentumScore,
      factorMacro: macroScore,
      factorStructure: structureScore,
      factorVol: volatilityScore,
      factorLiq: liquidityScore
    };
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // SIGNAL HISTORY TRACKING per PDF Section "Signal History"
    // "For each signal, store predicted entry/exit/confidence and actual result (hit/loss)"
    // ═════════════════════════════════════════════════════════════════════════════════
    const newSignal = recordSignal(analysis, price);
    if (newSignal) {
      logConsole(
        '📊 Signal #' + _signalHistory.length + ' recorded: ' +
        signal + ' @ Confidence ' + confidence + '%',
        'info'
      );
      
      // Display current win rate stats
      const stats = calculateWinRate();
      if (stats.total > 0) {
        logConsole(
          '📈 Track Record: ' + stats.wins + '/' + stats.total + 
          ' (' + stats.winRate + '% win rate)',
          'info'
        );
      }
    }
    
    return analysis;
  } catch (e) {
    logConsole('ERROR in runAIEngine: ' + e.message, 'error');
    console.error(e);
    return null;
  }
}

// ==================== MASTER INITIALIZATION ====================

/**
 * Master initialization with proper waterfall and error recovery
 */
async function initDashboard() {
  try {
    if (_isAnalyzing) {
      logConsole('⏳ Analysis already in progress', 'warning');
      return;
    }
    
    _isAnalyzing = true;
    logConsole('╔════════════════════════════════════╗', 'info');
    logConsole('║    DASHBOARD INITIALIZATION        ║', 'info');
    logConsole('╚════════════════════════════════════╝', 'info');
    
    // STEP 1: Fetch price
    logConsole('STEP 1/6: Fetching price...', 'info');
    const priceData = await fetchPrice();
    if (!priceData) {
      logConsole('❌ CRITICAL: Cannot fetch price data', 'error');
      _isAnalyzing = false;
      return;
    }
    
    // Update ticker display
    safeSet('price', formatPrice(priceData.price));
    safeSet('high24h', formatPrice(priceData.high24h));
    safeSet('low24h', formatPrice(priceData.low24h));
    safeSet('marketCap', formatLargeNum(priceData.marketCap));
    safeSet('volume24h', formatLargeNum(priceData.volume24h));
    
    const changeEl = document.getElementById('change24hSpan');
    if (changeEl) {
      changeEl.textContent = formatPercent(priceData.change24h);
      changeEl.style.color = priceData.change24h >= 0 ? '#3fb950' : '#f85149';
    }
    
    // STEP 2: Fetch Fear & Greed
    logConsole('STEP 2/6: Fetching Fear & Greed..', 'info');
    const fng = await fetchFearGreed();
    safeSet('fearGreed', fng.value);
    priceData.fearGreedScore = fng.value;
    
    // STEP 3: Fetch all timeframes
    logConsole('STEP 3/6: Fetching all timeframes...', 'info');
    const tfData = await fetchAllTimeframes();
    
    const validTFs = Object.entries(tfData).filter(([tf, kl]) => kl.length > 20);
    if (validTFs.length === 0) {
      logConsole('❌ No valid timeframe data received', 'error');
      _isAnalyzing = false;
      return;
    }
    logConsole('✓ Loaded ' + validTFs.length + ' timeframes', 'success');
    
    // STEP 4: Render chart
    logConsole('STEP 4/6: Rendering chart...', 'info');
    const klines4h = tfData['4h'];
    if (klines4h.length > 0) {
      const atrVal = computeATR(klines4h) || (priceData.price * 0.015);
      const zones = computeZones(klines4h, priceData.price, atrVal);
      const success = await renderCandleChart(klines4h, zones);
      if (!success) {
        logConsole('⚠ Chart render failed, continuing without chart', 'warning');
      }
    }
    
    // STEP 5: Run AI Engine
    logConsole('STEP 5/6: Running AI Engine...', 'info');
    const analysis = runAIEngine(tfData, priceData);
    if (!analysis) {
      logConsole('❌ AI Engine failed', 'error');
      _isAnalyzing = false;
      return;
    }
    _lastAnalysis = analysis;
    
    // STEP 6: Update UI
    logConsole('STEP 6/6: Updating UI panels...', 'info');
    updateUI_AllPanels(analysis);
    
    logConsole('╔════════════════════════════════════╗', 'success');
    logConsole('║✓ DASHBOARD READY                   ║', 'success');
    logConsole('╚════════════════════════════════════╝', 'success');
    
    _isAnalyzing = false;
  } catch (e) {
    logConsole('FATAL ERROR: ' + e.message, 'error');
    console.error(e);
    _isAnalyzing = false;
  }
}

// ==================== UI UPDATE FUNCTIONS ====================

function updateUI_AllPanels(analysis) {
  try {
    // Signal badge
    const signalBadge = document.getElementById('signalBadge');
    if (signalBadge) {
      signalBadge.textContent = analysis.signal;
      signalBadge.className = 'signal-badge ' + analysis.signal.toLowerCase();
    }
    
    // Strength badge
    const strengthBadge = document.getElementById('strengthBadge');
    if (strengthBadge) {
      strengthBadge.textContent = analysis.strength;
      strengthBadge.className = 'strength-badge ' + analysis.strength.toLowerCase().replace(' ', '-');
    }
    
    // Confidence gauge with color gradient
    const confPct = document.getElementById('confPct');
    if (confPct) confPct.textContent = analysis.confidence + '%';
    
    const gaugeArc = document.getElementById('gaugeArc');
    if (gaugeArc) {
      const circumference = 2 * Math.PI * 50;
      const strokeDash = (analysis.confidence / 100) * circumference;
      gaugeArc.style.strokeDasharray = strokeDash + ' ' + circumference;
      
      // Color gradient: red → yellow → green
      let color = '#f85149';  // Red for low confidence
      if (analysis.confidence >= 80) color = '#238636';  // Dark green
      else if (analysis.confidence >= 70) color = '#3fb950';  // Green
      else if (analysis.confidence >= 60) color = '#79c0ff';  // Light blue
      else if (analysis.confidence >= 50) color = '#d29922';  // Orange
      else if (analysis.confidence >= 40) color = '#ff8c00';  // Orange-red
      
      gaugeArc.style.stroke = color;
    }
    
    // Primary prediction text
    safeSet('predTxt', analysis.signal + ': Entry @ ' + formatPrice(analysis.zones.buyTop) + ' (' + analysis.confidence + '%)');
    
    // Trade zones with professional formatting
    safeSet('buyBottom', formatPrice(analysis.zones.buyBottom));
    safeSet('buyTop', formatPrice(analysis.zones.buyTop));
    safeSet('sellLow', formatPrice(analysis.zones.sellLow));
    safeSet('sellHigh', formatPrice(analysis.zones.sellHigh));
    
    // Stop loss is slightly below buy zone bottom
    const stopLossPrice = Math.max(
      analysis.zones.stopLoss - analysis.atrVal,
      analysis.zones.buyBottom - (analysis.atrVal * 1.5)
    );
    safeSet('stopLoss', formatPrice(Math.max(100, stopLossPrice)));
    
    // Calculate risk/reward ratio
    const entryToStop = analysis.zones.buyTop - stopLossPrice;
    const targetToEntry = analysis.zones.sellHigh - analysis.zones.buyTop;
    const rrRatio = entryToStop > 0 ? (targetToEntry / entryToStop).toFixed(2) : '0.00';
    safeSet('rrRatio', '1:' + rrRatio);
    
    // Entry type classification
    const entryEl = document.getElementById('entryType');
    if (entryEl) {
      if (analysis.signal === 'HOLD') {
        entryEl.textContent = '⏳ WAIT';
        entryEl.className = 'badge neutral';
      } else if (analysis.confidence >= 85) {
        entryEl.textContent = '🎯 PULLBACK';
        entryEl.className = 'badge strong';
      } else if (analysis.confidence >= 70) {
        entryEl.textContent = '📍 BREAKOUT';
        entryEl.className = 'badge moderate';
      } else {
        entryEl.textContent = '⚠️ RISKY';
        entryEl.className = 'badge weak';
      }
    }
    
    // ═════════════════════════════════════════════════════════════════════════════════
    // MULTI-SCENARIO PREDICTIONS (4 Cards)
    // ═════════════════════════════════════════════════════════════════════════════════
    
    // PRIMARY PREDICTION - Most likely scenario
    const primaryConfidence = analysis.confidence;
    const primaryTarget = analysis.signal === 'BUY' ? 
      analysis.zones.sellLow + (analysis.atrVal * 0.5) : 
      analysis.zones.buyBottom - (analysis.atrVal * 0.5);
    
    safeSet('predPrimaryTitle', analysis.signal === 'BUY' ? '🟢 BULLISH' : '🔴 BEARISH');
    safeSet('predPrimaryLevel', formatPrice(primaryTarget));
    safeSet('predPrimaryConf', primaryConfidence + '%');
    
    const predBar1 = document.getElementById('predPrimaryBar');
    if (predBar1) {
      predBar1.style.width = primaryConfidence + '%';
      predBar1.style.backgroundColor = analysis.signal === 'BUY' ? '#238636' : '#da3633';
    }
    
    // SECONDARY PREDICTION - Reversal scenario
    const secondaryConfidence = Math.max(30, 100 - primaryConfidence);
    const secondaryTarget = analysis.signal === 'BUY' ? 
      analysis.zones.buyBottom - (analysis.atrVal) :
      analysis.zones.sellHigh + (analysis.atrVal);
    
    safeSet('predSecondaryTitle', analysis.signal === 'BUY' ? '⬇️ PULLBACK' : '⬆️ BOUNCE');
    safeSet('predSecondaryLevel', formatPrice(secondaryTarget));
    safeSet('predSecondaryConf', secondaryConfidence + '%');
    
    const predBar2 = document.getElementById('predSecondaryBar');
    if (predBar2) {
      predBar2.style.width = secondaryConfidence + '%';
      predBar2.style.backgroundColor = '#d29922';  // Orange
    }
    
    // WORST CASE - Maximum risk scenario
    const worstCaseTarget = analysis.signal === 'BUY' ? 
      stopLossPrice - analysis.atrVal :
      analysis.zones.sellHigh + (analysis.atrVal * 2);
    const worstCaseProb = Math.min(Math.max(0, 25 - analysis.momentumScore/4), 20);
    
    safeSet('predWorstTitle', analysis.signal === 'BUY' ? '📉 BREAKDOWN' : '📈 RUNAWAY');
    safeSet('predWorstLevel', formatPrice(worstCaseTarget));
    safeSet('predWorstProb', Math.round(worstCaseProb) + '%');
    
    const predBar3 = document.getElementById('predWorstBar');
    if (predBar3) {
      predBar3.style.width = worstCaseProb + '%';
      predBar3.style.backgroundColor = '#da3633';  // Red
    }
    
    // BEST CASE - Maximum profit scenario
    const bestCaseTarget = analysis.signal === 'BUY' ? 
      analysis.zones.sellHigh + (analysis.atrVal * 1.5) :
      stopLossPrice - (analysis.atrVal * 1.5);
    const bestCaseProb = Math.min(analysis.trendScore / 1.5, 40);
    
    safeSet('predBestTitle', analysis.signal === 'BUY' ? '🚀 RALLY' : '⬇️ DROP');
    safeSet('predBestLevel', formatPrice(bestCaseTarget));
    safeSet('predBestProb', Math.round(bestCaseProb) + '%');
    
    const predBar4 = document.getElementById('predBestBar');
    if (predBar4) {
      predBar4.style.width = bestCaseProb + '%';
      predBar4.style.backgroundColor = '#238636';  // Green
    }
    
    // Reasoning with all 6 factors
    updateReasoning(analysis);
  } catch (e) {
    logConsole('ERROR in updateUI_AllPanels: ' + e.message, 'error');
    console.error(e);
  }
}

function updateReasoning(analysis) {
  try {
    // Helper functions for detailed analysis text
    const getTrendText = (score) => {
      if (score > 80) return '⬆ Strong uptrend, EMA stack bullish, higher highs';
      if (score > 65) return '⬆ Intermediate uptrend, bull structure forming';
      if (score > 50) return '→ Consolidating with slight bias higher';
      if (score > 35) return '⬇ Downtrend structure, bear control';
      return '⬇ Strong downtrend, lower lows and lower closes';
    };
    
    const getMomentumText = (score, rsi) => {
      let text = '';
      if (score > 75) text = '📈 Very strong momentum';
      else if (score > 60) text = '📈 Strong momentum building';
      else if (score > 50) text = '📊 Healthy momentum neutral';
      else if (score > 35) text = '📉 Weak momentum declining';
      else text = '📉 Very weak momentum';
      
      if (rsi > 0) {
        text += ` (RSI ${rsi.toFixed(0)})`;
        if (rsi > 70) text += ' - Overbought';
        else if (rsi < 30) text += ' - Oversold';
      }
      return text;
    };
    
    const getVolatilityText = (score) => {
      if (score > 70) return 'Normal volatility, good trade setup';
      if (score > 50) return 'Moderate volatility for trading';
      if (score > 35) return 'High volatility, use wider stops';
      return 'Extreme volatility - wait for calmer setup';
    };
    
    const getLiquidityText = (score) => {
      if (score > 75) return 'Excellent liquidity, tight spreads';
      if (score > 60) return 'Good liquidity, small slippage';
      if (score > 40) return 'Adequate liquidity, use limits';
      return 'Low liquidity - limit orders only';
    };
    
    const getStructureText = (score) => {
      if (score > 70) return 'Close to support, good entry risk/reward';
      if (score > 50) return 'Mid-range between support and resistance';
      return 'Close to resistance, limited upside';
    };
    
    const getMacroText = (score) => {
      if (score > 75) return 'Extreme Greed - contrarian bearish risk';
      if (score > 55) return 'Greed in market - bullish sentiment';
      if (score > 45) return 'Neutral sentiment in market';
      if (score > 25) return 'Fear in market - bearish pressure';
      return 'Extreme Fear - contrarian bullish opportunity';
    };
    
    // Update reasoning panels with detailed analysis
    safeSet('rTrend', getTrendText(analysis.trendScore || 50) + ' (' + (analysis.trendScore || 50) + '%)');
    safeSet('rMomentum', getMomentumText(analysis.momentumScore || 50, analysis.rsi14 || 50));
    safeSet('rVolume', getVolatilityText(analysis.volatilityScore || 50) + ' (ATR: ' + 
            (analysis.atrVal ? (analysis.atrVal / 45000 * 100).toFixed(2) : '0') + '%)');
    safeSet('rMacro', getMacroText(analysis.macroScore || 50));
    safeSet('rStructure', getStructureText(analysis.structureScore || 50));
  } catch (e) {
    logConsole('ERROR in updateReasoning: ' + e.message, 'error');
  }
}

function updateCountdown() {
  try {
    safeSet('countdown', getCountdown());
  } catch (e) {
    // Silent fail for non-critical update
  }
}

function updateClock() {
  try {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    safeSet('live-clock', h + ':' + m + ':' + s);
  } catch (e) {
    // Silent fail
  }
}

// ==================== TIMEFRAME SWITCHING ====================

/**
 * Switch timeframe - updates chart with new data
 */
async function switchTimeframe(tf) {
  try {
    logConsole('Switching to ' + tf + '...', 'info');
    
    const tfMap = { '5M': '5m', '1H': '1h', '4H': '4h', '1D': '1d', '7D': '1d' };
    const limitMap = { '5M': 100, '1H': 60, '4H': 50, '1D': 30, '7D': 90 };
    
    const tfKey = tfMap[tf] || tf.toLowerCase();
    const limit = limitMap[tf] || 60;
    
    const klines = await fetchKlines(tfKey, limit);
    if (klines.length === 0) {
      logConsole('No data available for ' + tf, 'warning');
      return;
    }
    
    // Calculate zones
    const currentPrice = parseFloat(klines[klines.length - 1][4]);
    const atr = computeATR(klines) || (currentPrice * 0.015);
    const zones = computeZones(klines, currentPrice, atr);
    
    // Update chart
    const success = await renderCandleChart(klines, zones);
    if (success) {
      _currentTF = tfKey;
      logConsole('✓ Switched to ' + tf, 'success');
    }
  } catch (e) {
    logConsole('ERROR switchTimeframe: ' + e.message, 'error');
  }
}

// ==================== INITIALIZATION ON PAGE LOAD ====================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    logConsole('═══════════════════════════════════════', 'info');
    logConsole('DOM Content Loaded - Initializing...', 'info');
    logConsole('═══════════════════════════════════════', 'info');
    
    // Register Chart.js plugins
    if (typeof ChartFinancial !== 'undefined') {
      Chart.register(ChartFinancial);
      logConsole('✓ ChartFinancial plugin registered', 'success');
    } else {
      logConsole('⚠ ChartFinancial plugin not found', 'warning');
    }
    
    if (typeof ChartAnnotation !== 'undefined') {
      Chart.register(ChartAnnotation);
      logConsole('✓ ChartAnnotation plugin registered', 'success');
    }
    
    // Timeframe button listeners
    document.querySelectorAll('.tf-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const tf = this.getAttribute('data-tf') || '4H';
        switchTimeframe(tf.toUpperCase());
      });
    });
    
    // Set default active button
    const defaultBtn = document.querySelector('[data-tf="4H"]') || document.querySelector('.tf-btn');
    if (defaultBtn) defaultBtn.classList.add('active');
    
    // Clock updates
    setInterval(updateClock, 1000);
    setInterval(updateCountdown, 1000);
    updateClock();
    updateCountdown();
    
    logConsole('Event listeners configured', 'info');
    
    // MAIN INITIALIZATION
    await initDashboard();
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // REFRESH LOOPS - Per PDF Spec Section "Real-Time Updates & Scheduling"
    // ═══════════════════════════════════════════════════════════════════════════════
    logConsole('Setting up refresh loops per PDF spec...', 'info');
    
    // ───────────────────────────────────────────────────────────────────────────────
    // LOOP 1: EVERY 1 SECOND - Minor UI Refresh (Clock, Gauge Animations)
    // Per PDF: "Every 1 second: Minor UI refresh (e.g. update clocks or gauge animations)"
    // ───────────────────────────────────────────────────────────────────────────────
    setInterval(() => {
      updateClock();
      updateCountdown();
      // Animate gauge in real-time if confidence exists
      if (_lastAnalysis) {
        const gaugeArc = document.getElementById('gaugeArc');
        if (gaugeArc) {
          const circumference = 2 * Math.PI * 50;
          const strokeDash = (_lastAnalysis.confidence / 100) * circumference;
          gaugeArc.style.strokeDasharray = strokeDash + ' ' + circumference;
        }
      }
    }, 1000);  // 1 second
    
    logConsole('✓ LOOP 1: 1-second UI refresh active', 'info');
    
    // ───────────────────────────────────────────────────────────────────────────────
    // LOOP 2: EVERY 30 SECONDS - Price Refresh (Latest Candle)
    // Per PDF: "Every 30 seconds: Fetch the latest price/kline from the API (new incomplete candle)"
    // ───────────────────────────────────────────────────────────────────────────────
    setInterval(async () => {
      logConsole('📡 Price refresh cycle (30s)...', 'info');
      
      const priceData = await fetchPrice();
      if (priceData) {
        // Update ticker
        safeSet('price', formatPrice(priceData.price));
        _lastPrice = priceData.price;  // Update fallback
        
        // Update 24h change with color coding
        const changeEl = document.getElementById('change24hSpan');
        if (changeEl) {
          changeEl.textContent = formatPercent(priceData.change24h);
          changeEl.style.color = priceData.change24h >= 0 ? '#3fb950' : '#f85149';
        }
        
        // Update other price metrics
        safeSet('high24h', formatPrice(priceData.high24h));
        safeSet('low24h', formatPrice(priceData.low24h));
        safeSet('marketCap', formatLargeNum(priceData.marketCap));
        safeSet('volume24h', formatLargeNum(priceData.volume24h));
        
        logConsole('✓ Price updated: $' + formatPrice(priceData.price), 'success');
      }
    }, 30000);  // 30 seconds = 30000 ms
    
    logConsole('✓ LOOP 2: 30-second price refresh active', 'info');
    
    // ───────────────────────────────────────────────────────────────────────────────
    // LOOP 3: EVERY 2 MINUTES - Quick Re-analysis (Reuse Cached Analysis)
    // Optional: Refresh UI without network calls (useful if APIs are rate-limiting)
    // ───────────────────────────────────────────────────────────────────────────────
    setInterval(() => {
      logConsole('🔄 Quick re-analysis cycle (2m)...', 'info');
      
      // Per PDF: "partial updates let us animate indicators smoothly"
      // Reuse _lastAnalysis without fetching new data
      if (_lastAnalysis) {
        updateUI_AllPanels(_lastAnalysis);
        logConsole('✓ UI refreshed with cached analysis', 'info');
      }
    }, 120000);  // 2 minutes = 120000 ms
    
    logConsole('✓ LOOP 3: 2-minute quick refresh active', 'info');
    
    // ───────────────────────────────────────────────────────────────────────────────
    // LOOP 4: EVERY 5 MINUTES - Full Dashboard Refresh
    // Per PDF: "Every 5 minutes: Full refresh: re-fetch history, recompute indicators 
    //          (SMA, ATR), and re-render chart and signals"
    // ───────────────────────────────────────────────────────────────────────────────
    setInterval(async () => {
      logConsole('🔄🔄🔄 FULL REFRESH CYCLE (5 minutes) 🔄🔄🔄', 'info');
      logConsole('Re-fetching: price, Fear&Greed, all timeframe klines...', 'info');
      
      // Run complete initialization waterfall
      // This re-fetches ALL data: price, F&G, klines, recalculates indicators
      await initDashboard();
      
    }, 300000);  // 5 minutes = 300000 ms
    
    logConsole('✓ LOOP 4: 5-minute full refresh active', 'info');
    
    // ═══════════════════════════════════════════════════════════════════════════════
    logConsole('╔════════════════════════════════════════════════════╗', 'success');
    logConsole('║  ALL REFRESH LOOPS ACTIVE                          ║', 'success');
    logConsole('║  1s: Clock+Gauge  |  30s: Price  |  2m: UI  |  5m: Full  ║', 'success');
    logConsole('╚════════════════════════════════════════════════════╝', 'success');
  } catch (e) {
    logConsole('FATAL INIT ERROR: ' + e.message, 'error');
    console.error(e);
  }
});
