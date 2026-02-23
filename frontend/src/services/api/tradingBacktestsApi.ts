import { http } from '../httpClient'

export type TradingBacktest = {
  backtest_id: string
  bot_id: string | null
  alignment_id: string | null
  user_id: string | null

  strategy_name: string
  pair: string
  timeframe: string

  backtest_start: string
  backtest_end: string
  period_description: string | null

  initial_capital: string | number

  final_capital?: string | number | null
  total_return?: string | number | null
  total_return_percent?: string | number | null

  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate?: string | number | null

  avg_trade_return?: string | number | null

  max_drawdown?: string | number | null
  max_drawdown_percent?: string | number | null
  sharpe_ratio?: string | number | null
  sortino_ratio?: string | number | null
  profit_factor?: string | number | null

  status: string
  error_message?: string | null

  created_at: string
  completed_at?: string | null
  updated_at: string
}

export type BacktestTradesResponse = {
  items: Record<string, unknown>[]
  total: number
  limit: number
  offset: number
  columns: string[]
}

export async function listBotBacktests(bot_id: string, params?: { limit?: number; offset?: number }): Promise<TradingBacktest[]> {
  const qp = new URLSearchParams()
  if (params?.limit) qp.set('limit', String(params.limit))
  if (params?.offset) qp.set('offset', String(params.offset))
  const query = qp.toString() ? `?${qp.toString()}` : ''
  return http<TradingBacktest[]>(`/trading/bots/${encodeURIComponent(bot_id)}/backtests${query}`)
}

export async function listBenchmarkBacktests(params?: {
  strategy?: string
  pair?: string
  timeframe?: string
  status?: string
  bot_id?: string
  alignment_id?: string
  created_from?: string
  created_to?: string
  sort_by?:
    | 'created_at'
    | 'total_return_percent'
    | 'sharpe_ratio'
    | 'max_drawdown_percent'
    | 'win_rate'
    | 'profit_factor'
    | 'total_trades'
    | 'avg_trade_return'
  order?: 'asc' | 'desc'
  limit?: number
  offset?: number
}): Promise<{ items: TradingBacktest[]; total: number; limit: number; offset: number }> {
  const qp = new URLSearchParams()
  if (params?.strategy) qp.set('strategy', params.strategy)
  if (params?.pair) qp.set('pair', params.pair)
  if (params?.timeframe) qp.set('timeframe', params.timeframe)
  if (params?.status) qp.set('status', params.status)
  if (params?.bot_id) qp.set('bot_id', params.bot_id)
  if (params?.alignment_id) qp.set('alignment_id', params.alignment_id)
  if (params?.created_from) qp.set('created_from', params.created_from)
  if (params?.created_to) qp.set('created_to', params.created_to)
  if (params?.sort_by) qp.set('sort_by', params.sort_by)
  if (params?.order) qp.set('order', params.order)
  if (params?.limit) qp.set('limit', String(params.limit))
  if (params?.offset) qp.set('offset', String(params.offset))

  const query = qp.toString() ? `?${qp.toString()}` : ''
  return http(`/trading/backtests${query}`)
}

export async function getBacktestTrades(
  backtest_id: string,
  params?: { order?: 'asc' | 'desc'; limit?: number; offset?: number },
): Promise<BacktestTradesResponse> {
  const qp = new URLSearchParams()
  if (params?.order) qp.set('order', params.order)
  if (params?.limit) qp.set('limit', String(params.limit))
  if (params?.offset) qp.set('offset', String(params.offset))
  const query = qp.toString() ? `?${qp.toString()}` : ''
  return http(`/trading/backtests/${encodeURIComponent(backtest_id)}/trades${query}`)
}
