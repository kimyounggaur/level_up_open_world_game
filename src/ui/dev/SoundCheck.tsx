// 2-2 음량 확인 화면(미리보기 채널에서만): C2부터 C6까지 같은 크기로 들리는지 귀로 확인하고, 오프라인 측정값을 함께 본다.
// 귀로 듣는 점검은 사람이 한다. 이 화면은 그 점검을 쉽게 하고, 한 음만 튀는 실수를 숫자로도 잡는다.
import { useRef, useState } from 'preact/hooks';
import type { Mixer } from '../../audio/mixer';
import { SoundControl } from '../common/SoundControl';
import { useMixer } from '../common/hooks';
import { Icon } from '../common/Icon';
import { Brand } from '../panels/PanelFrame';

export interface LoudnessReading {
  midi: number;
  rmsDb: number;
  peak: number;
}

export interface SoundCheckProps {
  mixer: Mixer;
  /** 오프라인으로 음마다 소리 크기를 잰다. 소리 장치가 없어도 된다 */
  measure: (midis: readonly number[]) => Promise<LoudnessReading[]>;
}

/** C2(36)부터 C6(84)까지 온음 C들과 사이의 음 몇 개: C, E, G를 옥타브마다 */
export const CHECK_MIDIS: readonly number[] = [36, 40, 43, 48, 52, 55, 60, 64, 67, 72, 76, 79, 84];

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const midiLabel = (midi: number): string => `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

/** 가장 크게 들리는 음과 가장 작게 들리는 음의 차(dB) */
export function spreadDb(rows: readonly LoudnessReading[]): number {
  if (rows.length === 0) return 0;
  const values = rows.map((r) => r.rmsDb);
  return Math.max(...values) - Math.min(...values);
}

export function SoundCheck({ mixer, measure }: SoundCheckProps) {
  const sound = useMixer(mixer);
  const [rows, setRows] = useState<LoudnessReading[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  const stop = (): void => {
    cancel.current?.();
    cancel.current = null;
    setCurrent(null);
  };

  const playSequence = (): void => {
    stop();
    let i = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const next = (): void => {
      if (i >= CHECK_MIDIS.length) {
        setCurrent(null);
        cancel.current = null;
        return;
      }
      const midi = CHECK_MIDIS[i++]!;
      setCurrent(midi);
      mixer.playTaskNote(midi, 0.55, 0.8);
      timer = setTimeout(next, 700);
    };
    cancel.current = () => {
      if (timer) clearTimeout(timer);
    };
    next();
  };

  const runMeasure = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setRows(await measure(CHECK_MIDIS));
    } catch (e) {
      setError(`측정하지 못했어요: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="list-shell">
      <header class="topbar">
        <Brand />
        <nav class="topnav" aria-label="이동">
          <a class="nav-link" href="#/">
            <Icon name="list" /> 전체 도전
          </a>
        </nav>
        <div class="topbar-tools">
          <SoundControl sound={sound} onEnable={() => void mixer.enable()} onToggleMute={() => mixer.setMuted(!mixer.muted)} />
        </div>
      </header>
      <main class="list-main" id="list-main" tabIndex={-1}>
        <h1>소리 점검</h1>
        <p class="subtitle">낮은 C2부터 높은 C6까지 한 음씩 차례로 들려 줘요. 튀게 크거나 작은 음이 있는지 귀로 확인해 주세요.</p>
        <section class="card">
          <h2>귀로 듣기</h2>
          <div class="listen-row">
            <button type="button" class="btn btn-primary" onClick={playSequence}>
              <Icon name="play" /> 차례로 듣기
            </button>
            <button type="button" class="btn btn-quiet" onClick={stop} disabled={current === null}>
              <Icon name="stop" /> 정지
            </button>
            <span class="muted" role="status" aria-live="polite">
              {current === null ? '' : `지금 ${midiLabel(current)}`}
            </span>
          </div>
          {sound.state !== 'on' ? <p class="hint">먼저 위쪽의 '소리 켜기'를 눌러야 들려요.</p> : null}
        </section>
        <section class="card">
          <h2>숫자로 재기</h2>
          <p class="muted">소리 장치 없이 음마다 소리 크기를 재요. 가장 큰 음과 가장 작은 음의 차이가 작을수록 고르게 들려요.</p>
          <button type="button" class="btn btn-quiet" onClick={() => void runMeasure()} disabled={busy}>
            {busy ? '재는 중…' : '음량 재기'}
          </button>
          {error ? (
            <p class="problem" role="alert">
              <Icon name="alert" /> {error}
            </p>
          ) : null}
          {rows ? (
            <>
              <table class="loudness-table">
                <caption class="sr-only">음마다 소리 크기</caption>
                <thead>
                  <tr>
                    <th scope="col">음</th>
                    <th scope="col">소리 크기(dB)</th>
                    <th scope="col">가장 센 값</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.midi}>
                      <th scope="row">{midiLabel(r.midi)}</th>
                      <td>{r.rmsDb.toFixed(1)}</td>
                      <td>{r.peak.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p data-spread={spreadDb(rows).toFixed(2)}>
                가장 큰 음과 가장 작은 음의 차이: <strong>{spreadDb(rows).toFixed(1)} dB</strong>
              </p>
            </>
          ) : null}
        </section>
      </main>
    </div>
  );
}
