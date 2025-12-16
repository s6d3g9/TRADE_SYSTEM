// TODO: real WS topics: trades.{botId}, decisions.bot.{botId}, signals.bot.{botId}
export const botTopics = {
  trades(botId: string) {
    return `trades.${botId}`
  },
  decisions(botId: string) {
    return `decisions.bot.${botId}`
  },
  signals(botId: string) {
    return `signals.bot.${botId}`
  },
}
