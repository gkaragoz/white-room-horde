// the client code that keeps things between sessions uses localStorage; Node has none
const store = new Map<string, string>();
const memory: Storage = {
  get length() {
    return store.size;
  },
  clear: () => store.clear(),
  getItem: (k) => store.get(k) ?? null,
  key: (i) => [...store.keys()][i] ?? null,
  removeItem: (k) => void store.delete(k),
  setItem: (k, v) => void store.set(k, String(v)),
};
Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
