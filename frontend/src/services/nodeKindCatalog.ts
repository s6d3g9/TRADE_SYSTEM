import { listNodeKindsMeta, type NodeKindMetaOut } from './api/graphsApi'

let cachedPromise: Promise<Map<string, NodeKindMetaOut>> | null = null

export function getNodeKindCatalog(): Promise<Map<string, NodeKindMetaOut>> {
  if (!cachedPromise) {
    cachedPromise = listNodeKindsMeta().then((res) => {
      const map = new Map<string, NodeKindMetaOut>()
      for (const it of res.items ?? []) {
        map.set(it.kind, it)
      }
      return map
    })
  }
  return cachedPromise
}

export function clearNodeKindCatalogCache() {
  cachedPromise = null
}
