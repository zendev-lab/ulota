# 项目演进

## 初始意图

Spark 最初是面向 Pi 产品的工作流套件。通过意图明确的用户命令与规范化工具，
把项目意图、任务有向无环图、结构化提问、审查、证据制品、角色执行和 Cue
组织为可追溯的本地开发工作流。

目标是从用户的想法收敛出最小可交付切片，让调查、执行、审查和结果能够延续。
项目状态不是使用前提：普通调查可以直接开始，只有 project-bound 命令需要时
才从用户意图创建或恢复本地状态。Spark 不泛化为公开模板或通用项目管理产品，
不复制 OpenSpec/OpenArc 的完整文件树，也不要求用户直接操作独立的结构化提问产品。

## 2026-06-18

### 触发

开发工作流需要本地浏览器界面，同时保持执行层和展示层的边界。

### 变化

将 Navia 合入为 Spark 的本地 Web 工作台，任务启动通过 Spark runtime bridge。
Spark 持有执行状态，工作台数据库只作投影和缓存。随后 runner 收敛为 Spark daemon。

见 [本地 Web 工作台合入提交](https://github.com/zendev-lab/spark/commit/f36530348d229b0fde7899bf2d2aef24e066f495)与
[daemon 命名收敛提交](https://github.com/zendev-lab/spark/commit/4833e396c6c86bf0b5ed66e8dde45f0431bebc8d)。

### 理由

新增产品界面应消费已有执行事实，不建立第二套执行状态。

## 2026-07-23

### 触发

自治任务需要在界面断开、daemon 重启和重试后继续运行；由前端计时会分散运行状态。

### 变化

daemon 成为自治运行时的唯一 owner：计时、generation、重试、恢复、隐藏执行生命周期
进入 SQLite，每次 tick 通过既有 Invocation scheduler 与 session fence 执行。
前端发送控制命令并呈现状态。每个 Unix 用户独立运行 daemon。

单一 `@zendev-lab/spark` 产品包承载发布面，内部 workspace 保持私有；Side Thread
通过共享的 daemon controller 创建、恢复和 handoff，不由各界面自行实现。

见 [自治运行时收敛提交](https://github.com/zendev-lab/spark/commit/af6f1e8b24946356498529196f5c539b9691786e)。

### 理由

执行事实需要一个耐久所有者。运维便利、日志和外部观察面可以扩展，但不能成为第二个运行时；不引入外部 durable engine，除非隔离实验能证明现有本地机制不足。

## 2026-08-11

### 触发

文档与产品出现多套成果分类，易将临时状态和交付拓扑重复保存。

### 变化

用户成果收敛为 `issue | git_change | document` Artifact；一个 git_change 拥有一个
worktree 和原生 GitHub PR stack，Task 用耐久 artifactRefs 组织成果，preview 是 Document
的视图。GitHub stack 的可写拓扑由 gh stack 管理，默认创建 Draft PR。
CI、review 和 conflict 反馈应以幂等事件回到原 session，并携带可审查的证据。

见 [成果与内容职责收敛](https://github.com/zendev-lab/spark/pull/310)。

### 理由

让 Task 组织成果、Artifact 持有成果自身的身份和边界，避免独立 Workstream aggregate 或第二套可写 PR 拓扑。

## 2026-08-12

### 触发

会话的生命周期、角色能力和一次执行需要各自明确的所有者。

### 变化

Role 表达静态行为与能力，Session 表达执行上下文，Invocation 表达一次执行。
Session Owner 只表达生命周期和资源归属，不能代替能力或授权。

内建 Role 限定为 administrator、explorer、executor、reviewer；Role revision 在 Invocation 开始时冻结。

见 [会话生命周期决策](https://github.com/zendev-lab/spark/pull/307)。

### 理由

资源归属不能隐式授予工具能力。Registry 只存严格状态，lifetime 与 activity 从 Owner 和 Invocation 事实派生。

## 2026-08-20

### 触发

Agent 的恢复与释放需要 session、provider registry 和运行循环共享生命周期；分离的 LLM 和每次 drive 的组合重复持有资源。

### 变化

采用 daemon 进程内唯一的 Cordis root，组合 Spark store、Session persistence、
attachment、LlmRuntime、SystemPrompt、ToolRuntime、AgentRegistry 与 AgentLoop。
Invocation 按 Session ID 创建或恢复 Agent，flush 后释放该次 handle 与路由。

- Spark SQLite 继续拥有 Session、Invocation、channel、fleet 和 retry。
- DSH 拥有模型/tool 驱动与原生 transcript；Spark 实现 PersistenceBackend，
  保留会话投影，不采用另一套 Session projection。
- ExecutionAttempt 由 daemon 持久化，一次 attempt 至多对应一个 DSH Turn。
- Pi SDK 的 `pi-ai` 保留为模型 transport；LLM abstraction 由 `dsh-llm` 拥有，
  provider 实现通过 `spark-llm-providers` 接入。

见 [Cordis 生命周期决策](.agents/notes/decisions/2026-08-20-dsh-cordis-composition.md)。

### 理由

共享进程生命周期可以消除重复组合，同时保持 daemon 调度和持久状态的唯一所有权。Cordis Fiber 不等于 Spark Session，DSH inbox 也不成为另一套 scheduler。

## 2026-08-21

### 触发

独立 extension 已不再是可复用内核；消息平台会话绑定 Workspace 也造成错误归属。

### 变化

`apps/spark-daemon/src/product` 成为唯一产品组合实现，daemon workspace 是唯一组合根。
静态组合受支持的 Spark 策略与 DSH/Cordis 插件，不再建立 Spark extension 发现路径、
`package.json#pi` manifest、`spark-base` 或第二套 facade。

Channel Session 改为无需 Workspace 的 daemon-scoped root，以账号身份和 external key
区分会话，cwd 位于私有 daemon data root。Cordis 负责 transport 生命周期；Registry、
Invocation、outbox、retry、human wait 和 SQLite 仍由 daemon 持有。

跨表面的 ask、gate、slash/action、状态和可展示错误由 `spark-protocol` 定义，
各界面消费同一语义，传输层只校验和翻译。

见 [产品组合决策](.agents/notes/decisions/2026-08-21-daemon-product-composition.md)与
[daemon-global Channel 决策](.agents/notes/decisions/2026-08-21-daemon-global-channel-sessions.md)。

### 理由

把代码和状态放回实际生命周期 owner，避免表面上的包边界造成重复实现。daemon-global 会话使未注册 Workspace 的安装也能服务消息入口，并避免远程会话隐式获得仓库权限。

## 2026-08-22

### 触发

此前逐 Workspace 注册与授权，而同一机器的多个 Workspace 实际由一个 daemon 承载。

### 变化

Hub 以 daemon 为绑定单位，拥有跨 workspace 的协调、投递幂等、审计和有限回执；
目标 daemon/workspace 始终拥有执行、副作用和本地成果。Hub 不复制 Artifact、
直接接管目标 Session 或扩展跨 Hub Federation。浏览器未 ack 的乐观输入与 daemon
耐久 pendingTurns 保持各自职责。

见 [Hub 注册单位调整](https://github.com/zendev-lab/spark/pull/476)。

### 理由

以真实部署单位组织注册与呈现，减少重复流程；Workspace 继续承担执行上下文、会话容器、租约和路由职责。

## 2026-08-23

### 触发

本地 Web 仍过度依赖 Workspace 导航，产品界面、包命名与权限模型尚未反映真正的状态所有者。

### 变化

`spark web` 成为默认本地浏览器产品，以 daemon-wide Session tree 与 active Invocation
为首页；Workspace 保留为执行上下文、组织和过滤信息。此时暂保留独立的 Web DSH 应用。

`/plan`、`/execute`、`/fleet` 改为一次性工作意图命令，只影响当前 Invocation，
不改变工具、sandbox、审批或 admission；持久 Session mode 退出。
Fleet 复用 TaskGraph、TaskRun、资源调度器与 Session Registry，worker 只消费 Task
关联的 git_change worktree，不新增 Fleet store。

精确包清单和依赖方向由 [architecture/packages.json](architecture/packages.json)
及 [包架构合同](.agents/notes/contracts/package-architecture.md)维护。
见 [Web 与包规范化决策](.agents/notes/decisions/2026-08-23-web-replacement-and-package-normalization.md)。

### 理由

以 Session 和 Invocation 为产品中心，可以让本地 Web、Hub 与消息通道呈现同一执行事实。命令只表达意图，权限由实际运行边界判断；包和状态只因明确的 owner 边界而拆分。

## 2026-08-25

### 触发

Web 工具需要适配 DSH 的生命周期和 provider 接口，同时保持通用工具与 Spark 产品状态的边界。

### 变化

通用 Web 工具转为 Cordis-native `dsh-tool-web`，使用官方 `ctx.web` provider seam，
只保留 Agent 生命周期内的有界恢复缓存，删除旧 code_search 与 fetch_content 名称。
通用 `dsh-*` 必须能脱离 Spark 运行并通过 real-host smoke；`spark-*` 持有产品状态、
策略、daemon/protocol 或专用 provider。Cue 语义由 dsh-cue 拥有，adapter 只处理 host ABI、
权限和呈现。ACP 在官方 daemon durable admission seam 完备前保持 Spark owner。

见 [DSH Web 决策](.agents/notes/decisions/2026-08-25-dsh-tool-web.md)。

### 理由

依赖闭包和真实运行边界比包名前缀更能决定复用范围。只采用能够接入现有 owner 且有本地证据的机制，不整套引入外部产品。

## 2026-08-31

### 触发

子 Agent 的模型、reasoning 与输出上限需要在创建时确定，fork 又需要继承父路由以复用上下文。

### 变化

产品 subagent 是 Role-bound 子 Session。官方 DSH subagent 提供 HOST，spark-session
注册 spawn/fork provider；daemon 先挂 HOST，再挂 session 插件。
子 Session 原子固化模型路由、reasoning 与输出上限；fresh spawn 使用官方模型选择，
fork 保持父路由，dispose 经 daemon 取消并等待静止。

见 [子 Session 模型配置提交](https://github.com/zendev-lab/spark/commit/0a38be3e0b1b05e070a656dc32e78d65c0b814e6)。

### 理由

沿用官方 host 与 daemon 持久化边界，避免重写 ctx.subagents 或另建 dsh-spark 包。compaction 与 jobs 仍需后续独立决策。

## 2026-09-04

### 触发

仓库所有者明确批准移除 spark-web-dsh，将开发集中到使用 DSH 内核的原生 spark-web。

### 变化

原生 `spark web` 成为唯一的本地浏览器产品。删除 Web DSH 应用、CLI 分发与构建入口，
以及只属于该应用的 spark-standard / spark-ptc preset；已有用户 profile 和 Session 数据保留。
Pi 产品宿主、pi-spark 发现适配器、pi-tui 与原生 TUI 已退出，`pi-ai` 模型 transport 继续保留。

后续方向继续围绕跨表面协议、daemon 自治运行、可审查的交付反馈与显式 sandbox
边界推进。完成证据门禁如何区分人工、审查和执行任务，以及如何恢复历史任务中被摘要
覆盖的原始意图，仍是开放问题。

见 [Web DSH 退役决策](.agents/notes/decisions/2026-09-04-retire-spark-web-dsh.md)。

### 理由

集中维护原生 Web，移除不再需要的产品宿主和托管 preset。产品表面退役不等于剥离模型 SDK，也不授权清理用户数据。
