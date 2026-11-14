// AI生成
// 数据模型：全部对象仓库（表）定义。keyPath 统一为 id。
// 字段说明见 DEV_PLAN.md 第 3 节。

export const STORES = {
  accounts: { keyPath: 'id' },
  memo: { keyPath: 'id' },
  todoplan: { keyPath: 'id' },
  ledgerCategory: { keyPath: 'id' },
  ledgerRecord: { keyPath: 'id' },
  devTask: { keyPath: 'id' },
  devBug: { keyPath: 'id' },
  devSnippet: { keyPath: 'id' },
  category: { keyPath: 'id' },
  bank: { keyPath: 'id' },
  question: { keyPath: 'id' },
  attempt: { keyPath: 'id' },
  group: { keyPath: 'id' },
  groupMember: { keyPath: 'id' },
  joinRequest: { keyPath: 'id' },
  project: { keyPath: 'id' },
  task: { keyPath: 'id' },
  attachment: { keyPath: 'id' },
  opLog: { keyPath: 'id' },
  notification: { keyPath: 'id' },
  // 小白长期记忆（P19）：聊天/事件原文 + 打分 + 等级
  petMemory: { keyPath: 'id' },
  // 小白性格画像（P19）：标签频次、情绪、习惯句
  petPersona: { keyPath: 'id' },
  // 小白短期记忆（P23-1）：最近 10 轮对话的缓存，5 分钟没有新对话就清空
  petShortTerm: { keyPath: 'id' },
  // P24：小宠物任务话术库（每条一个功能，落库存起来，换设备也读得到）
  petScript: { keyPath: 'id' },
};

// 固定三大题目类别
export const QUIZ_CATEGORIES = [
  { id: 'cat_choice', key: 'choice', name: '选择' },
  { id: 'cat_qa', key: 'qa', name: '问答' },
  { id: 'cat_code', key: 'code', name: '代码' },
];

// 记账预置分类卡片
export const DEFAULT_LEDGER_CARDS = [
  { name: '早餐', preset: true, sort: 1 },
  { name: '中餐', preset: true, sort: 2 },
  { name: '晚餐', preset: true, sort: 3 },
];