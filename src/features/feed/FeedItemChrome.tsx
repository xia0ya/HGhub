import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import { Button } from "../../shared/ui/ios/controls";
import { Loader } from "../../shared/ui/ios/effects";
import { fmt, fmtTime } from "../../shared/api/api";
import type { Post } from "../../shared/api/types";
import type { Toast } from "../../shared/model/store";
import { PlaybackProgress, type PlaybackClock } from "../playback";
import {
  IBack, IChevR, IChevronDown, IChevronUp, ICommentF, IExpand, IFileText,
  IHeart, IHeartF, ILink, IList, IPlayF, IStar, IStarF, IVertSwap,
} from "../../shared/ui/icons";
import type { FeedMeta } from "./useFeedActions";
import type { FeedPanel } from "./useFeedViewport";

type Props = {
  isActive: boolean;
  isDesktop: boolean;
  fs: boolean;
  clean: boolean;
  mode: "home" | "context";
  kind: "video" | "post";
  title: string;
  index: number;
  effectiveLength: number;
  bottomInset: number;
  curEp: number;
  duration: number;
  meta: FeedMeta;
  post?: Post;
  hevcUrl: string;
  preferHevc: boolean;
  setPreferHevc: (v: boolean) => void;
  swipeEp: boolean;
  setSwipeEp: (v: boolean) => void;
  landscapeVideo: boolean;
  capsuleOn: boolean;
  zoom: { s: number; x: number; y: number; g: boolean };
  setZoom: Dispatch<SetStateAction<{ s: number; x: number; y: number; g: boolean }>>;
  portraitFit: "contain" | "cover";
  setPortraitFit: Dispatch<SetStateAction<"contain" | "cover">>;
  liked: boolean;
  collected: boolean;
  likePending: boolean;
  collectPending: boolean;
  heartBurst: number;
  likeCount: number;
  collectCount: number;
  paused: boolean;
  waiting: boolean;
  err: string;
  scrub: { pct: number; target: number } | null;
  barRef: MutableRefObject<HTMLDivElement | null>;
  barPct: number | null;
  playbackClock: PlaybackClock;
  onBack?: () => void;
  enterFs: (landscape: boolean) => void;
  stepDir: (dir: number) => void;
  canStep: (dir: number) => boolean;
  onLike: () => Promise<void>;
  onFav: () => Promise<void>;
  shareLink: () => void;
  setPanel: Dispatch<SetStateAction<FeedPanel>>;
  onBarDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onBarMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onBarUp: (e: ReactPointerEvent<HTMLDivElement>, cancelled?: boolean) => void;
  onRetryStream: () => void;
  toast: (msg: string, icon?: Toast["icon"]) => void;
};

export default function FeedItemChrome({
  isActive, isDesktop, fs, clean, mode, kind, title, index, effectiveLength, bottomInset,
  curEp, duration, meta, post, hevcUrl, preferHevc, setPreferHevc, swipeEp, setSwipeEp,
  landscapeVideo, capsuleOn, zoom, setZoom, portraitFit, setPortraitFit,
  liked, collected, likePending, collectPending, heartBurst, likeCount, collectCount,
  paused, waiting, err, scrub, barRef, barPct, playbackClock,
  onBack, enterFs, stepDir, canStep, onLike, onFav, shareLink, setPanel,
  onBarDown, onBarMove, onBarUp, onRetryStream, toast,
}: Props) {
  const episodes = meta.episodes;

  return (
    <>
      {/* 图文帖：没有视频就给个正文入口 */}
      {isActive && kind === "post" && !!post && !post.video_url && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Button type="button" onClick={() => setPanel("article")}
            className="flex items-center gap-2 h-11 px-5 rounded-full text-[14px] font-semibold pressable elev-3"
            style={{ background: "rgba(255,255,255,.94)", color: "#0b0e15" }}>
            <IFileText size={17} />查看图文详情
          </Button>
        </div>
      )}

      {/* 顶部 */}
      {!fs && !clean && mode === "context" ? (
        isDesktop ? (
          <div className="desktop-context-header">
            <Button onClick={onBack} aria-label="返回"><IBack size={17} /></Button>
            <span>{title}</span>
            <small>{index + 1} / {effectiveLength}</small>
          </div>
        ) : (
          <div className="absolute inset-x-0 z-20 flex items-center gap-2 px-2.5" style={{ top: "calc(var(--sat, 0px) + 8px)", paddingRight: 132 }}>
            <Button onClick={onBack} aria-label="返回" className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1"><IBack size={20} /></Button>
            <span className="text-[15px] font-semibold hg-ink hg-ov-shadow truncate">{title}</span>
          </div>
        )
      ) : null}
      {!fs && !clean && !isDesktop && mode === "context" && (
        <span className="feed-position-pill absolute z-20 px-2.5 py-1 rounded-full hg-chip text-[12px] font-semibold tabular-nums"
          style={{ top: "calc(var(--sat, 0px) + 52px)", left: 12, color: "rgba(255,255,255,.94)" }}>
          {index + 1} / {effectiveLength}
        </span>
      )}

      {/* 竖屏下的快捷操作（#19）：
          横版视频 → 保持原样，居中横排一条（画面上下有黑边，居中不压主体）；
          竖版视频 → 只剩「切集」图标，贴右边缘，避免压住画面正中。
          显隐用 opacity + 轻微位移过渡（不卸载），净屏/全屏时慢慢淡出。 */}
      {!isDesktop && (
        <div
          className={landscapeVideo
            ? "absolute z-20 w-max max-w-[calc(100%-24px)] whitespace-nowrap"
            : "absolute z-20"}
          aria-hidden={!(isActive && capsuleOn)}
          style={{
            left: landscapeVideo ? "50%" : undefined,
            right: landscapeVideo ? undefined : 8,
            top: landscapeVideo ? "64%" : "auto",
            bottom: landscapeVideo ? undefined : `calc(var(--sab, 0px) + ${bottomInset + 460}px)`,
            transform: landscapeVideo
              ? `translate(-50%, ${isActive && capsuleOn ? 0 : 10}px)`
              : `translateY(${isActive && capsuleOn ? 0 : 10}px)`,
            opacity: isActive && capsuleOn ? 1 : 0,
            pointerEvents: isActive && capsuleOn ? "auto" : "none",
            transition: "opacity .38s cubic-bezier(.4,0,.2,1), transform .38s cubic-bezier(.4,0,.2,1)",
          }}>
          <div className={landscapeVideo
            ? "inline-flex items-center gap-0.5 min-h-8 px-1 rounded-full backdrop-blur-xl elev-2 whitespace-nowrap"
            : "flex flex-col items-stretch gap-1 p-1 rounded-[18px] backdrop-blur-xl elev-2"}
            style={{ background: "rgba(12,15,22,.58)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.09)" }}>
            {landscapeVideo && (
              <>
                <Button type="button" onClick={() => {
                  if (zoom.s > 1.05) { setZoom({ s: 1, x: 0, y: 0, g: false }); setPortraitFit("contain"); }
                  else setPortraitFit((f) => (f === "contain" ? "cover" : "contain"));
                }} className="whitespace-nowrap flex items-center justify-center gap-1 h-[26px] px-3 rounded-full text-[12px] font-semibold pressable transition-colors duration-150"
                  style={{ color: "rgba(255,255,255,.9)" }}>
                  {zoom.s > 1.05 ? `还原 ${zoom.s.toFixed(1)}x` : portraitFit === "contain" ? "铺满" : "适应"}
                </Button>
                <Button type="button" onClick={() => enterFs(true)}
                  className="whitespace-nowrap flex items-center justify-center gap-1 h-[26px] px-3 rounded-full text-[12px] font-semibold pressable transition-colors duration-150"
                  style={{ color: "rgba(255,255,255,.9)" }}>
                  <IExpand size={13} /><span>横屏</span>
                </Button>
              </>
            )}
            {!landscapeVideo && zoom.s > 1.05 && (
              <Button type="button" onClick={() => setZoom({ s: 1, x: 0, y: 0, g: false })}
                className="whitespace-nowrap flex items-center justify-center gap-1 h-[26px] px-3 rounded-full text-[12px] font-semibold pressable transition-colors duration-150"
                style={{ color: "rgba(255,255,255,.9)" }}>
                还原 {zoom.s.toFixed(1)}x
              </Button>
            )}
          </div>
        </div>
      )}

      {/* 右侧操作栏（移动端）：收藏 / 评论 / 全屏 / 分享
          颜色写死不跟主题走：浅色主题下这些字必须仍是白色 */}
      {!fs && !clean && !isDesktop && (
        <div className="mobile-video-action-rail absolute right-3 z-20 flex flex-col items-center gap-[16px]"
          style={{ bottom: `calc(var(--sab, 0px) + ${bottomInset + 92}px)` }}>
          {episodes.length > 1 && (
            <Button type="button" onClick={() => { setSwipeEp(!swipeEp); toast(swipeEp ? "上下划切集已关闭" : "上下划切集已开启"); }}
              className="flex flex-col items-center gap-1 pressable" aria-pressed={swipeEp} aria-label="上下划切集开关">
              <IVertSwap size={26} className={swipeEp ? "hg-gold hg-ov-shadow" : "hg-ink hg-ov-shadow"} />
              <span className="text-[12px] hg-ov-shadow" style={{ color: swipeEp ? "#f3c969" : undefined }}>切集</span>
            </Button>
          )}
          {hevcUrl && (
            <Button type="button" onClick={() => { setPreferHevc(!preferHevc); toast(preferHevc ? "已切回标准画质" : "已切换高清 HEVC", "ok"); }}
              className="flex flex-col items-center gap-1 pressable" aria-pressed={preferHevc} aria-label="画质切换">
              <span className={`flex items-center justify-center h-[22px] min-w-[30px] px-1 rounded-md text-[12px] font-bold hg-ov-shadow ${preferHevc ? "bg-primary text-on-primary" : "hg-chip hg-ink-2"}`}>{preferHevc ? "HD" : "标清"}</span>
              <span className="text-[12px] hg-ov-shadow" style={{ color: preferHevc ? "#fff" : undefined }}>{preferHevc ? "高清" : "标清"}</span>
            </Button>
          )}
          {kind === "video" && (
            <Button onClick={() => void onLike()} disabled={likePending} aria-busy={likePending} className="flex flex-col items-center gap-1 pressable" aria-pressed={liked} aria-label="点赞">
              {liked ? <IHeartF size={27} className="text-neon" /> : <IHeart size={27} className="hg-ink hg-ov-shadow" />}
              <span className="text-[12px] text-white/90 tabular-nums">{fmt(likeCount)}</span>
            </Button>
          )}
          <Button onClick={() => void onFav()} disabled={collectPending} aria-busy={collectPending} className="flex flex-col items-center gap-1 pressable" aria-pressed={collected} aria-label="收藏">
            {collected ? <IStarF size={27} className="hg-gold" /> : <IStar size={27} className="hg-ink hg-ov-shadow" />}
            <span className="text-[12px] text-white/90 tabular-nums">{fmt(collectCount)}</span>
          </Button>
          <Button onClick={() => setPanel("comments")} className="flex flex-col items-center gap-1 pressable" aria-label={`评论 ${fmt(meta.comment)} 条`}>
            <ICommentF size={26} className="hg-ink hg-ov-shadow" />
            <span className="text-[12px] hg-ink-2 hg-ov-shadow tabular-nums">{fmt(meta.comment)}</span>
          </Button>
          <Button onClick={() => enterFs(landscapeVideo)} className="flex flex-col items-center gap-1 pressable" aria-label="全屏">
            <IExpand size={26} className="hg-ink hg-ov-shadow" />
            <span className="text-[12px] hg-ink-2 hg-ov-shadow">全屏</span>
          </Button>
          <Button onClick={shareLink} className="flex flex-col items-center gap-1 pressable" aria-label="分享">
            <ILink size={25} className="hg-ink hg-ov-shadow" />
            <span className="text-[12px] hg-ink-2 hg-ov-shadow">分享</span>
          </Button>
        </div>
      )}

      {/* 右侧操作栏（桌面） */}
      {!fs && !clean && isDesktop && (
        <div className="absolute z-20 flex flex-col items-center desktop-social">
          <div className="desktop-browse-inline">
            <Button onClick={() => stepDir(-1)} disabled={!canStep(-1)} aria-label="上一个" title="上一个 ↑">
              <IChevronUp size={19} strokeWidth={1.8} />
            </Button>
            <Button onClick={() => stepDir(1)} disabled={!canStep(1)} aria-label="下一个" title="下一个 ↓">
              <IChevronDown size={19} strokeWidth={1.8} />
            </Button>
            <small>{String(index + 1).padStart(2, "0")} / {String(effectiveLength).padStart(2, "0")}</small>
          </div>

          {kind === "video" && (
            <>
              <Button onClick={() => void onLike()} disabled={likePending} aria-busy={likePending} aria-label="点赞" className="flex flex-col items-center gap-1 pressable" aria-pressed={liked}>
                <span key={heartBurst} className={heartBurst ? "a-pop" : ""}>
                  {liked ? <IHeartF size={30} className="text-neon" /> : <IHeart size={30} className="text-white tsh" />}
                </span>
                <span className="text-[12px] text-white/90 tabular-nums">{fmt(likeCount)}</span>
              </Button>

              <Button onClick={() => setPanel("comments")} aria-label={`评论 ${fmt(meta.comment)} 条`} className="flex flex-col items-center gap-1 pressable">
                <ICommentF size={27} className="text-white tsh" />
                <span className="text-[12px] text-white/90 tabular-nums">{fmt(meta.comment)}</span>
              </Button>

              <Button onClick={() => void onFav()} disabled={collectPending} aria-busy={collectPending} aria-label="收藏" className="flex flex-col items-center gap-1 pressable" aria-pressed={collected}>
                {collected ? <IStarF size={27} className="hg-gold" /> : <IStar size={27} className="hg-ink hg-ov-shadow" />}
                <span className="text-[12px] text-white/90 tabular-nums">{fmt(collectCount)}</span>
              </Button>

              <Button onClick={() => setPanel("episodes")} aria-label="选集" className="flex flex-col items-center gap-1 pressable">
                <IList size={26} className="text-white tsh" />
                <span className="text-[12px] text-white/90">选集</span>
              </Button>
            </>
          )}

          <Button onClick={shareLink} aria-label="分享" className="flex flex-col items-center gap-1 pressable">
            <ILink size={25} className="text-white tsh" />
            <span className="text-[12px] text-white/90">分享</span>
          </Button>
        </div>
      )}

      {/* 桌面：左下信息 */}
      {!fs && !clean && isDesktop && (
        <div className="desktop-video-meta">
          <div className="flex items-center gap-2">
            <span className="text-[16px] font-bold text-white tsh truncate">@{meta.author}</span>
            {episodes.length > 0 && (
              <span className="shrink-0 px-1.5 py-px rounded-md text-[12px] font-bold text-white"
                style={{ background: "rgba(255,255,255,.16)" }}>
                第 {curEp}/{episodes.length} 集
              </span>
            )}
            {hevcUrl && (
              <Button type="button" aria-pressed={preferHevc}
                onClick={() => { setPreferHevc(!preferHevc); toast(preferHevc ? "已切回标准画质" : "已切换高清 HEVC", "ok"); }}
                className={`shrink-0 h-[18px] px-1.5 rounded-md text-[12px] font-bold flex items-center pressable transition-colors ${preferHevc ? "bg-primary text-on-primary" : "text-white border border-white/30"}`}>
                {preferHevc ? "HD" : "标清"}
              </Button>
            )}
            {!!meta.score && (
              <span className="shrink-0 text-[12px] font-bold hg-gold hg-ov-shadow">{meta.score.toFixed(1)} 分</span>
            )}
          </div>

          <p className="mt-1 text-[14px] leading-snug hg-ink-2 hg-ov-shadow clamp-2">{meta.title}</p>

          <p className="mt-1 text-[12px] leading-relaxed hg-ink-4 clamp-1">{meta.desc || "暂无简介"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button aria-label="视频详情" onClick={() => setPanel("detail")} className="min-h-11 px-4 rounded-full hg-chip text-[12px] inline-flex items-center gap-1">
              详情与标签<IChevR size={13} />
            </Button>
          </div>
        </div>
      )}

      {/* 移动端：标题 + 详情标签 + 进度线
          不加任何压暗层——黑边彻底去掉，全靠文字阴影保读；
          进度条轨道几乎不可见，只用白点标播放位置。 */}
      {!fs && !clean && !isDesktop && (
        <div className="absolute inset-x-0 z-20" style={{ bottom: `calc(var(--sab, 0px) + ${bottomInset}px)` }}>
          <div className="mobile-video-meta-copy relative pb-2 flex items-center gap-2">
            <p className="flex-1 min-w-0 text-[15px] font-semibold leading-snug hg-ink-2 hg-ov-shadow-strong clamp-2">{meta.title}</p>
          </div>
          <div className="relative pt-1.5 pb-2.5">
            <div className="mobile-video-meta-copy flex flex-wrap items-center gap-2">
              <Button aria-label="视频详情" onClick={() => setPanel("detail")}
                className="min-h-11 flex items-center gap-0.5 text-[12px] font-medium hg-ink-3 hg-ov-shadow-strong pressable">
                详情 · 第 {curEp} 集<IChevR size={11} />
              </Button>
            </div>
            {isActive && <div ref={barRef} className="mx-4 mt-2 relative" style={{ height: 14, touchAction: "none" }}
              onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, false)} onPointerCancel={(e) => onBarUp(e, true)}>
              {/* 轨道：几乎看不见，只暗示可拖动 */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[2px] rounded-full" style={{ background: "rgba(255,255,255,.1)" }}>
                <PlaybackProgress clock={playbackClock} duration={duration} preview={barPct} className="h-full rounded-full"
                  style={{ background: "rgba(255,255,255,.26)", transition: barPct !== null ? "none" : "width .25s linear" }} />
              </div>
              {/* 进度点：整个进度条唯一的实心元素 */}
              <PlaybackProgress clock={playbackClock} duration={duration} preview={barPct} position className="absolute top-1/2 w-[7px] h-[7px] rounded-full bg-white pointer-events-none"
                style={{
                  transform: "translate(-50%, -50%)",
                  boxShadow: "0 0 8px rgba(0,0,0,.55)",
                  transition: barPct !== null ? "none" : "left .25s linear",
                }} />
              {barPct !== null && (
                <div className="absolute left-1/2 -translate-x-1/2 -top-8 px-2.5 py-1 rounded-md hg-chip-strong backdrop-blur-md text-[13px] font-bold tabular-nums whitespace-nowrap">
                  {fmtTime(barPct * (duration || 0))}
                </div>
              )}
            </div>}
          </div>
        </div>
      )}

      {/* 横拖定位浮层 */}
      {!isDesktop && scrub && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none" style={{ background: "rgba(0,0,0,.25)" }}>
          <span className="text-[26px] font-bold hg-ink tabular-nums hg-ov-shadow">{fmtTime(scrub.target)}</span>
          <span className="text-[12px] hg-ink-4 mt-1 tabular-nums">/ {fmtTime(duration)}</span>
          <div className="mt-4 w-[62%] h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,.25)" }}>
            <div className="h-full bg-white" style={{ width: `${scrub.pct}%` }} />
          </div>
        </div>
      )}

      {/* 暂停 / 缓冲 */}
      {isActive && paused && !err && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <span className="w-[66px] h-[66px] rounded-full flex items-center justify-center backdrop-blur-md"
            style={{ background: "rgba(0,0,0,.55)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}>
            <IPlayF size={28} className="hg-ink ml-0.5" />
          </span>
        </div>
      )}
      {isActive && waiting && !err && !paused && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"><Loader className="w-9 h-9 spinner" /></div>
      )}
      {isActive && err && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="rounded-xl p-5 flex flex-col items-center gap-3 text-[14px] hg-ink-2 pointer-events-auto" style={{ background: "rgba(0,0,0,.7)" }}>
            <span>视频暂时无法加载</span>
            <span className="text-[12px] hg-ink-4 max-w-[240px] text-center break-all">{err}</span>
            <Button className="hg-link text-[14px]" onClick={onRetryStream}>重试</Button>
          </div>
        </div>
      )}
    </>
  );
}
