// 纯外观主题：仅负责合法主题名归一化（纯函数，无 DOM 副作用），便于单测。
// 真实样式在 css/app.css 各 data-theme 块中定义；本文件不读写 localStorage。

export const THEME_LIST = ['classic', 'indigo', 'forest', 'night', 'warm'];

export const THEME_OPTIONS = [
  ['classic', '经典蓝白'],
  ['indigo', '靛紫现代'],
  ['forest', '墨绿沉稳'],
  ['night', '暗夜青蓝'],
  ['warm', '暖纸橘棕'],
];

export const DEFAULT_THEME = 'forest';

// 旧版本偏好只存 light / dark，这里做向后兼容映射；空值或未知值统一回退默认主题。
export function normalizeTheme(raw) {
  if (THEME_LIST.includes(raw)) return raw;
  if (raw === 'dark') return 'night';
  if (raw === 'light') return 'classic';
  return DEFAULT_THEME;
}