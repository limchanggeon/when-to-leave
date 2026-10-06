/** 오래 실행되는 단일 서버용 캐시. TTL과 항목 수를 모두 제한한다. */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, { value: V; until: number }>()

  constructor(private readonly limit: number, private readonly ttlMs: number) {
    if (limit < 1 || ttlMs <= 0) throw new Error('캐시 한도와 TTL은 양수여야 합니다')
  }

  get size(): number { return this.entries.size }

  get(key: K): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (hit.until <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    // 자주 쓰는 항목을 남긴다. 읽기로 TTL을 늘리지는 않는다.
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, { value, until: Date.now() + this.ttlMs })
    while (this.entries.size > this.limit) {
      this.entries.delete(this.entries.keys().next().value!)
    }
  }

  delete(key: K): void { this.entries.delete(key) }
}

/** 같은 외부 조회를 공유하고, 실패/빈 응답은 다음 요청에서 다시 조회한다. */
export function cachedAsync<K, V>(
  cache: BoundedCache<K, Promise<V>>, key: K, load: () => Promise<V>,
  keep: (value: V) => boolean = () => true,
): Promise<V> {
  const hit = cache.get(key)
  if (hit) return hit
  const pending = Promise.resolve().then(load).then((value) => {
    if (cache.get(key) === pending) {
      if (keep(value)) cache.set(key, pending)
      else cache.delete(key)
    }
    return value
  }, (error) => {
    if (cache.get(key) === pending) cache.delete(key)
    throw error
  })
  cache.set(key, pending)
  return pending
}
