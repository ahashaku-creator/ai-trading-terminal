# Bitcoin AI Trading Intelligence Dashboard
## 100% Local, No API Keys Required

A production-grade single-page cryptocurrency trading dashboard with a built-in JavaScript AI engine implementing the 90% confidence workflow.

### Features

✅ **100% Free** — No API keys needed  
✅ **Pure JavaScript** — Local AI analysis, no external services  
✅ **Real-Time Data** — Live BTC/USD prices from CoinGecko  
✅ **Fear & Greed Index** — Real-time sentiment data  
✅ **6-Step AI Engine** — Macro → Tech → On-Chain → Derivatives → Signal computation  
✅ **Live Charts** — 7-day candlestick with SMA lines and key levels  
✅ **Complete Analysis** — 10 dashboard sections with all major indicators  
✅ **Console Logging** — Real-time step-by-step analysis visibility  
✅ **Dark Theme** — Professional crypto trading interface  

### Quick Start

1. **Install Live Server**
   - Open VS Code
   - Go to Extensions
   - Search "Live Server" and install by Ritwick Dey

2. **Start Dashboard**
   - Right-click `index.html`
   - Select "Open with Live Server"
   - Dashboard loads automatically!

3. **Watch It Work**
   - Prices update every 30 seconds
   - Full AI analysis runs every 5 minutes
   - Console logs every step in real-time

### Files

- **config.js** — Configuration with static market data
- **index.html** — 10-section dashboard UI with all components
- **style.css** — Dark theme with 1500+ lines of professional styling
- **app.js** — Complete AI engine, data fetchers, and UI handlers (2500+ lines)

### Dashboard Sections

1. **Header Bar** — Title, live clock, "FULLY LOCAL" badge, connection status
2. **Price Ticker** — Real-time BTC/USD, 24h change, high/low, Fear & Greed
3. **Main Prediction Block** — Signal badge, animated confidence gauge, timeframe
4. **Live Chart** — 7-day hourly data with SMA50/SMA200 overlays, key levels
5. **Technical Indicators** — RSI, MACD, 50-day SMA, 200-day SMA, ADX, Volatility
6. **On-Chain Metrics** — MVRV Z-Score, LTH-SOPR, Exchange Reserves, NVT, ETF Flows
7. **Macro Environment** — CPI, WTI Oil, Fed Date, Geopolitical Risk, S&P 500
8. **Derivatives Panel** — Open Interest, Funding Rates, Squeeze Risk probability
9. **Trade Timing Assistant** — Entry zones, targets, stop loss, R:R ratio
10. **AI Console** — Terminal-style log of all analysis steps

### The 6-Step AI Engine

**STEP 1: MACRO FILTER**
- Scores CPI, oil prices, geopolitical risk, stock market correlation
- Determines macro outlook (Bearish/Neutral/Bullish)

**STEP 2: TECHNICAL CONFIRMATION**
- Analyzes price vs SMAs, RSI, MACD, ADX
- Checks for Death Cross or other technical patterns
- Scores technical bias

**STEP 3: ON-CHAIN & SENTIMENT**
- Evaluates MVRV Z-Score, SOPR, exchange reserves
- Weighs Fear & Greed index
- Scores on-chain accumulation/distribution

**STEP 4: DERIVATIVES ANALYSIS**
- Analyzes funding rates and open interest
- Calculates short squeeze probability
- Adds derivative bias to total score

**STEP 5: SIGNAL COMPUTATION**
- Combines all scores with proper weighting:
  - Macro: 25%
  - Technical: 30%
  - On-Chain: 30%
  - Derivatives: 15%
- Generates BUY/SELL/HOLD signal with confidence 0-92%
- Special override: Extreme Fear + Crowded Shorts + Support = Force BUY

**STEP 6: OUTPUT**
- Prediction: Plain English market outlook
- Action: Specific trader instruction
- Entry/Target/Stop zones with risk/reward
- 4-5 reasoning bullets from dominant factors
- Warnings for macro risks

### Free APIs Used

1. **CoinGecko** (https://api.coingecko.com)
   - Live Bitcoin price
   - 7-day historical hourly data
   - Market cap and volume
   - No authentication required

2. **Alternative.me** (https://api.alternative.me)
   - Fear & Greed Index
   - Current sentiment reading
   - No authentication required

### How It Works

**Every 30 Seconds:**
1. Fetch live BTC/USD price from CoinGecko
2. Fetch Fear & Greed index from Alternative.me
3. Update ticker bar with real-time values

**Every 5 Minutes:**
1. Fetch 7-day historical price data
2. Run 6-step local AI analysis
3. Update all dashboard panels with new signal
4. Log every step to console

### Dashboard Styling

- **Dark Theme**: #0d1117 background with #161b22 cards
- **Colors**: Green (#3fb950), Red (#f85149), Blue (#58a6ff), Orange (#d29922), Yellow (#e3b341)
- **Layout**: CSS Grid with 70/30 left/right split
- **Responsive**: Works on desktop, tablet, mobile
- **Animations**: Confidence gauge arc, price flashes, console entries, pulse effects

### Production Features

✅ Comprehensive error handling with fallbacks  
✅ Timeout protection on all API requests (8-10 seconds)  
✅ Graceful degradation if APIs are down  
✅ Full console logging for debugging  
✅ Proper async/await patterns  
✅ No external dependencies (pure HTML/CSS/JS)  
✅ XSS protection with HTML escaping  
✅ Timer cleanup on page unload  

### Try It Now

```bash
# In your workspace directory:
cd "c:\documents\aibot test\test1"
# Right-click index.html → Open with Live Server
```

That's it! Your local AI trading dashboard is live.

### No Configuration Needed

- No API keys to manage
- No authentication
- No external dependencies
- No build process
- Just open and run

The dashboard is completely self-contained and runs entirely in your browser using vanilla JavaScript, HTML, and CSS. All analysis is performed locally using the client-side rule engine.
