# fold-control-tool

HarmonyOS 折叠屏模拟器折叠 / 悬停 / 旋转控制工具。

包含三部分：
- `fold-server.py` —— 宿主机 HTTP 服务，执行 emulator 折叠命令
- `FoldTrigger.ets` —— ohosTest 测试侧封装，用例里直接调用
- `hvigorfile.ts` —— 编译时自动拉起 fold-server，无需手动启动

链路：`用例 → FoldTrigger.ets → hdc rport → fold-server.py → emulator`

---

## 环境要求

- Python 3.6+（纯标准库，无需 pip）
- DevEco Studio + 折叠屏模拟器（hdc 已连接）
- 自动探测 emulator / hdc 路径，无需配置

---

## 配置文件

所有可调项集中在 **config.py**（纯 Python 变量，直接改值即可），改完重启 `fold-server.py` / `clean.py` 生效。本文件入库，团队共享默认值。

**优先级**（高 → 低）：

```
命令行参数  >  环境变量  >  config.py  >  代码默认值
```

| 配置项 | 命令行 | 环境变量 | config.py 变量 | 默认 |
|--------|--------|----------|----------------|------|
| 模拟器实例名 | `python3 fold-server.py "Pura X"` | `EMULATOR_INSTANCE` | `EMULATOR_INSTANCE` | `Mate X7` |
| 窗口模式 | — | `FOLD_HEADLESS` | `HEADLESS` | 带窗口 |
| 启动超时 | — | `FOLD_EMU_TIMEOUT` | `EMU_START_TIMEOUT` | `120` |
| 服务端口 | — | — | `PORT` | `8766` |
| 设备端口 | — | — | `DEVICE_PORT` | `8765` |
| 多设备 connect-key | — | `HDC_CONNECT_KEY` | `HDC_CONNECT_KEY` | 自动 |
| Emulator 路径 | — | `EMULATOR_PATH` | `EMULATOR_PATH` | 自动探测 |
| hdc 路径 | — | `HDC_PATH` | `HDC_PATH` | 自动探测 |

个人要临时用不同值，不必改 config.py，用环境变量或命令行参数覆盖即可。

---

## 使用步骤

### 1. 启动折叠屏模拟器

**无需手动启动** —— `fold-server.py` 启动时会检查目标实例状态，没在跑就自动拉起，并轮询直到 `hdc` 识别到设备，全程在终端打印进度提示。冷启动常见 30~90s。

默认**带 GUI 窗口**启动（可观察折叠动画/方向）；CI 或不需要画面时设 `FOLD_HEADLESS=1` 切无窗口。

```
  实例 'Mate X7' 未运行，自动启动中（带窗口模式）...
  等待模拟器上线 / hdc 识别设备（最多 120s，按 Ctrl+C 可中断）...
  . 等待模拟器上线（1/60）
  ✓ 模拟器已上线 — hdc 识别到设备: 127.0.0.1:5555
```

当然也可以像以前一样在 DevEco Studio 里手动启动。

### 2. 编译 / 跑测试（自动启动服务）

`hvigorfile.ts` 在 hvigor 加载时会自动确保 `fold-server` 就绪：

- 检测 `8766` 端口健康检查，已在运行则跳过（复用旧实例）
- 未运行则以 detached 后台进程拉起 `fold-server.py`，构建结束后继续存活
- 脚本不存在（非测试场景）时安全跳过，不影响构建

因此正常情况下**无需手动启动服务**，直接编译或运行测试即可：

```bash
hvigorw assembleHap      # 编译，触发自动启动
hvigorw ohosTest         # 跑测试，服务已在后台就绪
```

控制台看到 `[fold-server] ✓ HTTP 服务已就绪` 即表示服务可用。启动日志写入 `fold-server.log`（自动启动失败或需排查时查看）。

**脚本路径**：自动启动通过 `hvigorfile.ts` 定位脚本：

```ts
const scriptPath = path.join(__dirname, 'fold-server.py');
```

脚本与本文件同在工程根目录，默认即可对齐，无需改动。

> 手动启动（可选）：用于单独调试服务，或自动启动失败时兜底
>
> ```bash
> python3 fold-server.py              # 自动探测实例
> python3 fold-server.py "Mate X7"    # 指定实例名
> ```

### 3. 测试侧调用

把 `FoldTrigger.ets` 放进测试工程的 `ohosTest/ets/util/` 下，用例里导入调用：

```typescript
import { triggerFold, triggerLandscapeHover, sleep } from '../util/FoldTrigger';

// 展开（内屏大屏）
await triggerFold('open', 3000);

// 折叠（外屏小屏，必然竖屏）
await triggerFold('close', 4000);

// 悬停（半折，折痕可见）
await triggerFold('half-open', 3000);

// 悬停态校正到横屏（半折后方向不定，需要时调用）
await triggerLandscapeHover(driver);

await sleep(1000);   // 等待布局稳定
```

第二个参数是命令返回后额外等待的毫秒数。

---

## 三种折叠态

| state | 含义 | 方向 |
|-------|------|------|
| `open` | 内屏展开（大屏） | 由当前方向决定 |
| `close` | 折叠（外屏小屏） | 必然竖屏 |
| `half-open` | 悬停（半折，折痕可见） | 方向不定，需 `triggerLandscapeHover` 校正 |

---

## 验证（可选）

服务运行时可直接 curl 测试：

```bash
curl "http://127.0.0.1:8766/health"               # 健康检查
curl "http://127.0.0.1:8766/fold?state=open"      # 展开
curl "http://127.0.0.1:8766/fold?state=close"     # 折叠
curl "http://127.0.0.1:8766/fold?state=half-open" # 悬停
```

---

## 常见问题

**自动启动没生效（看不到 `[fold-server]` 日志）**：确认 `fold-server.py` 与 `hvigorfile.ts` 同在工程根目录；`existsSync` 检查不通过时自动启动会被静默跳过。若自动启动超时，控制台会提示查看 `fold-server.log`（常见原因：hdc 未连接导致 rport 建立失败，日志里会有详细输出）。

**找不到 emulator / hdc**：设置环境变量 `DEVECO_SDK_HOME`（SDK 路径）、`HDC_PATH`（hdc 路径），或把它们加入 PATH。

**triggerFold 连接失败**：确认 fold-server.py 在运行、`hdc list target` 能看到模拟器。重启服务会重建端口转发。

**多开模拟器**：在 config.py 设 `EMULATOR_INSTANCE = "实例名"` 指定要控制哪一台。多设备同时在线时，服务会自动把实例名映射到对应的 connect-key（靠 Emulator 进程的监听端口），精确路由到目标设备，不会误连到另一台。

**多个设备同时连接（hdc 报 `need connect-key`）**：多设备在线时，`fold-server` 自动用 `-t <connect-key>` 路由到目标设备，按以下优先级定位：
1. 自动映射：根据 `EMULATOR_INSTANCE` 实例名找到对应 connect-key（推荐，多开时只需改实例名）
2. 显式指定：环境变量 `HDC_CONNECT_KEY` 或 config.py 的 `HDC_CONNECT_KEY`（值为 `hdc list targets` 的 connect-key，如 `127.0.0.1:5555`）
3. 兜底：取第一台并警告

**自动启动相关环境变量**：

| 变量 | 默认 | 说明 |
|------|------|------|
| `FOLD_HEADLESS` | `0` | `0`=带 GUI 窗口（默认，可观察折叠动画）；`1`=无窗口（省资源/CI） |
| `FOLD_EMU_TIMEOUT` | `120` | 等待模拟器上线超时秒数（冷启动慢时调大） |
| `HDC_CONNECT_KEY` | 空 | 多设备时显式指定目标设备的 connect-key |
