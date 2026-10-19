# Word Pocket

一款**本地优先**的英语单词训练器，围绕「主动回忆 + 语境提示例句 + 当天强化 +
FSRS 长期排程」设计。所有数据（个人词库、词典缓存、设置）都保存在浏览器
IndexedDB 中，无需账号，也不存在服务端数据存储。

本项目实现 [`PROJECT_TASKBOOK.md`](./PROJECT_TASKBOOK.md) 中的规格说明。

## 快速开始

```bash
npm install
cp .env.example .env        # 可选：填入 COLLINS_API_KEY 以使用真实词典
npm run dev                 # http://localhost:5173
```

应用**零配置即可运行**：默认使用内置的 Mock 词典 Provider，因此每个单词都有
稳定的提示例句。若要接入真实的 Collins API，可以二选一：

1. 在 `.env` 中填入 `COLLINS_API_KEY`，或
2. 直接启动应用后，在「设置 → Collins API Key」中输入并测试。

两种方式都需要通过本地代理访问 Collins（密钥不会进入浏览器）：

```bash
npm run dev:all             # 同时启动 Collins 代理与 Vite
```

切勿把 `COLLINS_API_KEY` 放进任何 `VITE_*` 变量——密钥只在服务端使用。

## 命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Vite 开发服务器 |
| `npm run dev:all` | 同时启动 Collins 代理与 Vite |
| `npm run server` | 仅启动 Collins 代理（`server/index.mjs`） |
| `npm run build` | 类型检查 + 生产构建，输出到 `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier 格式化 |
| `npm run test` | Vitest 单元/集成测试 |
| `npm run test:coverage` | 覆盖率报告 |
| `npm run e2e` | Playwright 端到端测试（需先执行 `npx playwright install chromium`） |
| `npm run scan:secrets` | 扫描构建产物中是否泄漏凭据 |

## 学习流程

1. **单词正面** → 学习者选择「记得」或「不记得」（快捷键 `1` / `2`）。
2. **答案揭示** → 展示完整词条（释义、例句、翻译）；揭示答案**不算**一次评分。
3. **确认** → 学习者确认实际情况。
4. **反馈** →
   - 直接记得 → 交由 FSRS 排入长期复习；
   - 看提示后想起来了 → 进入当天强化队列；
   - 看提示后仍不记得 → 重新排队（有次数上限）并记为一次遗忘。

短时强化**绝不**改动 FSRS 状态；只有长期排程器（`ts-fsrs` v5）才会更新 FSRS
快照。一次回答的所有写入都在同一个 Dexie 事务中完成，并由幂等键保护，因此
快速双击与刷新都不会重复计数。

### 单词出现顺序

在「设置 → 学习目标 → 单词出现顺序」中可选择：

- **按顺序**：短时强化按到期时间、长期复习按到期时间、新词按导入顺序。
- **乱序**：在每个优先级分组内完全随机打乱，没有任何规律。

修改后会重建当天的学习队列。

## 配置 Collins API Key

1. 运行 `npm run dev:all` 启动本地代理。
2. 打开「设置 → Collins API Key」，粘贴 accessKey 并点击「保存」。
3. 点击「测试连接」；成功后再点击「应用」，Provider 会切换为 Collins。

密钥只保存在服务端（默认写入已被 `.gitignore` 忽略的 `.collins-key`），
**不会**写入浏览器存储、前端构建产物或 JSON 备份。测试会通过代理发起一次真实
查询，因此需要网络连接。若使用 `.env` 配置，界面会显示「来自环境变量」。

## 项目结构

```
src/
  app/            应用外壳、Provider、通知
  components/     共享 UI 组件与布局
  db/             Dexie 数据库、迁移、仓储、默认值
  features/
    study/        学习状态机、会话持久化、服务
    review/       短时队列与每日队列构建
    vocabulary/   CSV 导入流程（解析 → 映射 → 导入）
  pages/          路由页面（学习、词库、复习、困难词、统计、设置）
  services/
    scheduler/    ts-fsrs 适配、评分映射、对账
    dictionary/   Provider 接口、Mock + Collins、缓存
    backup/       导出 / 解析 / 恢复
    stats/        回忆成功率、趋势、困难词排序
  types/          领域与词典类型、Zod 校验
  utils/          id、日期、文本、净化、格式化
server/           仅开发用的 Collins 代理（注入密钥）
scripts/          样例生成器、开发编排脚本、密钥扫描器
tests/            与 src/ 对应的 Vitest 测试
e2e/              Playwright 测试用例
docs/             需求、架构、决策、测试计划、API 说明
```

## 文档

- [`docs/PRD.md`](./docs/PRD.md) — 产品需求
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — 模块设计与数据流
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — 决策记录（D-001…）及原因
- [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md) — 对应任务书的测试矩阵
- [`docs/TEST_REPORT.md`](./docs/TEST_REPORT.md) — 最新测试报告
- [`docs/COLLINS_API_NOTES.md`](./docs/COLLINS_API_NOTES.md) — Collins API 调研结论
- [`docs/IMPLEMENTATION_STATUS.md`](./docs/IMPLEMENTATION_STATUS.md) — 实现完成度
- [`CHANGELOG.md`](./CHANGELOG.md) — 版本变更记录

## 隐私

本地优先，无遥测（D-009）。可选的 Collins 代理只会收到被查询的单词；密钥以
`accessKey` 请求头的形式在服务端设置，并从所有客户端代码、日志和错误信息中
剔除。
