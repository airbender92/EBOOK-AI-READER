我直接给你一份**完整、好懂、精准到逻辑层**的解读，把这个 `App.jsx` 彻底讲明白。
这是整个阅读器的**根组件 + 全局状态中心**，所有核心逻辑都在这里。

---

# 一、整体定位
这是 **AI 电子书阅读器的核心大脑**：
- 管理全局状态（书籍、页码、主题、AI 面板、设置）
- 协调主界面布局：**左侧阅读区 + 右侧 AI 面板**
- 处理持久化（本地保存设置、最近阅读、书签）
- 监听快捷键、自定义事件、跨组件通信
- 控制弹窗：书籍列表、设置面板

技术架构：
**React Hooks + Electron 本地存储 + 自定义事件通信**

---

# 二、全局状态（全部在这里）
```js
const [currentBook, setCurrentBook] = useState(null);
const [currentPage, setCurrentPage] = useState(1);
const [totalPages, setTotalPages] = useState(1);
const [darkMode, setDarkMode] = useState(false);
const [aiPanelOpen, setAiPanelOpen] = useState(false);
const [selectedText, setSelectedText] = useState('');
const [settings, setSettings] = useState({
  provider: 'deepseek',
  apiKey: '',
  model: 'deepseek-v4-pro'
});
const [recentBooks, setRecentBooks] = useState([]);
const [bookmarks, setBookmarks] = useState([]);
```

一目了然：
- 当前书籍
- 页码 / 总页数
- 暗黑模式
- AI 面板开关
- 选中的文本（给 AI 用）
- AI 服务商配置（默认 DeepSeek，兼容豆包）
- 最近阅读记录
- 书签

---

# 三、核心逻辑：持久化（本地保存）
通过 `electronAPI` 读写本地 JSON 文件：
- `settings.json` → AI 配置
- `recent-books.json` → 阅读历史
- `bookmarks.json` → 书签

特点：
- 打开时自动加载
- 变更时自动保存
- 做了模型名称兼容处理（旧豆包模型自动迁移到 DeepSeek）

```js
useEffect(() => {
  if (initialized.current && window.electronAPI) {
    window.electronAPI.writeStorage('settings.json', settings);
  }
}, [settings]);
```

---

# 四、书籍管理逻辑
## 1. 打开书籍
- 从文件选择器 或 最近阅读打开
- 打开后重置页码
- 自动加入最近阅读（最多 20 本）
- 去重（按路径）

```js
const openBook = useCallback(async (bookData) => {
  book = await window.electronAPI.openBook();
  setCurrentBook(book);
  setCurrentPage(1);
});
```

## 2. 关闭书籍
清空书籍、页码、AI 面板、选中文本。

---

# 五、快捷键支持
```js
Ctrl/Cmd + O → 打开电子书
```
标准桌面应用体验。

---

# 六、AI 功能核心机制（非常关键）
## 1. 选中文本
阅读区域选中文字 → 存入 `selectedText` 供 AI 使用

## 2. 自定义事件 `ai-action`
阅读区的悬浮工具栏发送事件：
```js
window.addEventListener('ai-action', (e) => {
  const { mode, text, imageDataURL } = e.detail;
  setSelectedText(text);
  setAiMode(mode);
  setAiPanelOpen(true);
});
```

支持：
- 总结
- 翻译
- 解释
- 问答
- **图片 OCR / 识图**（带 imageDataURL）

## 3. 自动打开 AI 面板
触发任何 AI 动作 → 右侧面板自动弹出

---

# 七、布局结构（和 CSS 完全对应）
```js
<div className="app-container">
  <Toolbar />          {/* 顶部工具栏 */}

  <div className="main-content">
    <reader-panel />    {/* 阅读区 */}
    <ai-panel />        {/* AI 面板（可开关）*/}
  </div>

  <BookList />          /* 最近阅读弹窗 */
  <SettingsModal />     /* 设置弹窗 */
</div>
```

## 未打开书籍时
显示欢迎界面：
- 打开电子书
- 最近阅读
- 支持 PDF / EPUB / TXT

---

# 八、书签功能
```js
toggleBookmark()
```
- 按当前页添加/移除
- 按书籍路径区分
- 自动本地保存

---

# 九、组件依赖关系（你项目的完整结构）
```
App.jsx
├── Toolbar.jsx            工具栏
├── ReaderView.jsx          阅读核心（PDF/EPUB/TXT）
├── AIPanel.jsx             AI 问答面板
├── BookList.jsx            最近阅读 + 书签
└── SettingsModal.jsx       AI 服务商设置（豆包/DeepSeek）
```

---

# 十、这个组件已经实现的完整功能
✅ 打开 PDF / EPUB / TXT
✅ 最近阅读记录
✅ 页码跳转、缩放、字体大小
✅ 暗黑模式
✅ 书签
✅ 选中文童 → 发送 AI
✅ AI 面板展开/收起
✅ 本地持久化设置
✅ 快捷键 Ctrl+O
✅ 支持 AI 识图（图片 PDF OCR）
✅ 支持豆包 / DeepSeek 切换

**这已经是一个完整可交付的 AI 阅读器内核。**

---

# 十一、关键点总结（最精简版）
- `App.jsx` = 全局状态 + 布局 + 持久化 + 事件中心
- 阅读区与 AI 区通过 `selectedText` + 自定义事件通信
- 所有配置本地永久保存
- 支持图文 AI 交互
- 界面完全响应你之前的 `App.css` 主题系统

---

如果你需要，我可以**直接帮你补全剩下所有组件**：
- `ReaderView.jsx`（PDF 渲染 + 选区 + 悬浮 AI 菜单）
- `AIPanel.jsx`（对接豆包 API 流式对话）
- `Toolbar.jsx`
- `SettingsModal.jsx`

你只要告诉我从哪个开始就行。