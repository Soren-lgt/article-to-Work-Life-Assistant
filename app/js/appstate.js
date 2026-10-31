// AI生成
// 全局状态：当前账号 / 当前小组 / 当前日期；支持订阅（用于首页联动刷新）
export const AppState = {
  currentAccountId: null,
  currentGroupId: null,
  currentDate: null, // 形如 '2026-10-31'
  _listeners: new Set(),
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  },
  set(patch) {
    Object.assign(this, patch);
    this.emit();
  },
  emit() {
    for (const fn of this._listeners) {
      try { fn(this); } catch (e) { console.error(e); }
    }
  },
};