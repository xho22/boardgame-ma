# 部署文档

## 1. 生产启动

生产环境使用单一 Node 进程，默认端口为 `8787`。它同时提供：

- `GET /`：React 构建产物
- `GET /health`：健康检查，返回 `{ "status": "ok" }`
- `GET /ws`：在线房间 WebSocket

启动：

```bash
npm ci
npm run start
```

可通过环境变量调整监听地址和端口：

```bash
HOST=127.0.0.1 PORT=8787 npm run start
```

开发环境仍使用两个进程：`npm run dev` 固定占用 `5173`，`npm run server` 固定占用 `8787`；Vite 会将同源 `/ws` 代理到后者。生产环境不运行 Vite，也不需要第二个公网端口。

## 2. Cloudflare Tunnel 推荐方案

推荐使用 Cloudflare Tunnel 将一个子域名映射到本机或服务器上的 Node 进程。这样无需开放入站端口，也不需要为 Node 单独配置 TLS。

Tunnel 配置示例：

```yaml
ingress:
  - hostname: game.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

将该 Tunnel 绑定到域名后，浏览器访问 `https://game.example.com/`；在线房间会自动连接同源的 `wss://game.example.com/ws`。前端不再写死端口或独立 WebSocket 域名。

## 3. WebSocket 可靠性

客户端每 25 秒向 `/ws` 发送一次 `HEARTBEAT`，避免空闲连接被中间网络关闭。连接仍可能因网络切换、浏览器休眠、Cloudflare 边缘维护或服务进程重启而关闭；客户端会以 1、2、4、8、10 秒的上限退避自动重连，并通过已保存的 `playerId` 重新加入原座位。

心跳和自动重连只保证连接恢复，不保证服务进程重启后的比赛恢复。当前房间与比赛状态保存在 Node 进程内存中，进程重启、部署重启或崩溃后会清空。正式长期使用前应将 `RoomState` 持久化到 SQLite、Postgres 或等价存储。

## 4. 运行边界

- 固定房间名不是访问控制。任何知道域名和房间名的人都可以以任意昵称加入；公开部署前至少应增加房间口令或简单的邀请码。
- 一台单实例 Node 服务适合当前家庭用途。若以后扩容为多个 Node 实例，必须将房间状态外置，并保证同一房间的 WebSocket 始终路由到同一权威实例。
- 若改为 Cloudflare Workers，现有 `ws` Node 服务不能直接部署；应将每个房间改造成一个 Durable Object，并把比赛状态写入 Durable Object Storage。这是未来架构迁移，不是本次单端口部署所必需的改动。
