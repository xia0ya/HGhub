import type { Dispatch, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject, SetStateAction } from "react";
import { Button, SegmentedControl } from "../../shared/ui/ios/controls";
import { fmtTime } from "../../shared/api/api";
import type { Episode, Post, VideoCard } from "../../shared/api/types";
import type { PageInput, Toast } from "../../shared/model/store";
import { Sheet } from "../../shared/ui/ui";
import { PlaybackProgress, PlaybackTime, PlayerControls, type PlaybackClock, type VideoHandle } from "../playback";
import { ArticlePanel, CommentsPanel, EpisodesPanel } from "./Panels";
import VideoDetailsPanel from "./VideoDetailsPanel";
import type { FeedMeta } from "./useFeedActions";
import type { FeedPanel } from "./useFeedViewport";
import {
  IBoltF, IClose, ICompress, ILockF, IPauseF, IPlayF, ISearch, IVertSwap, IVol, IVolMute,
} from "../../shared/ui/icons";

type Props = {
  videoRef: RefObject<VideoHandle | null>;
  speedLockTargetRef: RefObject<HTMLButtonElement | null>;
  barRef: MutableRefObject<HTMLDivElement | null>;
  playbackClock: PlaybackClock;
  isDesktop: boolean;
  active: boolean;
  fs: boolean;
  clean: boolean;
  idle: boolean;
  rotated: boolean;
  theater: boolean;
  setTheater: Dispatch<SetStateAction<boolean>>;
  fullscreen: boolean;
  controlsLocked: boolean;
  paused: boolean;
  duration: number;
  rate: number;
  setRate: Dispatch<SetStateAction<number>>;
  effRate: number;
  holdSpeed: number;
  holdSlow: boolean;
  speedLock: number;
  setSpeedLock: Dispatch<SetStateAction<number>>;
  lockArmed: boolean;
  muted: boolean;
  setMuted: Dispatch<SetStateAction<boolean>>;
  volume: number;
  setVolume: (v: number) => void;
  swipeEp: boolean;
  setSwipeEp: (v: boolean) => void;
  playKey: string;
  curId: number;
  curEp: number;
  index: number;
  effectiveLength: number;
  kind: "video" | "post";
  meta: FeedMeta;
  episodes: Episode[];
  related: VideoCard[];
  follows: number[];
  followPending: boolean;
  post?: Post;
  articleHtml: string;
  panel: FeedPanel;
  setPanel: Dispatch<SetStateAction<FeedPanel>>;
  barPct: number | null;
  onBarDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onBarMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onBarUp: (e: ReactPointerEvent<HTMLDivElement>, cancelled?: boolean) => void;
  pickEp: (ep: number) => void;
  go: (delta: number) => void;
  togglePip: () => Promise<void>;
  lockControls: () => void;
  toggleFull: () => void;
  exitFs: () => void;
  onFollow: () => Promise<void>;
  openTag: (tag: string) => void;
  openTagMenu: () => void;
  closePanels: () => void;
  pushPage: (page: PageInput) => void;
  onSearchTab: () => void;
  toast: (msg: string, icon?: Toast["icon"]) => void;
};

export function FeedPlayerShellChrome({
  videoRef, speedLockTargetRef, barRef, playbackClock,
  isDesktop, active, fs, idle, rotated, theater, setTheater, fullscreen, controlsLocked,
  paused, duration, rate, setRate, effRate, holdSpeed, holdSlow, speedLock, setSpeedLock, lockArmed,
  muted, setMuted, volume, setVolume, swipeEp, setSwipeEp,
  playKey, curId, curEp, index, effectiveLength, kind, meta, episodes, related,
  follows, followPending, post, articleHtml, panel, setPanel,
  barPct, onBarDown, onBarMove, onBarUp,
  pickEp, go, togglePip, lockControls, toggleFull, exitFs,
  onFollow, openTag, openTagMenu, closePanels, pushPage, toast,
}: Omit<Props, "clean" | "onSearchTab">) {
  const detailBody = (onClose?: () => void) => (
    <VideoDetailsPanel meta={meta} videoId={curId} episodeCount={episodes.length}
      related={related} following={follows.includes(meta.authorId)} followPending={followPending}
      onFollow={() => void onFollow()} onTag={openTag} onClose={onClose} onPreferences={openTagMenu}
      onAuthor={() => { if (meta.authorId > 0) { closePanels(); pushPage({ kind: "user", id: meta.authorId, name: meta.author }); } }}
      onRelated={video => { closePanels(); pushPage({ kind: "feed", videoIds: related.map(item => item.id), index: related.findIndex(item => item.id === video.id), title: "相关推荐" }); }} />
  );

  return (
    <>
      {/* 桌面控制条 */}
      {isDesktop && (
        <PlayerControls
          paused={paused} duration={duration} rate={rate}
          clock={playbackClock}
          muted={muted} volume={volume} theater={theater} fullscreen={fullscreen}
          visible={active && !idle}
          seekEnabled={active && !controlsLocked}
          seekKey={playKey}
          dockInset={panel ? 372 : 0}
          nextDisabled={!episodes.some((e) => e.ep_num === curEp + 1) && index >= effectiveLength - 1}
          nextTitle={episodes.some((e) => e.ep_num === curEp + 1) ? "下一集 E" : "下一部 ↓"}
          swipeEp={swipeEp}
          onToggleSwipe={() => { setSwipeEp(!swipeEp); toast(swipeEp ? "上下划切集已关闭" : "上下划切集已开启"); }}
          onToggle={() => videoRef.current?.toggle()}
          onSeek={(t, source) => { videoRef.current?.seek(t, source); playbackClock.publish(t); }}
          onSeekInteraction={(phase, input, target, pointerTarget) => videoRef.current?.trace(`seek.input.${phase}`, { input, target, pointer_target: pointerTarget })}
          onRate={(r) => { setRate(r); videoRef.current?.rate(r); }}
          onMute={() => setMuted((m) => !m)}
          onVolume={(v) => setVolume(v)}
          onPip={togglePip}
          onLock={lockControls}
          onTheater={() => setTheater((v) => !v)}
          onFullscreen={toggleFull}
          onNext={() => {
            const nx = episodes.find((e) => e.ep_num === curEp + 1);
            if (nx) pickEp(nx.ep_num);
            else go(1);
          }}
        />
      )}

      {/* 移动端：倍速状态胶囊，也是长按锁定的真实命中目标（isOverSpeedLock）。 */}
      {!isDesktop && (holdSpeed || holdSlow || speedLock || rate !== 1) && (holdSpeed || holdSlow || !fs || !idle) && (
        <Button
          ref={speedLockTargetRef}
          onClick={() => {
            if (speedLock) { setSpeedLock(0); toast("已解除倍速锁定", "info"); }
            else if (rate !== 1 && !holdSpeed) setRate(1);
          }}
          className="absolute left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-3.5 h-8 rounded-full text-[13px] font-semibold whitespace-nowrap pressable"
          style={{ top: "calc(var(--sat, 0px) + 54px)", background: "rgba(0,0,0,.18)", color: lockArmed || speedLock ? "rgba(255,255,255,.95)" : "rgba(255,255,255,.85)" }}>
          <IBoltF size={13} />
          {/* 两态文案等宽（6 字），避免命中矩形在手指停留时伸缩造成 armed 抖动 */}
          {effRate}x {holdSpeed ? (lockArmed ? "松手即可锁定" : "移入此处锁定") : speedLock ? "已锁定 · 点按解除" : holdSlow ? "减速中 · 松开恢复" : "倍速"}
        </Button>
      )}

      {/* 移动端全屏进度条，普通模式的进度条位于标题下方 */}
      {!isDesktop && fs && !idle && (
        <div
          className="absolute inset-x-0 z-30 px-4"
          style={{
            bottom: rotated ? 52 : "calc(var(--sab, 0px) + 52px)",
            paddingLeft: rotated ? "calc(var(--sat, 0px) + 16px)" : undefined,
            paddingRight: rotated ? "calc(var(--sab, 0px) + 16px)" : undefined,
            height: 22,
          }}>
          <div ref={barRef} className="relative h-full" style={{ touchAction: "none" }}
            onPointerDown={onBarDown} onPointerMove={onBarMove} onPointerUp={(e) => onBarUp(e, false)} onPointerCancel={(e) => onBarUp(e, true)}>
            <div className="absolute inset-x-0 bottom-[8px] h-[2.5px] rounded-full" style={{ background: "rgba(255,255,255,.3)" }}>
              <PlaybackProgress clock={playbackClock} duration={duration} preview={barPct} className="h-full rounded-full bg-white" />
            </div>
          </div>
        </div>
      )}

      {/* 移动端：沉浸全屏（安卓 WebView 不支持 Fullscreen API，改用应用内沉浸层） */}
      {!isDesktop && fs && !idle && (
        <>
          <Button onClick={exitFs} aria-label="退出全屏"
            className="hg-chip-strong absolute z-40 w-11 h-11 rounded-full backdrop-blur-md flex items-center justify-center pressable elev-1"
            style={{
              top: rotated ? 12 : "calc(var(--sat, 0px) + 6px)",
              right: rotated ? "calc(var(--sab, 0px) + 12px)" : 12,
            }}>
            <ICompress size={18} />
          </Button>
          <div className="absolute inset-x-0 z-40 flex items-center gap-3 px-4"
            style={{
              bottom: rotated ? 10 : "calc(var(--sab, 0px) + 10px)",
              paddingLeft: rotated ? "calc(var(--sat, 0px) + 16px)" : undefined,
              paddingRight: rotated ? "calc(var(--sab, 0px) + 16px)" : undefined,
            }}>
            <Button onClick={() => videoRef.current?.toggle()}
              className="hg-chip shrink-0 w-9 h-9 rounded-full flex items-center justify-center pressable">
              {paused ? <IPlayF size={18} /> : <IPauseF size={17} />}
            </Button>
            <PlaybackTime clock={playbackClock} className="shrink-0 text-[12px] font-semibold hg-ink-2 tabular-nums" />
            <Button
              onClick={() => {
                if (speedLock) { setSpeedLock(0); return; }
                const seq = [1, 1.25, 1.5, 2];
                const i = seq.indexOf(rate);
                setRate(seq[(i + 1) % seq.length]);
              }}
              className={`ml-auto shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[13px] font-bold pressable ${effRate !== 1 ? "bg-primary text-on-primary" : "hg-chip hg-ink-2"}`}>
              <IBoltF size={12} />{effRate}x
            </Button>
            {curEp < episodes.length && (
              <Button onClick={() => pickEp(curEp + 1)}
                className="shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[13px] font-semibold hg-chip hg-ink-2 pressable"
                aria-label={`下一集 第${curEp + 1}集`}>
                <IVertSwap size={12} />下集
              </Button>
            )}
            <span className="shrink-0 text-[12px] hg-ink-4 tabular-nums">{fmtTime(duration)}</span>
          </div>
        </>
      )}

      {/* 选集 / 评论：桌面停靠在右侧（画面让位），移动端底部弹层 */}
      {isDesktop ? (
        <div className={`desktop-dock-panel ${panel ? "is-open" : ""}`}>
          <div className="desktop-dock-inner">
            {panel === "detail" ? detailBody(() => setPanel(null)) : panel === "episodes" ? (
              <EpisodesPanel videoId={curId} episodes={episodes} current={curEp} onPick={pickEp} onClose={() => setPanel(null)} />
            ) : panel === "comments" ? (
              <CommentsPanel videoId={curId} ep={curEp} total={meta.comment} kind={kind} onClose={() => setPanel(null)} />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          {/* 评论：移动端底部弹层（右侧操作栏「评论」入口） */}
          <Sheet open={active && panel === "comments"} onClose={() => setPanel(null)}>
            <div className="flex flex-col" style={{ height: "72dvh" }}>
              <CommentsPanel videoId={curId} ep={curEp} total={meta.comment} kind={kind} onClose={() => setPanel(null)} />
            </div>
          </Sheet>

          {/* 吃瓜图文正文 */}
          <Sheet open={active && panel === "article"} onClose={() => setPanel(null)}>
            <div className="flex flex-col" style={{ height: "78dvh" }}>
              <ArticlePanel title={meta.title} html={articleHtml} cover={meta.cover} hot={post?.hot} onClose={() => setPanel(null)} />
            </div>
          </Sheet>

          <Sheet open={active && (panel === "detail" || panel === "episodes")} label={panel === "detail" ? "视频详情" : "选集"} onClose={() => setPanel(null)}>
            <div className="video-details-sheet">
              {/* 双栏抽屉：详情 / 选集 */}
              <div className="shrink-0 flex items-center gap-2 px-4 pb-2">
                <SegmentedControl className="flex-1" aria-label="剧集面板" activeIndex={panel === "detail" ? 0 : 1}>
                  {([["detail", "详情"], ["episodes", "选集"]] as const).map(([k, l]) => (
                    <Button aria-pressed={panel === k} key={k} onClick={() => setPanel(k)}>{l}</Button>
                  ))}
                </SegmentedControl>
                <Button onClick={() => setPanel(null)} aria-label="关闭"
                  className="ios-icon-button">
                  <IClose size={14} />
                </Button>
              </div>

              <div className="flex-1 min-h-0">
                {panel === "episodes" ? (
                  <EpisodesPanel bare videoId={curId} episodes={episodes} current={curEp} onPick={pickEp} onClose={() => setPanel(null)} />
                ) : (
                  detailBody()
                )}
              </div>
            </div>
          </Sheet>
        </>
      )}
    </>
  );
}

export function FeedMobileTopTools({
  isDesktop, controlsLocked, active, fs, idle, rotated, clean, muted, setMuted, lockControls, onSearchTab,
}: {
  isDesktop: boolean;
  controlsLocked: boolean;
  active: boolean;
  fs: boolean;
  idle: boolean;
  rotated: boolean;
  clean: boolean;
  muted: boolean;
  setMuted: Dispatch<SetStateAction<boolean>>;
  lockControls: () => void;
  onSearchTab: () => void;
}) {
  if (isDesktop || controlsLocked || !active || (fs && idle)) return null;
  return (
    <div className={`absolute z-40 flex items-center gap-2 ${fs ? "" : "right-3"}`}
      style={{
        top: rotated ? 12 : "calc(var(--sat, 0px) + 6px)",
        // 触屏下按钮实际 44px：退出键占 12–56，锁定组从 68 起，留 12px 间距
        right: fs ? (rotated ? "calc(var(--sab, 0px) + 68px)" : 68) : undefined,
      }}>
      {!fs && !clean && <Button onClick={() => setMuted(m => !m)} aria-label={muted ? "取消静音" : "静音"}
        className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1">
        {muted ? <IVolMute size={17} /> : <IVol size={17} />}
      </Button>}
      <Button onClick={lockControls} aria-label="锁定播放控制" title="锁定播放控制" aria-pressed={false}
        className={`hg-chip ${fs ? "w-11 h-11" : "w-9 h-9"} rounded-full flex items-center justify-center pressable elev-1`}><ILockF size={17} /></Button>
      {!fs && !clean && <Button onClick={onSearchTab} aria-label="搜索"
        className="hg-chip w-9 h-9 rounded-full flex items-center justify-center pressable elev-1"><ISearch size={18} /></Button>}
    </div>
  );
}
