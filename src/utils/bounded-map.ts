/**
 * 有上限的 Map：超出上限时淘汰最早写入的条目，避免常驻进程里缓存无限增长。
 */
export class BoundedMap<K, V> {
  private readonly map = new Map<K, V>();

  constructor(private readonly maxSize: number) {}

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  set(key: K, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);

    while (this.map.size > this.maxSize) {
      const oldestKey = this.map.keys().next().value as K;
      this.map.delete(oldestKey);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }
}
