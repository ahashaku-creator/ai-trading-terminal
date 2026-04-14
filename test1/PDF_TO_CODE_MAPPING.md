# PDF TO CODE MAPPING & TECHNICAL SPECIFICATION
## Bitcoin AI Trading Dashboard v3.0 – Complete Reference Guide

---

## TABLE OF CONTENTS
1. [Architecture Overview](#architecture)
2. [Module Mapping](#modules)
3. [Data Schemas & Endpoint Examples](#schemas)
4. [Indicator Formulas](#indicators)  
5. [Chart.js Financial Configuration](#chart-config)
6. [UI Component Reference](#ui-components)
7. [Fallback & Error Handling](#fallback)
8. [Refresh Schedule](#scheduling)
9. [Testing Checklist](#testing)

---

## <a id="architecture"></a> ARCHITECTURE OVERVIEW

### System Layers

```
┌─────────────────────────────────────────────────────┐
│  Browser Runtime (JavaScript Engine)                │
├─────────────────────────────────────────────────────┤
│  View Layer (index.html + style.css)                │
│  - Header ticker, charts, panels                    │
├─────────────────────────────────────────────────────┤
│  Logic Layer (app.js)                               │
│  - Fetch, render, AI analysis, scheduling           │
├─────────────────────────────────────────────────────┤
│  Data Layer (config.js)                             │
│  - Indicators, formulas, zones, utilities           │
├─────────────────────────────────────────────────────┤
│  External APIs (JSON over HTTPS)                    │
│  - Binance, CoinGecko, Alternative.me               │
└─────────────────────────────────────────────────────┘
```

### Initialization Sequence (6-Step Waterfall)

```javascript
// index.html → DOMContentLoaded
window.addEventListener('DOMContentLoaded', async () => {
  registerChartPlugins()
  attachEventListeners()
  await initDashboard()
})

// app.js → initDashboard()
async function initDashboard() {
  // STEP 1: Fetch price ticker
  const priceData = await fetchPrice()
  
  // STEP 2: Fetch fear & greed index
  const fngData = await fetchFearGreed()
  
  // STEP 3: Fetch klines from all timeframes
  const klinesByTF = await fetchAllTimeframes()
  
  // STEP 4: Render candlestick chart with SMA overlays
  await renderCandleChart(klinesByTF[_currentTF])
  
  // STEP 5: Run AI analysis engine
  const analysis = await runAIEngine(klinesByTF)
  
  // STEP 6: Update all UI panels with results
  updateUI_AllPanels(analysis)
}
```

---

## <a id="modules"></a> MODULE MAPPING TABLE

| File | Purpose | Key Functions |
|------|---------|----------------|
| **index.html** | HTML structure, CDN scripts, DOM templates | (Static markup) |
| **style.css** | Design tokens, responsive layout, dark theme | (CSS variables & rules) |
| **config.js** | Constants, indicators, zones, utilities | `computeSMA()`, `computeATR()`, `computeRSI()`, `computeZones()` |
| **app.js** | Data fetching, chart rendering, main loop | `fetchPrice()`, `fetchKlines()`, `renderCandleChart()`, `runAIEngine()`, `initDashboard()` |

### File Sizes (Approximate)

```
index.html  ~    8 KB  (HTML template)
style.css   ~   15 KB  (Styled components)
config.js   ~   22 KB  (Indicators + utilities)
app.js      ~   45 KB  (Core application logic)
────────────────────────
Total       ~   90 KB  (Reasonable for single-page app)
```

---

## <a id="schemas"></a> DATA SCHEMAS & ENDPOINT EXAMPLES

### 1. Binance Klines Endpoint

**URL Format:**
```
https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={interval}&limit=60
```

**Request Parameters:**
```javascript
const tf = '4h'          // Others: 1m, 5m, 15m, 1h, 1d, etc.
const limit = 60         // Number of bars to fetch
const symbol = 'BTCUSDT' // Bitcoin/USD Tether pair
```

**Response Schema (Array of Arrays):**
```javascript
[
  [
    1704067200000,   // [0] Open time (Unix timestamp in ms)
    "45230.00",      // [1] Open price (string, parse to float)
    "45650.00",      // [2] High price
    "45100.00",      // [3] Low price
    "45500.00",      // [4] Close price
    "1234.56",       // [5] Asset volume (BTC)
    1704096000000,   // [6] Close time
    "56234567.89",   // [7] Quote asset volume (USDT)
    234,             // [8] Number of trades
    "612.34",        // [9] Taker buy base asset volume
    "28234567.89",   // [10] Taker buy quote asset volume
    "0"              // [11] Ignore
  ],
  // ... more kline objects
]
```

**Example Response (2 bars):**
```json
[
  ["1704067200000","45230.00","45650.00","45100.00","45500.00","1234.56","1704096000000","56234567.89",234,"612.34","28234567.89","0"],
  ["1704096000000","45520.00","46000.00","45400.00","45900.00","1567.89","1704124800000","71234567.89",301,"789.12","35234567.89","0"]
]
```

### 2. CoinGecko Price Endpoint

**URL:**
```
https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false
```

**Response Schema:**
```javascript
{
  id: "bitcoin",
  symbol: "btc",
  name: "Bitcoin",
  market_data: {
    current_price: {
      usd: 45230.50
    },
    market_cap: {
      usd: 900000000000          // $900 billion
    },
    total_volume: {
      usd: 30000000000           // $30 billion 24h volume
    },
    high_24h: {
      usd: 46000.00
    },
    low_24h: {
      usd: 44500.00
    },
    price_change_percentage_24h: 2.45,  // +2.45%
    circulating_supply: 21000000,       // 21 million BTC
    max_supply: 21000000
  }
}
```

**Extract in Code:**
```javascript
const current = data.market_data.current_price.usd      // 45230.50
const cap      = data.market_data.market_cap.usd         // 900e9
const vol      = data.market_data.total_volume.usd       // 30e9
const high24   = data.market_data.high_24h.usd           // 46000
const low24    = data.market_data.low_24h.usd            // 44500
const change   = data.market_data.price_change_percentage_24h  // 2.45
```

### 3. Fear & Greed Index Endpoint

**URL:**
```
https://api.alternative.me/fng/?limit=1
```

**Response Schema:**
```javascript
{
  name: "Fear and Greed Index",
  data: [
    {
      value: "72",                    // 0-100 scale (72 = Greed)
      value_classification: "Greed",  // Extreme Fear / Fear / Neutral / Greed / Extreme Greed
      timestamp: "1704067200",        // Unix timestamp (seconds)
      time_until_update: "42327"      // Seconds until next data
    }
  ],
  metadata: {
    error: null
  }
}
```

**Interpretation:**
```
0-24   = Extreme Fear (RED)
25-44  = Fear (ORANGE)
45-55  = Neutral (YELLOW)
56-74  = Greed (GREEN)
75-100 = Extreme Greed (BRIGHT GREEN)
```

---

## <a id="indicators"></a> INDICATOR FORMULAS & PSEUDOCODE

### 1. Simple Moving Average (SMA)

**Mathematical Formula:**
$$SMA_n = \frac{P_{t-n+1} + P_{t-n+2} + ... + P_t}{n}$$

**Pseudocode:**
```
Function computeSMA(closes[], period):
  IF length(closes) < period:
    RETURN empty array
  
  smaArray = []
  FOR i = period-1 TO length(closes)-1:
    sum = 0
    FOR j = i-period+1 TO i:
      sum += closes[j]
    sma = sum / period
    smaArray.push(sma)
  
  RETURN smaArray
```

**JavaScript Implementation:**
```javascript
function computeSMA(closes, period) {
  if (!closes || closes.length < period) return []
  const smaArray = []
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += parseFloat(closes[j]) || 0
    }
    smaArray.push(sum / period)
  }
  return smaArray
}
```

**Example Calculation (SMA-5):**
```
Closes: [100, 102, 101, 103, 102, 104, 105]
Period: 5

Position 4: SMA = (100+102+101+103+102) / 5 = 508/5 = 101.6
Position 5: SMA = (102+101+103+102+104) / 5 = 512/5 = 102.4
Position 6: SMA = (101+103+102+104+105) / 5 = 515/5 = 103.0

Result: [101.6, 102.4, 103.0]
```

---

### 2. Average True Range (ATR)

**Mathematical Formula:**
$$TR_i = \max(H_i - L_i, |H_i - C_{i-1}|, |L_i - C_{i-1}|)$$
$$ATR_n = \frac{1}{n} \sum_{i=1}^{n} TR_i$$

**Pseudocode:**
```
Function computeATR(klines[], period=14):
  IF length(klines) < 2:
    RETURN 0
  
  trueRanges = []
  
  // Calculate True Range for each candle
  FOR i = 1 TO length(klines)-1:
    high = klines[i][2]
    low = klines[i][3]
    prevClose = klines[i-1][4]
    
    tr = MAX(
      high - low,
      ABS(high - prevClose),
      ABS(low - prevClose)
    )
    
    trueRanges.push(tr)
  
  // Calculate average of last 'period' values
  IF length(trueRanges) < period:
    RETURN average(trueRanges)
  ELSE:
    RETURN average(trueRanges[-period:])
```

**JavaScript Implementation:**
```javascript
function computeATR(klines, period = 14) {
  if (!klines || klines.length < 2) return 0
  
  const trueRanges = []
  
  for (let i = 1; i < klines.length; i++) {
    const h = parseFloat(klines[i][2])
    const l = parseFloat(klines[i][3])
    const pc = parseFloat(klines[i-1][4])
    
    const tr = Math.max(
      h - l,
      Math.abs(h - pc),
      Math.abs(l - pc)
    )
    
    if (isFinite(tr)) {
      trueRanges.push(tr)
    }
  }
  
  if (trueRanges.length === 0) return 0
  
  const slice = trueRanges.slice(-period)
  const atr = slice.reduce((a, b) => a + b, 0) / slice.length
  
  return isFinite(atr) ? atr : 0
}
```

**Example Calculation:**
```
Kline 1: H=105, L=100, C=103
Kline 2: H=107, L=102, C=105  (PrevClose=103)
Kline 3: H=106, L=101, C=104  (PrevClose=105)

TR for Kline 2 = max(107-102=5, |107-103|=4, |102-103|=1) = 5
TR for Kline 3 = max(106-101=5, |106-105|=1, |101-105|=4) = 5

// If we have 14 TR values averaging 4.2, then ATR(14) = 4.2
```

---

### 3. Relative Strength Index (RSI)

**Mathematical Formula:**
$$RS = \frac{AvgGain}{AvgLoss}$$
$$RSI = 100 - \frac{100}{1 + RS}$$

**Pseudocode:**
```
Function computeRSI(closes[], period=14):
  IF length(closes) < period+1:
    RETURN 50  // Neutral
  
  gains = 0
  losses = 0
  
  FOR i = length-period TO length-1:
    change = closes[i] - closes[i-1]
    IF change > 0:
      gains += change
    ELSE:
      losses += ABS(change)
  
  avgGain = gains / period
  avgLoss = losses / period
  
  IF avgLoss == 0:
    RETURN 100
  
  rs = avgGain / avgLoss
  rsi = 100 - (100 / (1 + rs))
  
  RETURN rsi
```

**JavaScript Implementation:**
```javascript
function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return 50
  
  const validCloses = closes.map(c => parseFloat(c)).filter(isFinite)
  if (validCloses.length < period + 1) return 50
  
  let gains = 0, losses = 0
  for (let i = validCloses.length - period; i < validCloses.length; i++) {
    const change = validCloses[i] - validCloses[i - 1]
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }
  
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  
  const rs = avgGain / avgLoss
  const rsi = 100 - (100 / (1 + rs))
  
  return isFinite(rsi) ? rsi : 50
}
```

---

## <a id="chart-config"></a> CHART.JS FINANCIAL DATASET FORMAT

### Candlestick Dataset Structure

```javascript
{
  label: 'BTC/USD',
  type: 'candlestick',
  data: [
    { x: 1704067200000, o: 45230, h: 45650, l: 45100, c: 45500 },
    { x: 1704096000000, o: 45520, h: 46000, l: 45400, c: 45900 },
    // ... more candles
  ],
  borderColor: 'rgba(0, 255, 0, 0.8)',
  color: {
    up: 'rgba(0, 255, 100, 0.8)',    // Green for up candles
    down: 'rgba(255, 50, 50, 0.8)',  // Red for down candles
    unchanged: 'rgba(200, 200, 200, 0.8)'
  }
}
```

### SMA Line Overlay Dataset

```javascript
{
  label: 'SMA 50',
  type: 'line',
  data: [
    { x: 1704096000000, y: 45345.67 },
    { x: 1704124800000, y: 45456.78 },
    // ... more SMA points
  ],
  borderColor: 'rgba(255, 193, 7, 0.6)',  // Yellow dashed
  borderDash: [5, 5],
  borderWidth: 2,
  fill: false,
  pointRadius: 0,
  tension: 0
}
```

### Complete Chart Configuration

```javascript
const ctx = document.getElementById('priceChart').getContext('2d')

const chartConfig = {
  type: 'candlestick',
  data: {
    datasets: [
      candlestickDataset,
      sma50Dataset,
      sma200Dataset
      // Optional: rsiDataset, atrDataset
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      annotation: {
        annotations: {
          // Buy zone rectangle
          buyZone: {
            type: 'box',
            yMin: buyZoneBottom,
            yMax: buyZoneTop,
            backgroundColor: 'rgba(0, 255, 0, 0.05)',
            borderColor: 'rgba(0, 255, 0, 0.3)',
            borderWidth: 2
          },
          // Sell zone rectangle
          sellZone: {
            type: 'box',
            yMin: sellZoneLow,
            yMax: sellZoneHigh,
            backgroundColor: 'rgba(255, 0, 0, 0.05)',
            borderColor: 'rgba(255, 0, 0, 0.3)',
            borderWidth: 2
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'minute', displayFormats: { minute: 'HH:mm' } }
      },
      y: {
        ticks: { callback: v => '$' + v.toFixed(0) }
      }
    }
  }
}

_chart = new Chart(ctx, chartConfig)
```

---

## <a id="ui-components"></a> UI COMPONENT REFERENCE

### Header Ticker HTML

```html
<header class="header">
  <div class="header-left">
    <h1>₿ Professional AI Terminal v3.0</h1>
  </div>
  
  <div class="header-ticker">
    <div id="live-clock" class="clock">00:00:00</div>
    <span class="ticker-label">BTC</span>
    <span id="price" class="ticker-value">$45,230</span>
    <span id="change24hSpan" class="ticker-change">+2.45%</span>
    <span class="ticker-label">H:</span>
    <span id="high24h" class="ticker-value">$46,000</span>
    <span class="ticker-label">L:</span>
    <span id="low24h" class="ticker-value">$44,500</span>
    <span class="ticker-label">F&G:</span>
    <span id="fearGreed" class="ticker-value">72 Greed</span>
  </div>
</header>
```

### Timeframe Selector HTML

```html
<div class="chart-header">
  <h3>BTC/USD Chart</h3>
  <div class="tf-buttons">
    <button class="tf-btn" data-tf="1h">1H</button>
    <button class="tf-btn" data-tf="4h" active>4H</button>
    <button class="tf-btn" data-tf="1d">1D</button>
    <button class="tf-btn" data-tf="7d">7D</button>
  </div>
</div>
```

### Event Listener (app.js)

```javascript
document.querySelectorAll('.tf-btn').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'))
    e.target.classList.add('active')
    
    _currentTF = e.target.dataset.tf
    await renderCandleChart(_cachedKlines[_currentTF])
  })
})
```

### Signal Panel CSS

```css
.signal-panel {
  background: linear-gradient(135deg, #1a1a2e, #16213e);
  border-left: 6px solid #00ff64;
  padding: 16px;
  border-radius: 8px;
  margin: 12px 0;
}

.signal-value {
  font-size: 24px;
  font-weight: bold;
  color: #00ff64;  /* Green for BUY */
  /* Red (#ff3232) for SELL */
  /* Yellow (#ffc107) for HOLD */
}

.confidence-gauge {
  width: 100%;
  height: 12px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, #ff3232, #ffc107, #00ff64);
  width: 78%;  /* 78% confidence */
  transition: width 0.3s ease;
}
```

### Zones Card HTML

```html
<div class="zone-card buy-zone">
  <h4>BUY ZONE</h4>
  <div class="zone-range">
    <span id="buyBottom" class="zone-value">$44,190</span>
    <span> – </span>
    <span id="buyTop" class="zone-value">$44,595</span>
  </div>
  <div class="zone-label">Entry range (ATR-based)</div>
</div>

<div class="zone-card sell-zone">
  <h4>SELL ZONE</h4>
  <div class="zone-range">
    <span id="sellLow" class="zone-value">$45,900</span>
    <span> – </span>
    <span id="sellHigh" class="zone-value">$46,440</span>
  </div>
  <div class="zone-label">Profit target (ATR-based)</div>
</div>

<div class="zone-card stop-zone">
  <h4>STOP LOSS</h4>
  <div class="zone-range">
    <span id="stopLoss" class="zone-value">$43,945</span>
  </div>
  <div class="zone-label">Risk management level</div>
</div>
```

---

## <a id="fallback"></a> FALLBACK & ERROR HANDLING

### Fetch Price Fallback Chain

```javascript
async function fetchPrice() {
  try {
    // ATTEMPT 1: CoinGecko API
    const r = await fetch(URL_PRICE, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    
    const data = await r.json()
    _lastPrice = data.market_data.current_price.usd
    setStatus(true)  // Show as ONLINE
    return { price: _lastPrice, ... }
  } catch (e) {
    logConsole('⚠ Price fetch failed: ' + e.message, 'warning')
    
    // FALLBACK: Use last known price
    setStatus(false)  // Show as OFFLINE
    return {
      price: _lastPrice || 45000,      // Last price or hardcoded default
      change24h: 0,
      high24h: _lastPrice * 1.02,
      low24h: _lastPrice * 0.98,
      marketCap: 900e9,
      volume24h: 30e9
    }
  }
}
```

### Fetch Klines Fallback Chain

```javascript
async function fetchKlines(tf) {
  const limit = TF_LIMITS[tf] || 60
  
  try {
    logConsole('📡 Fetching ' + tf + ' klines...', 'info')
    
    // ATTEMPT 1: Binance API
    const url = URL_BINANCE + '?symbol=BTCUSDT&interval=' + tf + '&limit=' + limit
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error('Binance HTTP ' + r.status)
    
    const klines = await r.json()
    _cachedKlines[tf] = klines  // Cache on success
    
    logConsole('✓ ' + tf + ': ' + klines.length + ' candles', 'success')
    return klines
  } catch (e) {
    logConsole('⚠ Klines (' + tf + ') fetch failed: ' + e.message, 'warning')
    
    // FALLBACK: Return cached klines
    if (_cachedKlines[tf]) {
      logConsole('↻ Using cached ' + tf + ' data', 'info')
      return _cachedKlines[tf]
    }
    
    // FINAL FALLBACK: Return empty array
    logConsole('✗ No ' + tf + ' data available', 'error')
    return []
  }
}
```

### Indicator Calculation Safety

```javascript
function computeZones(klines, price, atrVal) {
  // Validate inputs
  if (!klines || klines.length === 0) {
    return {
      buyBottom: price - 500,
      buyTop: price - 250,
      sellLow: price + 500,
      sellHigh: price + 750,
      stopLoss: price - 1000,
      rr: 0
    }
  }
  
  // Validate ATR
  const atr = isFinite(atrVal) ? Math.max(atrVal, 1) : 100
  
  // Calculate zones with fallbacks
  const zones = {
    buyBottom: Math.max(100, price - (atr * CONFIG.BUYZONE_ATR_MULT)),
    buyTop: Math.max(100, price - (atr * CONFIG.BUYZONE_WIDTH_ATR)),
    sellLow: price + (atr * CONFIG.SELLZONE_ATR_MULT),
    sellHigh: price + (atr * CONFIG.SELLZONE_WIDTH_ATR),
    stopLoss: Math.max(100, price - (atr * CONFIG.STOPLOSS_ATR_MULT)),
    rr: calculateRiskReward(...)
  }
  
  return zones
}
```

---

## <a id="scheduling"></a> REFRESH SCHEDULE & TIMING

### Interval Loop Configuration

```javascript
// LOOP 1: Every 1 second (clock updates)
setInterval(() => {
  updateClock()      // Update HH:MM:SS display
  updateCountdown()  // Count down to next bar close
}, 1000)  // 1000 milliseconds = 1 second

// LOOP 2: Every 30 seconds (price + ticker)
setInterval(async () => {
  logConsole('📡 Price refresh cycle (30s)...', 'info')
  const priceData = await fetchPrice()
  safeSet('price', formatPrice(priceData.price))
  safeSet('high24h', formatPrice(priceData.high24h))
  safeSet('low24h', formatPrice(priceData.low24h))
  safeSet('change24hSpan', formatChange(priceData.change24h))
  logConsole('✓ Price updated: $' + formatPrice(priceData.price), 'success')
}, 30000)  // 30,000 milliseconds = 30 seconds

// LOOP 3: Every 2 minutes (quick UI refresh with cache)
setInterval(() => {
  if (_lastAnalysis) {
    logConsole('🔄 Quick re-analysis cycle (2m)...', 'info')
    updateUI_AllPanels(_lastAnalysis)
    logConsole('✓ UI refreshed with cached analysis', 'success')
  }
}, 120000)  // 120,000 milliseconds = 2 minutes

// LOOP 4: Every 5 minutes (full refresh)
setInterval(async () => {
  logConsole('🔄🔄🔄 FULL REFRESH CYCLE (5 minutes) 🔄🔄🔄', 'info')
  await initDashboard()
  logConsole('✓ Full cycle complete', 'success')
}, 300000)  // 300,000 milliseconds = 5 minutes
```

### Timeline Visualization

```
t =    0s │ INIT: fetch price, klines, analysis, render
         │
t =    1s │ CLOCK: update time, gauge animation
t =    2s │ CLOCK
...
t =   30s │ PRICE: fetch latest ticker
t =   31s │ CLOCK
...
t =  120s │ UI: refresh with cached analysis
t =  121s │ CLOCK
...
t =  300s │ FULL: repeat from t=0s (INIT again)
t =  301s │ CLOCK
...
t =  330s │ PRICE: fetch latest ticker again
```

---

## <a id="testing"></a> TESTING CHECKLIST

### Phase 1: Initialization ✓

- [ ] Browser opens without JavaScript errors
- [ ] Console shows "STEP 1/6: Fetching price..."
- [ ] Price ticker displays ($45,230.67)
- [ ] Fear & Greed displays (0-100 value)
- [ ] Console shows "✓ Klines fetched" for 4h, 1h, 1d
- [ ] Chart appears with candlesticks
- [ ] SMA50 (yellow) and SMA200 (blue) lines visible

### Phase 2: Rendering ✓

- [ ] Candlesticks are correct color (up=green, down=red)
- [ ] Chart updates every ~2 seconds (no flicker)
- [ ] X-axis shows time labels (HH:MM)
- [ ] Y-axis shows price with $ labels
- [ ] Zoom/pan works (scroll to zoom, drag to pan)
- [ ] Chart title shows "BTC/USD"

### Phase 3: Timeframe Switching ✓

- [ ] Click [1H] button → chart updates to 1h data
- [ ] Click [4H] button → chart updates to 4h data
- [ ] Click [1D] button → chart updates to 1d data
- [ ] Active button highlighted
- [ ] Chart redraws smoothly (no flicker)
- [ ] Indicators recalculate (SMA positions change)

### Phase 4: Data Fetching ✓

- [ ] Console shows "📡 Price refresh cycle" every 30s
- [ ] Price ticker updates every 30s
- [ ] 24h high/low/change% updates
- [ ] No error messages in console
- [ ] Website stays responsive while fetching

### Phase 5: Indicators ✓

- [ ] SMA50 line visible and yellow
- [ ] SMA200 line visible and blue
- [ ] Both lines move with new data
- [ ] Lines don't spike or glitch
- [ ] Indicator values plausible (SMA range = price range ±5%)

### Phase 6: AI Analysis ✓

- [ ] Signal displays (BUY/SELL/HOLD)
- [ ] Confidence gauge shows 0-100%
- [ ] Confidence color: red (0-33), yellow (34-66), green (67-100)
- [ ] Zones display: Buy Zone, Sell Zone, Stop Loss
- [ ] Zone values are realistic (not 0 or extreme)
- [ ] Risk:Reward ratio displayed

### Phase 7: Scheduling ✓

- [ ] Console shows "✓ LOOP 1: 1-second UI refresh active"
- [ ] Console shows "✓ LOOP 2: 30-second price refresh active"
- [ ] Console shows "✓ LOOP 3: 2-minute quick refresh active"
- [ ] Console shows "✓ LOOP 4: 5-minute full refresh active"
- [ ] Loops activate at correct intervals (not too fast/slow)

### Phase 8: Error Handling ✓

- [ ] Disconnect internet → Dashboard still displays old data
- [ ] Console shows fallback message (⚠ Price fetch failed)
- [ ] Status indicator shows "Offline"
- [ ] Reconnect internet → Dashboard fetches new data
- [ ] Status indicator returns to "Online"

### Phase 9: UI Responsiveness ✓

- [ ] Header stays sticky at top
- [ ] Chart section responsive to window resize
- [ ] Panels align vertically on narrow screens
- [ ] Mobile: single column layout
- [ ] Desktop: multi-column layout

### Phase 10: Console Output ✓

- [ ] Check console (F12) for errors: "Errors: 0"
- [ ] Check warnings: minimal, expected warnings only
- [ ] Informational logs appear (emojis visible: 📡 ✓ ⚠ ✗)

### Performance Benchmark ✓

- [ ] Page load time: < 3 seconds
- [ ] First chart render: < 5 seconds
- [ ] Timeframe switch: < 1 second
- [ ] Price update (30s): < 500ms network call
- [ ] Memory usage: < 100 MB after 10 minutes

### Integration Test: Full Cycle ✓

```
1. Open dashboard (t=0s)
   → Console: STEP 1-6 messages
   → UI: Chart + indicators appear
   
2. Wait 30 seconds (t=30s)
   → Console: "📡 Price refresh cycle"
   → UI: Ticker updates
   
3. Wait 60 seconds (t=90s)
   → Console: Same price message at t=60s
   → UI: Smooth updates
   
4. Wait 210 seconds (t=300s)
   → Console: "🔄🔄🔄 FULL REFRESH CYCLE"
   → UI: Chart redraws, analysis recalculates
   
5. Click [1H] button
   → UI: Chart changes to 1h data
   → Indicators adjust
   
6. Disconnect internet
   → Console: "⚠ Price fetch failed"
   → UI: Stale data displayed (graceful)
   
7. Reconnect internet
   → Console: New data fetches
   → UI: Updates with fresh prices
   
Result: ✓ ALL PASS = System is PRODUCTION READY
```

---

## SUPPORT & TROUBLESHOOTING

| Issue | Symptom | Solution |
|-------|---------|----------|
| No chart | Canvas blank, no error | Check if Chart.js CDN loaded (F12 > Network) |
| Flicker | Chart redraw every second | Set `chart.update('none')` instead of `chart.update()` |
| NaN values | Zones show NaN, indicators undefined | Check klines format; validate parseFloat() calls |
| Slow load | Takes > 10s to initialize | Check network speed; may need more CDN bandwidth |
| Price lag | Ticker doesn't update for minutes | Check interval timing; verify fetch() not blocked |
| No SMA lines | Chart shows only candlesticks | Verify SMA array is non-empty; check dataset color |

---

**Document Version:** 3.0  
**Last Updated:** 2026-04-14  
**Status:** Production Ready ✓

