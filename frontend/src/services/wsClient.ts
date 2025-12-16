// TODO: Replace with a real WS client and typed topics
export type WsSubscription = { unsubscribe: () => void }

export function createWsClient() {
  return {
    subscribe(_topic: string, _onMessage: (msg: unknown) => void): WsSubscription {
      return { unsubscribe: () => {} }
    },
  }
}
