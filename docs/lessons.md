# 教训

只记录已经造成过回归、以后必须检查的规则。每条给出来源 commit（仓库历史中真实存在）或代码
路径；没有可自动化的回归时明确写“待核实”，不要编造 issue/PR 编号。

| 日期 | 主题 | 症状 | 根因 | 规则 | 回归测试或来源 |
| --- | --- | --- | --- | --- | --- |
| 2026-11-04 | 系统代理 | 浏览器能打开站点，HGhubX 一直直连失败；只有 TUN 模式看起来正常 | `reqwest` 使用 `default-features = false`，漏了 `system-proxy`，应用不读 Windows/macOS 固定代理 | 显式保留 `system-proxy` feature；代理模式/地址变化要能重建客户端；不要用“浏览器能开”代替应用层验证 | `1260a70`；`src-tauri/Cargo.toml` 的 reqwest feature；`src-tauri/src/net/tests.rs` 的 `ProxyRoute`/`client_key` 测试 |
| 2026-11-09 | Android 自定义协议 | 接口正常，m3u8 一加载就 `manifestLoadError`/networkError | 部分 Android WebView 拦截 `http://hg.localhost` 时不给 `Origin`，严格模式把缺失 Origin 当成外部来源 | 进程内媒体地址可放行缺失/空/`"null"` Origin，但必须同时校验 Host、capability 和 `/img`、`/hls`、`/seg` 白名单；不能放宽业务 origin | `30cde3d`；`src-tauri/src/lib.rs` 的 `origin_ok`；Android 实机回归待核实 |
| 2026-11-09 | Linux 媒体传输 | Linux 桌面 `<video>` 打不开 `hg://`；hls.js 也没有 MediaSource | WebKitGTK 把 `<video>` 交给 GStreamer，GStreamer 只认 http/https/file，不认自定义 scheme | Linux 用只监听 `127.0.0.1` 的 loopback HTTP；端口与前端 `LOCAL` 同步；WebView 对本机媒体绕过 GNOME 代理 | `683ffaf`；`src-tauri/src/linux_http.rs`、`linux_webview.rs`（原 CSP 回归脚本已随测试精简移除，契约见 network-proxy-media.md） |
| 2026-11-10 | 自动选线 | 主站和镜像都不通时客户端仍切到 `.ai`，随后接口全 404 | 选线只看“能连/能返回 200”，没有验证解包后的视频列表；all-down 仍返回可切换地址 | 选线判据必须是真实 `items/pagination` 数据；全部不可用时返回 `all-down` 并保持当前线路 | `87b42f1`；`src-tauri/src/lines/probe.rs` 的 `healthy_video_data`/`pick_from_hits` 测试 |
| 2026-11-10 | seek 与播放意图 | 原本暂停的视频拖动/点击进度条后自动播放；或片尾 seek 后卡住 | seek 完成后无条件 `play()`，没有保留用户的暂停意图；iOS 片尾没有贴边保护 | seek 只恢复“seek 前正在播放”的状态；目标夹到 `duration - 0.15`；拖动预览与提交分离 | `73c6610`；`tests/player-seek.tsx`；`playback.md` 的 seek 状态转换 |
| 2026-11-10 | 线路代次 | 切换线路后，之前加载失败的首页/分类数据不重拉，仍显示旧错误 | `lineEpoch` 已存在但没有进入请求 key/失效判断 | 线路变化必须推进 epoch，并让列表、详情、标签门、播放地址和动作上下文都使用它；旧响应丢弃 | `dc74ff0`；`src/features/feed/useFeedDetails.ts`；`feed-and-detail.md` 的 scope/epoch 规则 |
| 2026-11-11 | 媒体 DNS | 某些网络下 DNS 解析失败后播放永久失败，重试也没有用 | 只用系统 DNS；失败后没有受控的公网 DNS 回退，且回退可能把内网/保留地址带进来 | 仅对 HTTPS 域名 + DNS/timeout/transport 错误回退；重解析后仍做地址检查并固定地址；403/404/503 不触发回退 | `24cbbdf`；`src-tauri/src/media_dns.rs` 的 `eligible`/`answers` 测试；`src-tauri/src/net/tests.rs` 的媒体 DNS 回退测试 |
| 2026-11-10 | Range 与媒体缓存 | 原生播放器 0-1 字节探测把 m3u8 截断；分片 Range 返回不完整或响应头重复 | 没有区分清单和分片；Range 解析/Content-Length 整形不完整，WebKit 对歧义 framing 敏感 | m3u8 永远完整 200；只处理单段 Range，`If-Range`/多段退回完整响应；只发一份权威 `Content-Length`/CORS | `147f6d1`；`src-tauri/src/media/response.rs` 的 Range 测试；`linux_http.rs` 的响应头测试 |
| 2026-11-15 | 收藏未知与播放恢复 | 首次同步失败时“我的”显示“还没有收藏”；后台暂停后恢复队列/HLS 重试把播放状态带错 | 把失败/缺字段当成空收藏；恢复逻辑没有按连续故障期计数，也没有保留显式暂停和媒体配置代次 | `favoritesKnown=false` 显示未知；HLS 每个连续故障期最多 4 次，`MANIFEST_LOAD_ERROR` 用 `loadSource`，覆盖页不发请求；媒体缓存按配置代次隔离 | `3d075a2`；`scripts/test-account-sync-empty-state.mjs`；`scripts/test-playback.mjs`、`tests/player-seek.tsx` |
| 2026-11-10 | 一次性设置迁移 | 老用户升级后“上下划切集”被旧默认 `false` 关掉，看起来像新功能没生效 | 旧配置里的 `false` 是历史默认，不是用户显式选择；迁移没有独立标记 | 迁移先写新键，再清旧键；一次性默认值升级用单独 marker，不能覆盖用户后来显式选择 | `5954ea6`；`scripts/test-storage-migration.mjs`；`storage-and-preferences.md` |
| 2026-11-17 | 设置页 smoke 定位 | CI 的线路测试等待“播放源”按钮超时 | 设置分组默认折叠，脚本未通过分组按钮展开；另有旧推荐列表断言与当前仅渲染 `items` 的实现失配 | 先用分组按钮的可访问名称展开并检查 `aria-expanded`，再操作组内控件；镜像断言对应实际发布项，保留切线、取消、会话和复制失败断言 | [CI 43949517841](https://github.com/zxsos/HGhubX/actions/runs/43949517841/job/133587970186)；`src/features/settings/SettingsSection.tsx`、`LinePicker.tsx`；`scripts/test-line-selection.mjs`、`scripts/test-diagnostic-copy.mjs`、`scripts/test-network-settings.mjs` |
| 2026-11-17 | 播放测试前置条件 | 手势测试等待播放超时；失活后延迟挂载测试等不到播放器 | 首次长按教程会暂停播放；失活的 Feed 不请求播放地址，因此没有挂载播放器 | 手势测试先点击真实教程确认按钮；延迟挂载用真实 VideoSurface/Player，先确认父页面失活且无 video，再挂载并检查无播放/分片请求，激活后确认可播 | [Playback 43952408893](https://github.com/zxsos/HGhubX/actions/runs/43952408893)；`scripts/test-playback.mjs`、`tests/player-seek.tsx` |
| 2026-11-17 | 冷启动与返回键 | 启动动画期间提前挂载 App 后，从视频页按返回不弹栈；真机上动画期返回可能直接退出应用 | App 与启动动画同时注册 `back-button`；旧 fixture 只保留最后注册者且 `remove_listener` 是 no-op，动画卸载后返回仍打在已完成的动画回调上 | 覆盖层期间用 `holdBackForStartup()` 让 `runBack()` 只消费不导航；fixture 按真实 Tauri 建模多监听广播与按 channelId 注销；动画结束后恢复原有返回顺序 | `4dd7844`；`src/shared/lib/back.ts`、`src/app/startup/LaunchAnimation.tsx`、`scripts/fixtures/app-ui.mjs`；`scripts/test-inplace-search-back.mjs` |
| 2026-11-17 | 切线掉登录（#145） | 手动/自动切换线路后登录被清空，需重新登录；`.ai` 线路接口全 404 | 上游可信线路共享同一账号库（实测同 uid、token 跨线可用、收藏一致），但客户端切线一律 `session.clear()` + 前端 `setUser(null)`；`.ai` 只是导航站却被列为固定线路 | 会话跨 origin 只能走 `rebase_or_clear()`（两端都是固定/发布页确认镜像才保留，revision 递增落盘）；自定义线路永远清空；前端由 boot 决定会话，本地账号桶随 rebase 迁移并立即落盘；导航站不授予线路与凭据信任 | `12f1968`..`c5f6091`；`src-tauri/src/session.rs` rebase 测试；`scripts/test-line-selection.mjs`、`scripts/test-network-settings.mjs` |
| 2026-11-18 | 切线转圈与冷启动镜像登录 | 后台自动选线后在播视频永久转圈或报错黑屏；镜像站登录后重启切回固定线路掉登录 | `hg:line-changed` 无条件 `setWaiting(true)` 但未刷新已解析 `playUrl`；`reconcile_on_boot` 遇到固定线路跳过发布页拉取导致旧镜像不在 `TRUSTED_MIRRORS` | 区分 `hg:proxy-changed`（保 `<video>` 重连）与 `hg:line-changed`（健康在播流不置 `waiting`、其余与预取全部按新线路重解析）；`reconcile_on_boot` 必须同时验证旧存储 origin 与当前 origin | `src/features/feed/Feed.tsx`、`scripts/test-playback.mjs`；`src-tauri/src/session.rs` `boot_reconcile_verifies_stored_mirror_even_when_current_line_is_fixed` |

新回归的追加方式：

1. 在对应子系统页确认这是当前行为变化，不是提案。
2. 加一条能让旧代码失败的测试，并在本表新增一行。
3. 来源列写真实 commit/PR 或代码路径；不确定的写“待核实”，不要猜编号。
