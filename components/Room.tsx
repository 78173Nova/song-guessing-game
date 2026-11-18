"use client";

// One room at /join/<code>: the nickname form, the lobby, and the game itself. The server moves the game forward
// by itself (issue #33); this page only polls the state, plays the clips at the server's start times and sends
// answers. Which screen shows is decided by roomReducer / roomScreen (lib/client/room-game.ts).
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { apiAccountSettings } from "@/lib/client/account-api";
import { canPlayPreviews, prepareClip, UNSUPPORTED_BROWSER_MESSAGE } from "@/lib/client/clip-loader";
import { answeredInRound } from "@/lib/client/room-board";
import { roomLayout } from "@/lib/client/room-duel";
import {
  apiAnswerRoom,
  apiExtendCountdown,
  apiJoinRoom,
  apiKickPlayer,
  apiLeaveRoom,
  apiPlayAgain,
  apiReportClip,
  apiRoomState,
  apiStartRoom,
  forgetRoomToken,
  loadRoomToken,
  saveRoomToken,
  type RoomState,
} from "@/lib/client/room-api";
import type { Standing, SummaryItem } from "@/lib/client/room-api";
import {
  clipsToLoad,
  couldNotPlay,
  initialRoomView,
  lobbyCountdown,
  roomReducer,
  roomScreen,
  type RoomScreen,
  type SkipStep,
} from "@/lib/client/room-game";
import { nicknameScreenStart } from "@/lib/client/nickname-screen";
import { takeShareOnArrival } from "@/lib/client/share";
import { avatarEmoji } from "@/lib/game/avatars";
import { QUESTION_LABELS } from "@/lib/game/modes";
import { MAX_PLAYERS_BY_TYPE, totalRoundsOf } from "@/lib/game/room-settings";
import { MIN_PLAYERS_TO_START, NICKNAME_MAX_LENGTH } from "@/lib/game/rooms";
import AvatarPicker from "./AvatarPicker";
import RoomBoard from "./RoomBoard";
import RoomDuel from "./RoomDuel";
import { clearProblem, showError, showProblem } from "./messages";
import SharePopup from "./SharePopup";
import styles from "./Landing.module.css";
import game from "./SoloGame.module.css";

// How often the page asks the server for news (polling, decision 008).
const POLL_MS = 1000;
// How often the screen is worked out again from the local clock, so a round starts on time.
const TICK_MS = 100;
const CLIP_LOAD_LIMIT_MS = 10_000; // one attempt to load one clip
// A tiny silent sound. Playing it during a tap "unlocks" the players on phones, so the clips may start later
// without another tap (the same trick as the solo game).
// The most rounds a room game can have (3 sets of 10 songs): one audio player each.
const MAX_ROUNDS = 30;
const SILENT_SOUND = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
// The id of the lasting "can't reach the server" message while polling (components/messages.ts).
const CONNECTION_PROBLEM = "room-connection";

// Getting into the room. Once "in", the screen comes from roomScreen.
type Access = { kind: "loading" } | { kind: "gone"; message: string } | { kind: "join" } | { kind: "in" };

// appAddress: the site's configured address (APP_URL) from the server, for the share link.
export default function Room({ code, appAddress }: { code: string; appAddress: string }) {
  const [access, setAccess] = useState<Access>({ kind: "loading" });
  const [view, dispatch] = useReducer(roomReducer, initialRoomView);
  const [token, setToken] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("");
  const [askAvatar, setAskAvatar] = useState(true);
  const [error, setError] = useState(""); // the join form's error; other errors are short messages (#62)
  const [sending, setSending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [shareOpen, setShareOpen] = useState(false);
  // A clip that will not load: ask the server to swap the song (once per round), or give up on this device.
  const reportClip = useCallback(
    async (round: number) => {
      if (token === null) return null;
      const result = await apiReportClip(code, token, round);
      return result.ok ? result.data.previewUrl : null;
    },
    [code, token],
  );
  const clipFailed = useCallback((round: number, url: string) => dispatch({ type: "clip-failed", round, url }), []);
  const clips = useRoomClips(view.latest?.previewUrls ?? null, reportClip, clipFailed);

  // Numbers each state request, so the reducer can ignore a reply that arrives after a newer one.
  const requestCount = useRef(0);

  const refresh = useCallback(
    async (currentToken: string | null) => {
      const request = ++requestCount.current;
      const result = await apiRoomState(code, currentToken);
      if (result.ok) {
        clearProblem(CONNECTION_PROBLEM);
        setAccess({ kind: "in" });
        dispatch({ type: "polled", request, state: result.state, receivedAt: Date.now() });
        return;
      }
      if (result.reason !== "error") clearProblem(CONNECTION_PROBLEM);
      if (result.reason === "gone") setAccess({ kind: "gone", message: result.message });
      // Left the game or kicked (issue #40): no way back in. The token stays saved, so a join from this tab
      // sends it along and a kicked player is refused.
      else if (result.reason === "removed") setAccess({ kind: "gone", message: result.message });
      else if (result.reason === "not-in") {
        // No seat in this room (or the room does not know this token): offer to join.
        if (currentToken !== null) forgetRoomToken(code);
        setToken(null);
        setAccess({ kind: "join" });
      } else showProblem(CONNECTION_PROBLEM, result.message); // keep the last state and try again on the next poll
    },
    [code],
  );

  // First look: with the token this tab saved (after creating or joining), or without one.
  useEffect(() => {
    const saved = loadRoomToken(code);
    queueMicrotask(() => {
      setToken(saved);
      refresh(saved);
    });
  }, [code, refresh]);

  // The nickname screen: a guest gets an avatar picked at random; an account holder gets their usual nickname and
  // saved avatar filled in (issue #44). Asked once each time the screen shows.
  const joining = access.kind === "join";
  useEffect(() => {
    if (!joining) return;
    let current = true;
    apiAccountSettings().then((account) => {
      if (!current) return;
      const start = nicknameScreenStart(account);
      setNickname((typed) => typed || start.nickname);
      setAvatar(start.avatar);
      setAskAvatar(start.askAvatar);
    });
    return () => {
      current = false;
    };
  }, [joining]);

  // Ask again every second until the game is over – and after it while the vote on "Play again" runs (#43).
  const finished = view.latest?.status === "finished" && !view.latest.playAgain;
  const polling = access.kind === "in" && token !== null && !finished;
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => refresh(token), POLL_MS);
    return () => {
      clearInterval(timer);
      clearProblem(CONNECTION_PROBLEM); // no more polling, so no more news about the connection
    };
  }, [polling, token, refresh]);

  // The local clock, while a game is on or the lobby countdown runs (issue #37).
  const counting = view.latest?.status === "lobby" && (view.latest.countdown ?? null) !== null;
  const playing = view.latest !== null && view.latest.status !== "lobby";
  const ticking = playing || counting;
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [ticking]);

  const screen = roomScreen(view, now);

  // The share pop-up opens by itself once, when the room creator arrives in the lobby right after creating it.
  const creatorInLobby = view.latest?.status === "lobby" && view.latest.role === "creator";
  useEffect(() => {
    if (creatorInLobby && takeShareOnArrival(code)) queueMicrotask(() => setShareOpen(true));
  }, [creatorInLobby, code]);

  // Start a round's clip the moment its round starts on this screen; stop the music between rounds and at the end.
  const { play, stopAll } = clips;
  const roundNumber = screen.kind === "round" ? screen.number : null;
  const roundStartsAt = screen.kind === "round" ? screen.startsAt : 0;
  useEffect(() => {
    if (roundNumber !== null) play(roundNumber, roundStartsAt);
    // roundStartsAt is the same for the whole round; only a new round should start a clip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundNumber, play]);
  const silent = !["get-ready", "round", "result"].includes(screen.kind);
  useEffect(() => {
    if (silent) stopAll();
  }, [silent, stopAll]);

  async function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clips.unlock(); // still inside the tap
    setSending(true);
    setError("");
    const result = await apiJoinRoom(code, { nickname, avatar }, fetch, loadRoomToken(code));
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    saveRoomToken(code, result.data.playerToken);
    setToken(result.data.playerToken);
    await refresh(result.data.playerToken);
  }

  async function startNow() {
    if (token === null) return;
    clips.unlock();
    setSending(true);
    const result = await apiStartRoom(code, token);
    setSending(false);
    if (!result.ok) showError(result.message);
    await refresh(token);
  }

  // "Extend +60 s" (issue #37): the room creator, in the countdown's last 15 s. The server decides.
  async function extendCountdown() {
    if (token === null) return;
    setSending(true);
    const result = await apiExtendCountdown(code, token);
    setSending(false);
    if (!result.ok) showError(result.message);
    await refresh(token);
  }

  // Leave (issue #40): anyone, at any time. The room creator leaving the lobby closes the room for everyone.
  async function leave() {
    if (token === null) return;
    const isCreatorInLobby = view.latest?.status === "lobby" && view.latest.role === "creator";
    const question = isCreatorInLobby
      ? "Leave and close the room for everyone?"
      : view.latest?.status === "playing"
        ? "Leave the game? You cannot come back and your points disappear from the standings."
        : "Leave the room?";
    if (!window.confirm(question)) return;
    setSending(true);
    const result = await apiLeaveRoom(code, token);
    setSending(false);
    if (!result.ok) {
      showError(result.message);
      return;
    }
    forgetRoomToken(code);
    clips.stopAll();
    setAccess({
      kind: "gone",
      message: result.data.roomClosed ? "You closed the room." : "You have left the room.",
    });
  }

  // "Play again" after a game (issue #43). The room goes back to the lobby once everyone has chosen or the 60 s
  // are over; the next poll shows it.
  async function playAgain() {
    if (token === null) return;
    clips.unlock();
    setSending(true);
    const result = await apiPlayAgain(code, token);
    setSending(false);
    if (!result.ok) showError(result.message);
    await refresh(token);
  }

  // Kick (issue #40): only the room creator, only a player away for more than 60 s, and only after a confirmation.
  async function kick(player: string) {
    if (token === null) return;
    if (!window.confirm(`Are you sure you want to kick ${player}?`)) return;
    const result = await apiKickPlayer(code, token, player);
    if (!result.ok) showError(result.message);
    await refresh(token);
  }

  async function sendAnswer(round: number, option: number) {
    if (token === null || screen.kind !== "round" || screen.answer !== null) return;
    dispatch({ type: "answered", round, option });
    const result = await apiAnswerRoom(code, token, round, option);
    if (!result.ok) {
      dispatch({ type: "answer-refused", round });
      showError(result.message);
    }
  }

  if (access.kind === "loading") {
    return <p className={styles.pitch} aria-busy="true">Opening room {code}…</p>;
  }

  if (access.kind === "gone") {
    return (
      <>
        <p className={styles.pitch}>{access.message}</p>
        <BackLink />
      </>
    );
  }

  if (access.kind === "join") {
    return (
      <form className={styles.form} onSubmit={join} noValidate>
        <p className={styles.roomCode}>{code}</p>
        <label htmlFor="join-nickname" className={styles.codeLabel}>
          Choose a nickname
        </label>
        <input
          id="join-nickname"
          className={styles.textInput}
          autoComplete="nickname"
          maxLength={NICKNAME_MAX_LENGTH}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          required
        />
        {askAvatar ? (
          <AvatarPicker value={avatar} onChange={setAvatar} />
        ) : (
          <p className={styles.hint}>
            Your avatar: <span aria-hidden="true">{avatarEmoji(avatar)}</span>{" "}
            <button type="button" className={styles.linkButton} onClick={() => setAskAvatar(true)}>
              Change for this room
            </button>
          </p>
        )}
        <p className={styles.error} role="alert">
          {error}
        </p>
        <button type="submit" className={styles.primary} disabled={sending || avatar === ""}>
          {sending ? "Joining…" : "Join"}
        </button>
      </form>
    );
  }

  const state = view.latest;
  if (state === null || screen.kind === "loading") {
    return <p className={styles.pitch} aria-busy="true">Opening room {code}…</p>;
  }

  const message = (
    <p className={styles.error} role="alert">
      {clips.problem}
    </p>
  );

  if (screen.kind === "lobby") {
    const isCreator = state.role === "creator";
    const enoughPlayers = state.players.length >= MIN_PLAYERS_TO_START;
    const countdown = lobbyCountdown(state, view.offsetMs, now);
    return (
      <>
        <p className={styles.roomCode} aria-label={`Room code ${state.code}`}>
          {state.code}
        </p>
        {countdown !== null && (
          <p className={styles.pitch} role="timer" aria-live="off">
            The game starts in <strong>{countdown.text}</strong>
          </p>
        )}
        {countdown?.canExtend && (
          <button type="button" className={styles.secondary} onClick={extendCountdown} disabled={sending}>
            Extend +60 s
          </button>
        )}
        <p className={styles.pitch}>
          {isCreator ? "Invite your friends, then start when everyone is in." : "Waiting for the room creator to start…"}
        </p>
        {state.settings && (
          <p className={styles.hint}>
            {state.settings.type === "duel" ? "Duel" : "Multiplayer"} · {state.settings.sets}{" "}
            {state.settings.sets === 1 ? "set" : "sets"} of {state.settings.songsPerSet} songs (
            {totalRoundsOf(state.settings)} in all) · The game starts by itself when{" "}
            {MAX_PLAYERS_BY_TYPE[state.settings.type]} players are in.
          </p>
        )}
        {isCreator && (
          <>
            <button type="button" className={styles.secondary} onClick={() => setShareOpen(true)}>
              Share link and code
            </button>
            <SharePopup code={state.code} appAddress={appAddress} open={shareOpen} onClose={() => setShareOpen(false)} />
          </>
        )}
        <h2 className={styles.codeLabel}>Players ({state.players.length})</h2>
        <ul className={styles.playerList} aria-live="polite">
          {state.players.map((player) => (
            <li key={player} className={player === state.me.nickname ? styles.self : undefined}>
              {state.away?.includes(player) && <AwaySymbol />}
              <Avatar id={state.avatars?.[player]} />
              {player}
              {player === state.me.nickname ? " (you)" : ""}
            </li>
          ))}
        </ul>
        {isCreator && (
          <>
            <button type="button" className={styles.primary} onClick={startNow} disabled={sending || !enoughPlayers}>
              {sending ? "Starting…" : "Start now"}
            </button>
            {!enoughPlayers && <p className={styles.hint}>At least {MIN_PLAYERS_TO_START} players are needed to start.</p>}
          </>
        )}
        <KickButtons kickable={state.kickable ?? []} onKick={kick} />
        <LeaveButton onLeave={leave} disabled={sending} />
        {message}
      </>
    );
  }

  return (
    <div className={game.game}>
      <GameScreen
        screen={screen}
        state={state}
        onAnswer={sendAnswer}
        onContinue={(round, step) => dispatch({ type: "continued", round, step })}
        onPlayAgain={playAgain}
        sending={sending}
      />
      {screen.kind === "round" && couldNotPlay(view, screen.number) && (
        <p className={game.center} role="status">
          {"Couldn't play the clip – you can still answer."}
        </p>
      )}
      {clips.blocked && screen.kind === "round" && (
        <button type="button" className={game.secondary} onClick={() => play(screen.number, screen.startsAt)}>
          ▶ Tap to hear the music
        </button>
      )}
      <KickButtons kickable={state.kickable ?? []} onKick={kick} />
      <LeaveButton onLeave={leave} disabled={sending} />
      {message}
    </div>
  );
}

// The loading symbol on the nickname of a player whose device has not asked for the room for 5 s (issue #40).
function AwaySymbol() {
  return (
    <span role="img" aria-label="away" title="Away – not connected">
      ⏳{" "}
    </span>
  );
}

// A player's avatar next to their nickname (issue #44). Decorative: the nickname says who it is.
function Avatar({ id }: { id: string | undefined }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {avatarEmoji(id)}
    </span>
  );
}

// For the room creator: one button per player who has been away for more than 60 s (the server lists them).
function KickButtons({ kickable, onKick }: { kickable: string[]; onKick: (player: string) => void }) {
  if (kickable.length === 0) return null;
  return (
    <ul className={styles.playerList} aria-label="Players you can kick">
      {kickable.map((player) => (
        <li key={player}>
          <button type="button" className={styles.secondary} onClick={() => onKick(player)}>
            Kick {player}
          </button>
        </li>
      ))}
    </ul>
  );
}

function LeaveButton({ onLeave, disabled }: { onLeave: () => void; disabled: boolean }) {
  return (
    <button type="button" className={styles.textLink} onClick={onLeave} disabled={disabled}>
      Leave
    </button>
  );
}

function BackLink() {
  return (
    <Link href="/" className={styles.textLink}>
      ← Back to the front page
    </Link>
  );
}

function GameScreen({
  screen,
  state,
  onAnswer,
  onContinue,
  onPlayAgain,
  sending,
}: {
  screen: Exclude<RoomScreen, { kind: "loading" | "lobby" }>;
  state: RoomState; // the latest reply, for the game board during a round (#38)
  onAnswer: (round: number, option: number) => void;
  onContinue: (round: number, step?: SkipStep) => void;
  onPlayAgain: () => void;
  sending: boolean;
}) {
  // The round whose result, summary or standings are on screen (what "Tap to continue" skips).
  const closedRound = state.round?.status === "closed" ? state.round.number : null;
  const skip = (step: SkipStep) => {
    if (closedRound !== null) onContinue(closedRound, step);
  };
  switch (screen.kind) {
    case "get-ready":
      return (
        <section className={game.center} role="status">
          <p className={game.intro}>Get ready! Round {screen.number} starts in</p>
          <p className={game.bigNumber}>{Math.max(1, screen.secondsToStart)}</p>
        </section>
      );

    case "round": {
      const answered = screen.answer !== null;
      const over = screen.secondsLeft === 0;
      // Only the part above the answers differs between the two layouts (issue #39).
      const top = {
        players: state.players,
        away: state.away ?? [],
        avatars: state.avatars ?? {},
        me: state.me.nickname,
        answered: answeredInRound(state, screen.number),
        iAnswered: answered,
        number: screen.number,
        totalRounds: screen.totalRounds,
        secondsLeft: screen.secondsLeft,
      };
      return (
        <section>
          {roomLayout(state) === "duel" ? (
            <RoomDuel {...top} standings={state.standings} />
          ) : (
            <RoomBoard {...top} />
          )}
          {screen.questionType && <p className={game.center}>{QUESTION_LABELS[screen.questionType]}</p>}
          <div className={game.options}>
            {screen.options.map((title, index) => (
              <button
                key={index}
                className={index === screen.answer ? `${game.option} ${game.chosen}` : game.option}
                aria-pressed={index === screen.answer}
                disabled={answered || over}
                onClick={() => onAnswer(screen.number, index)}
              >
                {title}
              </button>
            ))}
          </div>
          <p className={game.center} role="status">
            {answered ? "Answer sent – waiting for the others…" : over ? "Time's up!" : ""}
          </p>
        </section>
      );
    }

    case "result": {
      let verdict = screen.correct ? "✅ Right!" : "❌ Wrong";
      if (screen.answer === null) verdict = "⏱ No answer";
      return (
        <section>
          <div className={game.options}>
            {screen.options.map((title, index) => {
              let className = game.option;
              if (index === screen.correctOption) className = `${game.option} ${game.correct}`;
              else if (index === screen.answer) className = `${game.option} ${game.wrong}`;
              return (
                <button key={index} className={className} disabled>
                  {title}
                </button>
              );
            })}
          </div>
          <div className={game.reveal} role="status">
            <p className={game.verdict}>{verdict}</p>
            <div className={game.song}>
              {screen.song.artworkUrl && (
                // A plain <img>: the cover comes straight from Apple's servers, no image processing needed.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={screen.song.artworkUrl} alt={`Cover of ${screen.song.title}`} width={96} height={96} />
              )}
              <div>
                <p className={game.title}>{screen.song.title}</p>
                <p>{screen.song.artist}</p>
                {screen.song.storeUrl && (
                  <a href={screen.song.storeUrl} target="_blank" rel="noopener noreferrer">
                    Open in Apple Music
                  </a>
                )}
              </div>
            </div>
            <p className={game.points}>
              +{screen.points} points · Score {screen.score}
            </p>
            <button type="button" className={game.secondary} onClick={() => onContinue(screen.number)}>
              Tap to continue
            </button>
          </div>
        </section>
      );
    }

    case "next-starting":
      return (
        <p className={game.center} role="status">
          Next round starting…
        </p>
      );

    case "set-summary":
      return (
        <section className={game.center}>
          <h2>Set {screen.set} – your songs</h2>
          <SummaryList songs={screen.songs} />
          <button type="button" className={game.secondary} onClick={() => skip("summary")}>
            Tap to continue
          </button>
        </section>
      );

    case "set-standings":
      return (
        <section className={game.center}>
          <h2>Standings after set {screen.set}</h2>
          <Standings standings={screen.standings} me={screen.me} avatars={state.avatars} />
          <button type="button" className={game.secondary} onClick={() => skip("standings")}>
            Tap to continue
          </button>
        </section>
      );

    case "final":
      return (
        <section className={game.center}>
          <h2>Final standings</h2>
          <Standings standings={screen.standings} me={screen.me} avatars={state.avatars} />
          {closedRound !== null && (
            <button type="button" className={game.secondary} onClick={() => skip("standings")}>
              Tap to continue
            </button>
          )}
          <BackLink />
        </section>
      );

    case "final-summary":
      return (
        <section className={game.center}>
          <h2>Your songs</h2>
          <SummaryList songs={screen.songs} />
          <p className={game.points}>Score {screen.score}</p>
          {screen.playAgain && screen.playAgain.secondsLeft > 0 && (
            <div role="status">
              {screen.playAgain.chosen ? (
                <p>Waiting for the others… {screen.playAgain.secondsLeft} s</p>
              ) : (
                <>
                  <button type="button" className={game.secondary} onClick={onPlayAgain} disabled={sending}>
                    Play again
                  </button>
                  <p>{screen.playAgain.secondsLeft} s to choose. Choose Play again or Leave below.</p>
                </>
              )}
            </div>
          )}
          <BackLink />
        </section>
      );
  }
}

function Standings({
  standings,
  me,
  avatars,
}: {
  standings: Standing[];
  me: string;
  avatars: RoomState["avatars"]; // issue #44
}) {
  return (
    <ol className={game.results}>
      {standings.map((player) => (
        <li key={player.nickname} className={player.nickname === me ? styles.self : undefined}>
          <span>
            {player.rank}. <Avatar id={avatars?.[player.nickname]} />
            {player.nickname}
            {player.nickname === me ? " (you)" : ""}
          </span>
          <span>{player.score}</span>
        </li>
      ))}
    </ol>
  );
}

// The set summary: each song with right/wrong, points and, on the right, a link that opens the song on iTunes.
function SummaryList({ songs }: { songs: SummaryItem[] }) {
  return (
    <ol className={game.results}>
      {songs.map((song) => (
        <li key={song.round}>
          <span>
            {song.correct ? "✅" : "❌"} <strong>{song.title}</strong> – {song.artist}
          </span>
          <span>
            +{song.points}{" "}
            {song.storeUrl && (
              <a href={song.storeUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${song.title} on iTunes`}>
                🎵
              </a>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

// The clips of a room game on this device: one audio player per round, loaded in advance as soon as the clip
// addresses arrive, and played when roomScreen says the round has started. A clip that will not load is reported
// with `report` (the server swaps the song once per round, issue #41); when even that fails, `onFailed` is told.
// When a song is swapped, only that round's clip is loaded again.
function useRoomClips(
  previewUrls: string[] | null,
  report: (round: number) => Promise<string | null>,
  onFailed: (round: number, url: string) => void,
) {
  const playersRef = useRef<HTMLAudioElement[]>([]);
  const startedRef = useRef<(string | null)[]>([]); // the clip each round's player was last asked to load
  const queueRef = useRef<Promise<void>>(Promise.resolve()); // clips load one after another, in round order
  const supportedRef = useRef<boolean | null>(null); // can this browser play the previews? null = not checked yet
  const readyRef = useRef<boolean[]>([]); // which clips have loaded
  const reportRef = useRef(report);
  const onFailedRef = useRef(onFailed);
  useEffect(() => {
    reportRef.current = report;
    onFailedRef.current = onFailed;
  }, [report, onFailed]);
  // The round whose clip should be playing now. If its clip is still loading, it starts as soon as it is ready.
  const wantedRef = useRef<{ number: number; startsAt: number } | null>(null);
  const [blocked, setBlocked] = useState(false); // the browser refused to start a clip without a tap
  const [problem, setProblem] = useState("");

  const players = useCallback((count: number) => {
    while (playersRef.current.length < count) {
      const player = new Audio();
      player.preload = "auto";
      playersRef.current.push(player);
    }
    return playersRef.current;
  }, []);

  // Called inside a tap (Join, Start now): plays a silent sound on every player so later clips may start alone.
  const unlock = useCallback(() => {
    for (const player of players(MAX_ROUNDS)) {
      if (player.src && player.src !== SILENT_SOUND) continue;
      player.src = SILENT_SOUND;
      player.play().catch(() => {});
    }
  }, [players]);

  // Load every clip in advance, one after another, like the solo game (load → try once more → swap the song →
  // give up). After a swap only the changed clip loads again, so the clip that is playing is not interrupted.
  const key = previewUrls?.join(" ") ?? null;
  useEffect(() => {
    if (previewUrls === null || key === null) return;
    if (supportedRef.current === null) {
      supportedRef.current = canPlayPreviews((type) => new Audio().canPlayType(type));
      if (!supportedRef.current) queueMicrotask(() => setProblem(UNSUPPORTED_BROWSER_MESSAGE));
    }
    if (!supportedRef.current) return;
    const list = players(previewUrls.length);
    for (const index of clipsToLoad(startedRef.current, previewUrls)) {
      const url = previewUrls[index];
      startedRef.current[index] = url;
      readyRef.current[index] = false;
      queueRef.current = queueRef.current.then(async () => {
        if (startedRef.current[index] !== url) return; // swapped again before its turn came
        let tried = url;
        const swap = async () => {
          const next = await reportRef.current(index + 1);
          if (next !== null && startedRef.current[index] === tried) startedRef.current[index] = tried = next;
          return next;
        };
        const result = await prepareClip(url, (clip) => loadClip(list[index], clip), swap);
        if (startedRef.current[index] !== tried) return; // another device swapped the song meanwhile
        if (!result.ok) {
          onFailedRef.current(index + 1, tried);
          return;
        }
        readyRef.current[index] = true;
        // Its round already started while it was loading: start it now, part-way through.
        const wanted = wantedRef.current;
        if (wanted?.number === index + 1) startClip(list[index], wanted.startsAt, setBlocked);
      });
    }
  }, [previewUrls, key, players]);

  // Round `number` has started: stop every other clip and start its own, or wait for it to finish loading.
  const play = useCallback((number: number, startsAt: number) => {
    wantedRef.current = { number, startsAt };
    const list = playersRef.current;
    list.forEach((player, index) => index !== number - 1 && player.pause());
    if (readyRef.current[number - 1]) startClip(list[number - 1], startsAt, setBlocked);
  }, []);

  const stopAll = useCallback(() => {
    wantedRef.current = null;
    playersRef.current.forEach((player) => player.pause());
  }, []);
  useEffect(() => stopAll, [stopAll]); // no music after leaving the page

  return { unlock, play, stopAll, blocked, problem };
}

// Starts a loaded clip at the right position: a device that is a little late joins in mid-clip.
// `setBlocked(true)` = the browser wants a tap before it plays sound.
function startClip(player: HTMLAudioElement, startsAt: number, setBlocked: (blocked: boolean) => void) {
  player.currentTime = Math.max(0, (Date.now() - startsAt) / 1000);
  player.play().then(
    () => setBlocked(false),
    (error) => {
      if (error instanceof DOMException && error.name === "NotAllowedError") setBlocked(true);
    },
  );
}

// Loads `url` into `player`. true = the browser says it can play to the end.
function loadClip(player: HTMLAudioElement, url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      player.removeEventListener("canplaythrough", onReady);
      player.removeEventListener("error", onError);
      resolve(ok);
    };
    const onReady = () => finish(true);
    const onError = () => {
      if (player.error?.code !== MediaError.MEDIA_ERR_ABORTED) finish(false);
    };
    const timer = setTimeout(() => finish(false), CLIP_LOAD_LIMIT_MS);
    player.addEventListener("canplaythrough", onReady);
    player.addEventListener("error", onError);
    player.src = url;
    player.load();
  });
}
