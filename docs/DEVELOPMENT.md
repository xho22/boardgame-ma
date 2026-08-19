# 开发文档

## 7. 数据结构

## 7.1 GameState

```ts
type GamePhase =
  | "home"
  | "setup"
  | "teamReveal"
  | "selecting"
  | "raceReveal"
  | "racing"
  | "raceResults"
  | "finalResults";

type GameState = {
  phase: GamePhase;
  gameId: string;
  roomId?: string;
  settings: GameSettings;
  players: Player[];
  athletes: Athlete[];
  raceIndex: number;
  races: RaceSummary[];
  activeRace: RaceState | null;
  selectionState: SelectionState | null;
  log: GameLogEntry[];
  rngSeed: string;
  revision: number;
};
```

`GameSettings` 增加 `racersPerPlayerPerRace: 1 | 2`。默认值为 `1`；仅 2-3 人局允许设置为 `2`。当该值为 `2` 时，每名玩家每场秘密选择 2 名 racer，初始发牌数默认为 `racesCount * racersPerPlayerPerRace`。

还需增加 `boardMode: "alternating" | "allSpecial"`：默认 `alternating`，第 2、4 场为特殊棋盘；Debug 设置可选 `allSpecial`，令每场均使用特殊棋盘。`RaceState` 应保存已派生的 `boardKind: "normal" | "special"`，避免客户端或在线房间自行根据 `raceIndex` 推断。

## 7.2 Player

```ts
type Player = {
  id: string;
  name: string;
  color: string;
  score: number;
  athleteIds: string[];
  usedAthleteIds: string[];
  firstPlaces: number;
  secondPlaces: number;
  isAI: boolean;
  connectionId?: string;
  isConnected?: boolean;
};
```

## 7.6 RoomState

本地模式不创建房间，继续直接使用浏览器状态和 localStorage。阶段 11 的在线服务将权威 `GameState` 放进内存固定房间中同步；两种模式共享规则引擎，但彼此不依赖。

```ts
type RoomState = {
  roomId: string;
  roomName: string;
  hostPlayerId: string;
  status: "waiting" | "playing" | "complete";
  playerSlots: PlayerSlot[];
  gameState: GameState | null;
  createdAt: number;
  updatedAt: number;
};

type PlayerSlot = {
  slotIndex: number;
  playerId: string | null;
  playerName: string;
  color: string;
  isOccupied: boolean;
  isConnected?: boolean;
  isAI: boolean;
};
```

## 7.3 Athlete

```ts
type Athlete = {
  id: string;
  sourceKey: string;
  displayName: string;
  type: AthleteType;
  abilityText: string;
  abilityHooks: AbilityTiming[];
  implementationKey: AbilityImplementationKey;
  imagePath: string;
  maxUsesPerRace?: number;
  maxUsesPerGame?: number;
  tags: string[];
  artPrompt: string;
};
```

## 7.4 RaceState

```ts
type RaceState = {
  id: string;
  raceNumber: number;
  trackLength: number;
  boardKind: "normal" | "special";
  firstPlacePoints: number;
  secondPlacePoints: number;
  turnOrder: string[];
  currentTurnIndex: number;
  entrants: Entrant[];
  finishers: Finisher[];
  round: number;
  previousFinalMoveValue: number | null;
  pendingReactions: ReactionPrompt[];
  status: "revealing" | "active" | "complete";
};
```

特殊棋盘配置应为规则模块中的不可变结构，例如 `SPECIAL_TRACK_SPACES: Record<number, TrackSpaceEffect>`，包含格号、效果类型与移动/得分参数。`Track` 只消费该配置以绘制标记；格子效果必须由规则引擎结算，不能由组件直接改位置或分数。

`turnOrder` 存储的是 entrant id，而不是 player id。每名玩家每场 1 名 racer 时，entrant id 与 player id 相同以兼容旧流程；每名玩家每场 2 名 racer 时，entrant id 使用类似 `player-1:racer-1`、`player-1:racer-2` 的格式。双 racer 模式按玩家交错排序，例如 `player-1:racer-1`、`player-2:racer-1`、`player-1:racer-2`、`player-2:racer-2`。

## 7.5 Entrant

```ts
type Entrant = {
  id: string;
  playerId: string;
  athleteId: string;
  copiedAbilityKey?: AbilityImplementationKey;
  predictedWinnerEntrantId?: string;
  position: number;
  finished: boolean;
  finishRank: number | null;
  eliminated?: boolean;
  skippedTurns: number;
  actionCount: number;
  abilityUses: Record<string, number>;
  temporaryEffects: TemporaryEffect[];
};
```

## 8. 游戏引擎

## 8.1 目录结构

```text
src/
  game/
    types.ts
    constants.ts
    athletes.ts
    scoring.ts
    rng.ts
    setup.ts
    selection.ts
    raceEngine.ts
    movement.ts
    abilityEngine.ts
    abilityImplementations.ts
    ai.ts
  store/
    gameStore.ts
    persistence.ts
  components/
    App.tsx
    HomeScreen.tsx
    SetupScreen.tsx
    TeamRevealScreen.tsx
    SelectionScreen.tsx
    RaceRevealScreen.tsx
    RaceScreen.tsx
    RaceResultsScreen.tsx
    FinalResultsScreen.tsx
    AthleteCard.tsx
    Track.tsx
    DicePanel.tsx
    GameLog.tsx
  styles/
    globals.css
```

## 8.2 核心命令

UI 不直接改状态，而是调用游戏命令。

```ts
startNewGame(settings)
assignTeams()
beginSelection()
selectAthlete(playerId, athleteId)
revealRace()
rollForCurrentPlayer()
acceptRoll()
useAbility(payload)
advanceMovement()
finishRace()
beginNextRace()
finishGame()
```

所有命令都应该设计成可序列化的 `GameCommand`，这样未来在线模式可以直接把命令通过 WebSocket 或 HTTP 发给服务器。

```ts
type GameCommand =
  | { type: "START_GAME"; payload: GameSettings }
  | { type: "ASSIGN_TEAMS" }
  | { type: "BEGIN_SELECTION" }
  | { type: "SELECT_ATHLETE"; playerId: string; athleteId: string }
  | { type: "SET_MASTERMIND_PREDICTION"; athleteId: string; predictedAthleteId: string }
  | { type: "SET_BEFORE_RACE_COPY_CHOICE"; athleteId: string; copiedAthleteId: string }
  | { type: "LOCK_SELECTION"; playerId: string }
  | { type: "REVEAL_RACE" }
  | { type: "ROLL_DICE"; playerId: string; choice?: MainMoveChoice }
  | { type: "USE_ABILITY"; playerId: string; payload: unknown }
  | { type: "CONFIRM_REACTION"; playerId: string; reactionId: string; accepted: boolean; targetEntrantId?: string }
  | { type: "BEGIN_NEXT_RACE" }
  | { type: "FINISH_GAME" };
```

兼容说明：`ROLL_DICE.playerId` 是历史字段名。本地 1 racer 模式下它等于玩家 id；2 racer 模式下它传入当前行动的 entrant id，例如 `player-1:racer-2`。服务端同步时应把它视为 `actorId`。`choice` 用来记录本次主移动前后的玩家选择，例如 Legs 是否直接移动 5 格、Flip Flop 是否换位、Rocket Scientist 是否加倍。`SET_MASTERMIND_PREDICTION` 与 `SET_BEFORE_RACE_COPY_CHOICE` 都在 Race Reveal 阶段写入选择状态；后者只接受 Egg 的三名候选，或 Twin 的历史冠军角色。

命令处理函数必须是纯规则逻辑：

```ts
function reduceGameCommand(
  state: GameState,
  command: GameCommand,
  rng: Rng
): GameState
```

本地模式：

```text
React UI -> Zustand store -> reduceGameCommand -> 更新本地状态
```

在线模式：

```text
React UI -> 发送 GameCommand -> 服务端校验并执行 -> 广播新 GameState
```

两种模式必须以同一份 `GameState`、`GameCommand` 与 `reduceGameCommand` 为规则核心。建议在 UI 和 store 之间定义轻量的游戏会话接口：本地会话直接派发命令，在线会话发送命令并等待服务端 `STATE_SYNC`；比赛页面只消费会话提供的状态与操作，不自行判断模式。这样本地角色测试与 Debug 流程不依赖服务端，也不会被在线功能回归影响。

模式选择在首页完成。`local` 是默认模式，保留现有 localStorage 存档；`online` 进入固定房间页。在线服务未启动或连接失败时，只禁用在线入口内的操作，不阻断 `local` 模式。

## 8.3 随机数

使用可种子化随机数，便于复盘和测试。

```ts
type Rng = {
  nextFloat(): number;
  rollDie(sides: number): number;
  shuffle<T>(items: T[]): T[];
};
```

每次新游戏生成 seed。调试模式可以输入 seed 复现同一局。

## 8.4 日志

所有关键事件写入日志。日志是游戏可理解性的核心 UI，不只是调试输出。

日志类型：

```text
race_start
athlete_reveal
turn_start
dice_roll
ability_trigger
movement
position_swap
status_added
finish
score_awarded
race_end
game_end
```

日志文案应该短，但足够解释发生了什么、为什么发生、导致什么结果。能力触发时至少记录：

- 触发源：哪名选手或哪个赛道格。
- 触发条件：例如 passing、sharing a space、roll 1、before main move。
- 目标对象：影响了哪名选手。
- 结果：移动了几格、是否 trip、是否 warp、是否冲线、是否得分。

特殊棋盘日志还必须说明“落到第 N 格特殊格”、效果和结果，例如“爸爸的长腿落到特殊格 7，前进 3 格到 10。”

日志必须由规则引擎或命令结算层生成，UI 只负责展示。

日志展示规则：

- 比赛日志使用中文玩家文案。
- 最新日志显示在最上方。
- 序号使用日志真实追加顺序，不能因为倒序显示而重新从 1 开始编号。
- 日志区域保留滚动条，超过可视高度后向下滚动查看历史，不丢弃超过 10 条的记录。

示例：

```text
小宇的「Legs」不掷骰，选择 main move 5 格。
爸爸的「Banana」被 passing，令「Legs」trip。
妈妈的「Suckerfish」跟随同格选手移动到新位置。
```

## 9. UI 与视觉设计

## 9.1 设计方向

视觉关键词：

- 彩色
- 清楚
- 轻松
- 儿童友好
- 桌游组件感

避免：

- 过暗
- 过度霓虹
- 信息藏得太深
- 一屏塞满说明文字

## 9.2 页面布局

桌面端：

- 赛道横向居中
- 当前行动区固定在下方
- 日志在右侧
- 玩家分数在顶部

移动端：

- 顶部显示分数条
- 赛道横向滚动或压缩显示
- 当前行动区在赛道下方
- 日志折叠成抽屉

## 9.3 角色卡

角色卡尺寸要稳定，避免文字撑开布局。

卡牌内容：

- 头像
- 名称
- 类型
- 能力短文本
- 使用状态

长能力文本在卡牌上只显示摘要，详情弹窗中显示完整说明。

## 9.4 动画

必须有：

- 骰子滚动动画，点击后约 2 秒内在 1 到 6 间快速变化，再显示真实结果
- 棋子逐格移动，普通 move 和后退必须能看出经过的每一步
- 能力触发闪烁
- warp、换位、淘汰等非连续位置变化的高亮或淡入淡出反馈
- 冲线动画
- 分数增加动画

可选：

- 角色登场动画
- 超越提示
- 回合切换音效

动画时长建议：

```text
骰子：约 2000ms
每格移动：120ms 到 200ms
能力提示：700ms
冲线：900ms
```

需要提供“快速模式”，将骰子滚动和棋子移动速度缩短，但不能完全取消关键反馈。

动画排序原则：

- 状态先由规则引擎结算，UI 根据新旧状态补中间动画帧。
- 同一次 move 的棋子应逐格追到目标位置。
- 如果能力造成多个棋子移动，应按规则结算顺序播放或分组播放，不能让玩家无法判断因果。
- 动画结束后再推进下一步会改变玩家决策的交互。
- 特殊格必须在落点动画结束后显示一次明确反馈；特殊格的前进或后退再逐格播放，不能只更新最终位置。

## 10. AI 玩家

第一版 AI 只需要能填补人数。

## 10.1 选择角色

AI 选择逻辑：

```text
如果是最后一场，选择估值最高的未使用角色
如果当前总分落后，优先选择反转型、爆发型、干扰型
如果当前领先，优先选择稳定型、防御型
否则随机选择中等强度角色
```

## 10.2 主动能力

AI 使用主动能力时：

- 干扰能力优先选择当前领先角色
- 复制能力优先在上一移动值大于等于 5 时使用
- 重掷能力在骰子小于等于 3 时使用
- 防御能力总是自动使用

## 14. 技术建议

推荐技术栈：

- Vite
- React
- TypeScript
- Zustand
- Framer Motion
- Lucide React
- Vitest
- Playwright

理由：

- React 适合状态驱动 UI
- TypeScript 适合复杂规则建模
- Zustand 简洁，适合小游戏
- Framer Motion 足够处理棋子和面板动画
- Vitest 和 Playwright 能覆盖规则和界面

## 14.1 在线多人预留方案

未来不需要复杂多租户，也不需要账号系统。推荐做成“固定房间 + 昵称加入”的轻量模式。

### 房间模型

可预置几个固定房间：

```text
room-a
room-b
room-c
family-room
```

玩家进入 `/room/family-room` 后：

1. 输入昵称。
2. 选择一个空座位。
3. 房主点击开始。
4. 游戏状态由房间统一维护。

不做公开大厅，不做搜索，不做好友系统。

### 同步方式

推荐优先级：

1. WebSocket：体验最好，适合实时同步掷骰、移动、选择状态。
2. Server-Sent Events + HTTP command：实现较简单，服务端推状态，客户端发命令。
3. 轮询：最简单，但体验一般。

如果使用 React + Vite，后续可以升级为：

- 前端：React
- 后端：Node.js + Fastify
- 实时：WebSocket
- 状态存储：内存 Map 起步
- 持久化：JSON 文件或 SQLite 可选

### 服务器状态

简化实现可以只在内存里保存固定房间：

```ts
const rooms = new Map<string, RoomState>();
```

服务端重启后房间清空即可。家庭使用不需要复杂恢复。

如果想支持刷新恢复：

- 浏览器保存 `playerId`
- 服务端房间保存 `connectionId`
- 玩家重新加入时根据 `playerId` 重新绑定座位

### 权威状态

在线模式必须避免两个终端同时改状态。

规则：

- 服务端是权威状态。
- 客户端只发送命令，不直接决定结果。
- 掷骰必须在服务端执行。
- 每个命令带上客户端看到的 `revision`。
- 如果 revision 过旧，服务端拒绝命令并返回最新状态。

阶段 12 当前实现：`RoomService` 对每个连接单独生成选角阶段的客户端视图，其他玩家的 `athleteIds` 与选择结果不会发送到当前终端；公开揭示后才广播完整阵容。服务端同时校验命令携带的玩家或 racer 归属，拒绝代替其他玩家选角、掷骰或确认反应。

在线创建共享局时，玩家人数和昵称由已占用的房间座位生成；房主通过 `START_SHARED_GAME.options` 传入 `racersPerPlayerPerRace` 与 `debugMode`，服务端调用同一套 `normalizeSettings` 校验后创建权威 `GameState`。

客户端在在线模式不可直接调用 reducer 或写入权威比赛状态；本地模式则继续直接调用同一 reducer。服务端、WebSocket、房间状态和连接身份只能放在 `server/`、`src/network/` 或在线会话实现中，禁止渗入 `src/game/` 的纯规则模块。

命令格式：

```ts
type ClientCommandEnvelope = {
  roomId: string;
  playerId: string;
  revision: number;
  command: GameCommand;
};
```

服务端响应：

```ts
type ServerMessage =
  | { type: "STATE_SYNC"; room: RoomState }
  | { type: "COMMAND_REJECTED"; reason: string; latestRoom: RoomState }
  | { type: "PLAYER_JOINED"; playerId: string }
  | { type: "PLAYER_LEFT"; playerId: string };
```

### 私密选择

本地同屏模式需要遮挡页。在线模式可以真正私密。

在线选择规则：

- 每个玩家只能看到自己的可选角色。
- 其他玩家只看到“已锁定/未锁定”。
- 服务端保存所有选择。
- 所有人锁定后，服务端广播揭示结果。

选择状态：

```ts
type SelectionState = {
  raceNumber: number;
  activePlayerId: string | null;
  selectionsByPlayerId: Record<string, string[]>;
  mastermindPredictionsByAthleteId: Record<string, string>;
  eggCandidatesByAthleteId: Record<string, string[]>;
  copiedAbilityAthleteIdByAthleteId: Record<string, string>;
  lockedPlayerIds: string[];
  revealed: boolean;
};
```

选择状态按玩家保存数组。数组长度必须等于 `game.settings.racersPerPlayerPerRace` 才允许锁定。

客户端视图过滤：

```text
自己的选择：显示角色名
别人的选择：只显示已锁定
揭示后：显示全部
```

### 固定房间权限

不做账号时，可以采用很简单的权限：

- 第一个进入房间的人是房主。
- 房主可以开始游戏、重开游戏、踢出空闲连接。
- 普通玩家只能控制自己的座位。
- 如果房主离开，最早加入且仍在线的玩家自动成为房主。

### 两人异地游玩流程

未来在线版中，父子两端可以这样玩：

```text
爸爸打开 /room/family-room
爸爸输入昵称，占用红色座位
儿子打开同一个链接
儿子输入昵称，占用蓝色座位
爸爸点击开始
两边各自秘密选择角色
服务器揭示
轮到谁，谁的终端出现掷骰按钮
另一端实时看到移动和日志
4 场后同步显示最终排名
```

### 对第一版代码的要求

为了以后顺利升级，第一版即使只做本地模式，也要遵守：

- 不在组件里直接写游戏规则。
- 不让 UI 自己生成骰子结果。
- 所有用户操作都变成 `GameCommand`。
- `GameState` 可 JSON 序列化。
- 不在状态里保存函数、DOM、React 组件。
- 每次状态变化递增 `revision`。
- 日志由规则引擎生成，不由 UI 拼接。
- 私密选择状态和揭示状态分开。

## 15. 开发注意事项

## 15.1 防止死循环

能力之间可能互相触发。必须设置：

- 每个能力每次行动触发上限
- 每个行动最大连锁次数，例如 20
- 超过上限时写入日志并停止继续触发

## 15.2 可读性优先

孩子一起玩时，最重要的是知道发生了什么。

每次能力触发都要：

- 高亮触发角色
- 显示简短浮层
- 写入日志
- 动画结束后再进入下一步

## 15.3 主动响应能力

某些角色可以在别人行动时插手。为了避免流程卡住，第一版可以使用半自动策略：

- 防御型能力自动触发
- 干扰型能力弹出确认
- 超过 10 秒未选择则默认不使用

本地亲子模式下，可以关闭计时器。

当前主动能力交互状态：

- before main move：Legs、Flip Flop、Cheerleader、Hypnotist、Third Wheel 已有本地 UI 选择。
- before main move：Party Animal 已改为主动选择；Copycat 会将唯一领先者的有效能力传入同一套操作面板与规则结算，赛前复制能力除外。
- pre-roll prediction：Genius 已有本地猜点数 UI，预测值通过 `ROLL_DICE.choice.geniusGuess` 进入规则结算。
- after move optional reaction：Suckerfish 已通过 `pendingReactions` 弹出跟随确认；确认后再继续本回合剩余结算。
- 所有能力定义为 `move` 的额外位移统一通过 `moveEntrantInRace` 进入吸盘鱼反应队列；骰子商人重投造成的移动会先完成吸盘鱼确认，再恢复原角色的重投结算。warp、换位和推挤不走此路径。
- after roll：Alchemist、Magician、Rocket Scientist 已在骰面出现后使用 `pendingDiceDecision` 暂停并确认；Magician 最多重掷 1 次。
- on other roll：Dicemonger 已使用 `pendingReactions` 让掷骰者选择保留或重掷；Inchworm、Lackey 目前仍按规则自动反应。
- before race copy：Egg 在全部锁定后由 seed RNG 抽取 3 名未参赛候选；Twin 读取历史比赛的第一名角色。两者都通过 `SET_BEFORE_RACE_COPY_CHOICE` 保存玩家选择，并在开始比赛前校验。
- sharing optional reaction：Duelist 在同格时通过 `pendingReactions` 请求确认，并由客户端提交所选的 `targetEntrantId`；结算只移动决斗获胜者 2 格，平局归 Duelist。
- Copycat 在 entrant 上保存并列领先时的 `copiedLeaderEntrantId` 与领先集合签名；领先集合改变时，规则引擎通过 `pendingReactions` 的 `copy` 提示请求选择。若提示出现在模仿猫自己的回合开始前，确认后恢复该回合；若由其他选手移动引起，则在该反应链中结算。
- Duelist 的决斗奖励属于正常 `move`：若胜者前进 2 格后与选手同格，仍会继续进入同格反应并可再次发起决斗。
- 特殊棋盘格由统一的落点结算入口处理：主移动、所有技能位置变化、跟随、换位与 warp 落到特殊格时均要触发；由特殊格带来的前进或后退会继续进入相同的移动、能力与特殊格结算链。

trip UI 状态：

- 棋盘头像根据 `entrant.skippedTurns > 0` 判定是否倒置。
- 轮到 trip 中的 entrant 时，DicePanel 不显示掷骰操作，显示“绊倒恢复中”和自动推进提示。
- 自动恢复仍然通过 `ROLL_DICE` 命令进入规则引擎，保持日志、回合推进和未来在线同步路径一致。

## 15.4 版本校准

由于不同版本角色池和能力数量可能不同，角色实现要数据化。

后续如果拿到实体卡牌能力清单，只需要更新：

- `sourceKey`
- `displayName`
- `abilityText`
- `implementationKey`
- 少量参数

不应重写引擎。
