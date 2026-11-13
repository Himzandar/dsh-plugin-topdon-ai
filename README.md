# dsh-plugin-topdon-ai

把公司 Anthropic 兼容网关（`https://plat.topdon.com/topdon-plat/topdon-ai/anthropic`）
发布成**一个**提供商、18 个模型，并在**设置 → Topdon AI** 里提供独立的模型选择与
API Key 池管理页面。

| 项目 | 值 |
| ---- | -- |
| 提供商路由 | `topdon`（显示名 "Topdon AI"） |
| 模型 | 18 个，分五个家族：DeepSeek（3）、Claude（4）、GPT（7）、Qwen（2）、Gemini（2） |
| 凭证引用 | `TOPDON_AI_API_KEY`，从宿主凭证库解析 |

**一个提供商，不是五个。** 网关只有一个协议、一个地址、一个凭证，所以这五个家族是
同一路由下的**模型分组**，不是五个独立提供商。因此「设置 → 模型」里只出现一行
Topdon AI，各家族的差异集中到本插件自己的设置页里。

## 设置 → Topdon AI

插件注册了一个独立的 `settings.section`（与 `dsh-connect-workbuddy` 同一机制），
包含两块：

**模型** —— 网关的全部模型按家族分组列出复选框。取消勾选即从提供商中移除该模型；
点「保存」立即生效。

保存时做三件事，缺一不可：

1. **写入本插件自己的 `cordis.patch.yml`** —— 这是 Models 页读回、以及下次启动
   合成时用的那份数据。只改内存不改文件，页面和下次启动就还是旧列表。
2. **调用 `entry.update()` 让运行中的 `llm-pi-ai` 重新解析** —— 否则服务端还是
   启动时的那份配置。
3. **发出 `llm/models-updated`** —— 浏览器不轮询模型目录，只在收到转发事件时
   才重新拉取。少了这一步，前两步都对了，界面上却要等你手动切换一次模型才更新。

第 3 步为什么不能指望宿主自己发：`llm/adapters-updated` 由
`registerAdapter()` / `replace()` 触发，而 `llm-pi-ai` 用 `registrationFacts`
做短路，那份快照只含 provider **名字**、显示名和重试策略，**不含模型列表**。
我们只改模型、路由集合不变，所以那个事件永远不会发。而
`llm/models-updated` 在宿主自带的包里根本没有发射方。

写的是**插件自己的** patch，不是 profile 的用户层，所以卸载插件时模型仍然随插件
一起消失。

**API Key 池** —— 增删切换 Key，不需要碰任何文件。

**输入框胶囊（和 workbuddy 的积分读条同一个位置）** —— 显示当前 Key 的备注和本次
运行的请求数；点开是弹窗，可以**切换当前使用的 Key**，并看到每个 Key 的用量
（输入 / 输出 / 缓存读写 token）。

胶囊挂在 **`conversation.input.right`**（`order: 5`）—— 也就是承载模型选择器的那一行，
和 workbuddy 的积分读条同排，在它左边。**不是** `conversation.composer.dock`：那个槽位是
输入框**下方**的统计行，挂在那里会让胶囊跑到输入框下面。

没有配置任何 Key 时它**不渲染**；当前选中的模型不属于本插件时也**不渲染**（判定依次尝试
`useProjection('modelSelection')`、`settings` 服务、模型选择器上渲染的模型名）。

弹窗是 216px 宽的紧凑卡片，`position: fixed` 跟随胶囊定位并做视口钳制，
`Esc` 或点击外部关闭。用量是**内存里的会话计数**，重启归零 —— 它是一个读数，不是账本，
所以没有落盘。

同样的内容也出现在「插件」页该插件的行卡片上。

**「设置 → 模型」页的 Topdon 行**是**只读展示**：宿主自己渲染的「编辑 / 删除」
按钮在该行被隐藏，换成一段说明 + 「打开 Topdon AI 设置」按钮（外加当前启用模型数）。

实现方式是**纯前端**的，不改变任何实际逻辑：

- 宿主那一行的按钮是无条件渲染的，只对硬编码的 `deepseek-account` 跳过，
  没有给插件留只读开关；`settings.models.provider-card` 是**追加**到行内，
  无法替换行头；
- 但我们的卡片和那些按钮落在**同一个** `<li class="…rowCard">` 里，
  所以一条行级 CSS 规则就够了：

  ```css
  li.jrmgQW_rowCard:has([data-topdon-ai-managed]) span.jrmgQW_rowActions {
    display: none !important;
  }
  ```

  标记属性只由本插件卡片发出，因此只影响这一行，其它提供商的行不受影响。
  已在真实 Chromium 中验证：本行 `display: none`、其它行 `inline`。

代价：`jrmgQW_` 是宿主 CSS Modules 的哈希前缀，宿主升级后可能变。变了也不会
出错 —— 规则只是不再匹配、按钮重新出现，功能不受影响。届时把 `client.js` 里的
`ROW_CSS` 换成新的类名即可。

## 提供商是怎么发布的

`cordis.patch.yml` 是本插件**bundle 的** patch 层，它声明了 `llm-pi-ai` 的提供商。
profile 是层层叠加的，所以这一层只在插件安装且启用期间存在：

| 动作 | 结果 |
| ---- | ---- |
| 安装 / 启用 | patch 层生效 → 提供商和模型出现 |
| 卸载 / 停用 | patch 层移除 → **它们随之消失** |

`cordis.patch.yml` 是**生成物**，不要手改：

```powershell
node build-patch.mjs     # providers.mjs → cordis.patch.yml
node build-patch.mjs --check   # 校验生成物是否最新
node test-injector.mjs   # 宿主侧 12 项检查
node test-pool.mjs       # Key 池 14 项检查
node test-client.mjs     # 浏览器侧 9 项检查
node test-selection.mjs  # 模型选择落盘 7 项检查
node test-announce.mjs   # 变更通知 4 项检查
node test-rowlock.mjs    # 模型页行只读 5 项检查
node test-usage.mjs      # 用量统计 7 项检查
```

## 为什么需要自愈

profile 自己的用户层（`profiles/<name>/cordis.patch.yml`）最后应用，它会
**整份替换**所指向条目的 `config`。所以只要残留这么一段：

```yaml
- id: llm-pi-ai
  config:
    providers: {}
```

就会静默遮住 bundle 层声明的所有提供商。这正是本插件以前「突然失效」的原因 ——
旧版卸载钩子（或「设置 → 模型」页）把空的 `providers` 写进了用户层，
之后无论重装多少次都像没装。

patch 插入的 `topdon-ai-injector` 行会在启动时检查合成后的状态，如果这条用户层覆盖
**没有带来任何自己的内容**（`providers` 为空，或与下层逐字相同），就把它删掉。
若该覆盖里含有外来提供商、改过的模型，或其它 `llm-pi-ai` 设置，则一律不碰。

自愈器从不写提供商数据，卸载时也不写任何配置。

## Key 池

Key 存在 `$DSH_HOME/.topdon-ai-pool.json`（权限 `0600`）。所有模型共用同一个凭证
引用，所以切 Key 是写凭证，不是改提供商 —— 模型选择器不会出现重复项。

```json
{
  "enabled": true,
  "keys": [{ "id": "key-dd83a0b9", "label": "主账号", "secret": "sk-…" }],
  "state": { "activeId": "key-dd83a0b9", "cooldownUntil": {} }
}
```

管理方式三选一：**设置 → Topdon AI**、「插件」页的行卡片，或命令行
（改完需重启）：

```powershell
node pool.mjs list
node pool.mjs add "主账号" sk-xxxxxxxx
node pool.mjs use key-dd83a0b9
node pool.mjs remove key-dd83a0b9
node pool.mjs enable | disable
```

### Key 的选择与切换规则

- **粘性。** `state.activeId` 那把 Key 在可用期间服务所有请求；`keys` 的顺序只决定
  「下一个是谁」。
- **只在 Key 类故障上切换。** 请求在**吐出任何内容之前**失败，且原因是凭证被拒
  （`401`/`403`、`AUTH`/`MISSING_CREDENTIAL`）或被限流（`429`/`RATE_LIMIT`）时，
  该 Key 进入冷却，凭证换成下一把可用的，并**原地重放这次请求** —— 最多 4 次，
  且不超过池内 Key 数量。
- **冷却时间。** 被拒的 Key 冷却 30 分钟；被限流的冷却 60 秒，上游给了
  `Retry-After` 就用它（钳在 5 秒 ~ 30 分钟）。冷却状态重启后仍有效。
- **不是 Key 的问题就不切。** `500`/`SERVER`、超时、传输错误原样抛出，交给宿主
  自己的重试策略。
- **吐字之后不重放。** 一旦有内容到达界面，失败就如实上报；重放会造成重复输出。

在 `cordis.patch.yml` 的 injector 行上设 `pool: false` 或 `models: false`
可以分别关掉这两项功能。

## 修改模型清单

1. 编辑 `providers.mjs` 里的 `MODELS`。
2. `node build-patch.mjs`
3. 跑上面三个测试文件。
4. 重启 DeepSeek Harness（bundle patch 在启动时合成）。

## 排查

- **「设置 → 模型」里没有 Topdon 行。** bundle patch 在启动时读取，先重启；
  再确认插件已启用，且 profile patch 里没有一条自带非空 `providers` 的
  `llm-pi-ai` 覆盖。
- **`providers: {}` 反复出现。** 「设置 → 模型」页在保存空提供商列表时会写它。
  重启一次即可清掉；如果反复出现，在插件安装期间别用那个页面。
- **设置里找不到 Topdon AI 这一项。** 浏览器侧在页面加载时注册，装好后需要
  刷新一次窗口。
- **模型列出来了但报 401 / 鉴权失败。** 路由已注册，但凭证没解析出来 ——
  到 Key 池面板检查 `TOPDON_AI_API_KEY`。
