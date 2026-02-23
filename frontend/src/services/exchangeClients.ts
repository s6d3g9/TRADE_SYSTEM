/**
 * Direct exchange API clients - fetch pairs directly from exchanges
 */

interface ExchangePair {
  pair: string
  symbol: string
  baseAsset: string
  quoteAsset: string
  kinds: Array<'spot' | 'perp'>
  lastPrice?: number
  volume24h?: number
  change24hPct?: number
}

/**
 * Fetch Binance spot pairs with 24h ticker data
 */
export async function fetchBinancePairs(quote: string = 'USDT'): Promise<ExchangePair[]> {
  try {
    const [infoRes, tickerRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/exchangeInfo'),
      fetch('https://api.binance.com/api/v3/ticker/24hr'),
    ])
    
    const infoData = await infoRes.json()
    const tickerData = await tickerRes.json()
    
    // Create ticker map
    const tickerMap = new Map<string, any>()
    for (const t of tickerData || []) {
      tickerMap.set(t.symbol, t)
    }
    
    const pairs: ExchangePair[] = []
    for (const symbol of infoData.symbols || []) {
      if (symbol.status !== 'TRADING') continue
      if (!symbol.isSpotTradingAllowed) continue
      if (symbol.quoteAsset !== quote) continue
      
      const ticker = tickerMap.get(symbol.symbol)
      
      pairs.push({
        pair: `${symbol.baseAsset}/${symbol.quoteAsset}`,
        symbol: symbol.symbol,
        baseAsset: symbol.baseAsset,
        quoteAsset: symbol.quoteAsset,
        kinds: ['spot'],
        lastPrice: ticker ? parseFloat(ticker.lastPrice) : undefined,
        volume24h: ticker ? parseFloat(ticker.quoteVolume) : undefined,
        change24hPct: ticker ? parseFloat(ticker.priceChangePercent) : undefined,
      })
    }
    
    // Sort by volume descending
    pairs.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    
    return pairs
  } catch (error) {
    console.error('Failed to fetch Binance pairs:', error)
    return []
  }
}

/**
 * Fetch OKX pairs (spot + perp) with 24h ticker data
 */
export async function fetchOKXPairs(quote: string = 'USDT'): Promise<ExchangePair[]> {
  try {
    const [spotRes, perpRes, tickerRes] = await Promise.all([
      fetch('https://www.okx.com/api/v5/public/instruments?instType=SPOT'),
      fetch('https://www.okx.com/api/v5/public/instruments?instType=SWAP'),
      fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT'),
    ])
    
    const spotData = await spotRes.json()
    const perpData = await perpRes.json()
    const tickerData = await tickerRes.json()
    
    // Create ticker map
    const tickerMap = new Map<string, any>()
    for (const t of tickerData.data || []) {
      tickerMap.set(t.instId, t)
    }
    
    const pairMap = new Map<string, ExchangePair>()
    
    // Add spot pairs
    for (const inst of spotData.data || []) {
      if (!inst.instId.endsWith(`-${quote}`)) continue
      const base = inst.baseCcy
      const pair = `${base}/${quote}`
      const ticker = tickerMap.get(inst.instId)
      
      pairMap.set(pair, {
        pair,
        symbol: inst.instId,
        baseAsset: base,
        quoteAsset: quote,
        kinds: ['spot'],
        lastPrice: ticker ? parseFloat(ticker.last) : undefined,
        volume24h: ticker ? parseFloat(ticker.volCcy24h) : undefined,
      })
    }
    
    // Add perp pairs
    for (const inst of perpData.data || []) {
      if (!inst.instId.endsWith(`-${quote}-SWAP`)) continue
      const base = inst.ctValCcy || inst.instId.split('-')[0]
      const pair = `${base}/${quote}`
      
      const existing = pairMap.get(pair)
      if (existing) {
        existing.kinds.push('perp')
      } else {
        pairMap.set(pair, {
          pair,
          symbol: inst.instId,
          baseAsset: base,
          quoteAsset: quote,
          kinds: ['perp'],
        })
      }
    }
    
    const pairs = Array.from(pairMap.values())
    pairs.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    return pairs
  } catch (error) {
    console.error('Failed to fetch OKX pairs:', error)
    return []
  }
}

/**
 * Fetch Bybit pairs (spot + perp) with 24h ticker data
 */
export async function fetchBybitPairs(quote: string = 'USDT'): Promise<ExchangePair[]> {
  try {
    const [spotRes, perpRes, tickerRes] = await Promise.all([
      fetch('https://api.bybit.com/v5/market/instruments-info?category=spot'),
      fetch('https://api.bybit.com/v5/market/instruments-info?category=linear'),
      fetch('https://api.bybit.com/v5/market/tickers?category=spot'),
    ])
    
    const spotData = await spotRes.json()
    const perpData = await perpRes.json()
    const tickerData = await tickerRes.json()
    
    // Create ticker map
    const tickerMap = new Map<string, any>()
    for (const t of tickerData.result?.list || []) {
      tickerMap.set(t.symbol, t)
    }
    
    const pairMap = new Map<string, ExchangePair>()
    
    // Add spot pairs
    for (const inst of spotData.result?.list || []) {
      if (!inst.symbol.endsWith(quote)) continue
      const base = inst.baseCoin
      const pair = `${base}/${quote}`
      const ticker = tickerMap.get(inst.symbol)
      
      pairMap.set(pair, {
        pair,
        symbol: inst.symbol,
        baseAsset: base,
        quoteAsset: quote,
        kinds: ['spot'],
        lastPrice: ticker ? parseFloat(ticker.lastPrice) : undefined,
        volume24h: ticker ? parseFloat(ticker.turnover24h) : undefined,
        change24hPct: ticker ? parseFloat(ticker.price24hPcnt) * 100 : undefined,
      })
    }
    
    // Add perp pairs
    for (const inst of perpData.result?.list || []) {
      if (!inst.symbol.endsWith(quote)) continue
      const base = inst.symbol.replace(quote, '')
      const pair = `${base}/${quote}`
      
      const existing = pairMap.get(pair)
      if (existing) {
        existing.kinds.push('perp')
      } else {
        pairMap.set(pair, {
          pair,
          symbol: inst.symbol,
          baseAsset: base,
          quoteAsset: quote,
          kinds: ['perp'],
        })
      }
    }
    
    const pairs = Array.from(pairMap.values())
    pairs.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    return pairs
  } catch (error) {
    console.error('Failed to fetch Bybit pairs:', error)
    return []
  }
}

/**
 * Fetch Coinbase pairs with 24h stats
 */
export async function fetchCoinbasePairs(quote: string = 'USD'): Promise<ExchangePair[]> {
  try {
    const [productsRes, statsRes] = await Promise.all([
      fetch('https://api.exchange.coinbase.com/products'),
      fetch('https://api.exchange.coinbase.com/products/stats'),
    ])
    
    const productsData = await productsRes.json()
    const statsData = await statsRes.json()
    
    const pairs: ExchangePair[] = []
    for (const product of productsData || []) {
      if (product.quote_currency !== quote && product.quote_currency !== 'USDT') continue
      if (product.status !== 'online') continue
      
      const q = product.quote_currency === 'USDT' ? 'USDT' : quote
      const stats = statsData[product.id]
      
      pairs.push({
        pair: `${product.base_currency}/${q}`,
        symbol: product.id,
        baseAsset: product.base_currency,
        quoteAsset: q,
        kinds: ['spot'],
        lastPrice: stats ? parseFloat(stats.last) : undefined,
        volume24h: stats ? parseFloat(stats.volume) * parseFloat(stats.last) : undefined,
      })
    }
    
    pairs.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    return pairs
  } catch (error) {
    console.error('Failed to fetch Coinbase pairs:', error)
    return []
  }
}

/**
 * Fetch Kraken pairs with 24h ticker
 */
export async function fetchKrakenPairs(quote: string = 'USDT'): Promise<ExchangePair[]> {
  try {
    const [pairsRes, tickerRes] = await Promise.all([
      fetch('https://api.kraken.com/0/public/AssetPairs'),
      fetch('https://api.kraken.com/0/public/Ticker'),
    ])
    
    const pairsData = await pairsRes.json()
    const tickerData = await tickerRes.json()
    
    const pairs: ExchangePair[] = []
    for (const [pairId, info] of Object.entries(pairsData.result || {})) {
      const pair = info as any
      if (pair.quote !== quote && pair.quote !== 'ZUSD') continue
      
      const base = pair.base?.replace('X', '').replace('Z', '') || ''
      const q = pair.quote === 'ZUSD' ? 'USD' : quote
      const ticker = tickerData.result?.[pairId]
      
      pairs.push({
        pair: `${base}/${q}`,
        symbol: pairId,
        baseAsset: base,
        quoteAsset: q,
        kinds: ['spot'],
        lastPrice: ticker ? parseFloat(ticker.c?.[0]) : undefined,
        volume24h: ticker ? parseFloat(ticker.v?.[1]) * parseFloat(ticker.c?.[0]) : undefined,
      })
    }
    
    pairs.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    return pairs
  } catch (error) {
    console.error('Failed to fetch Kraken pairs:', error)
    return []
  }
}

/**
 * Universal function to fetch pairs from any exchange
 */
export async function fetchExchangePairs(
  exchange: string,
  quote: string = 'USDT'
): Promise<ExchangePair[]> {
  switch (exchange.toLowerCase()) {
    case 'binance':
      return fetchBinancePairs(quote)
    case 'okx':
      return fetchOKXPairs(quote)
    case 'bybit':
      return fetchBybitPairs(quote)
    case 'coinbase':
      return fetchCoinbasePairs(quote === 'USDT' ? 'USD' : quote)
    case 'kraken':
      return fetchKrakenPairs(quote)
    default:
      console.warn(`Unknown exchange: ${exchange}`)
      return []
  }
}
