// TODO: real WS topics: market.ticker.{exchange} and market.candles.{exchange}.{symbol}.{tf}
export const marketTopics = {
  ticker(exchange: string) {
    return `market.ticker.${exchange}`
  },
  candles(exchange: string, symbol: string, tf: string) {
    return `market.candles.${exchange}.${symbol}.${tf}`
  },
}
