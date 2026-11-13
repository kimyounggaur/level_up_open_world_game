// 7.8 설정과 환경설정의 읽기: 없는 칸은 기본값, 잘못된 칸은 기본값과 이유.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES, DEFAULT_SETTINGS, TEXT_SCALE, normalizePreferences, normalizeSettings } from '../../src/domain/save/settings';
import { DEFAULT_MIXER_SETTINGS } from '../../src/audio/mixer';

describe('기본값', () => {
  it('소리 크기의 기본값은 믹서의 기본값과 같다', () => {
    expect({ masterVolume: DEFAULT_SETTINGS.masterVolume, worldVolume: DEFAULT_SETTINGS.worldVolume, taskVolume: DEFAULT_SETTINGS.taskVolume, muteWorldDuringQuest: DEFAULT_SETTINGS.muteWorldDuringQuest }).toEqual(DEFAULT_MIXER_SETTINGS);
  });

  it('부록 A.3의 예와 같은 값: 0.6, 0.5, 끔, 움직임 줄이기 꺼짐, 보통, 물결 켜짐, 발견 위치 꺼짐', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ masterVolume: 0.6, worldVolume: 0.5, muteWorldDuringQuest: false, reducedMotion: false, textSize: 'normal', soundRipples: true, showDiscoveries: false });
  });

  it('글자 배율은 보통 1, 크게 1.25', () => {
    expect(TEXT_SCALE).toEqual({ normal: 1, large: 1.25 });
  });
});

describe('normalizeSettings', () => {
  it('없거나 비어 있으면 기본값이고 문제가 없다(처음 시작, 오래된 저장)', () => {
    for (const raw of [undefined, null, {}]) {
      const r = normalizeSettings(raw);
      expect(r.settings).toEqual(DEFAULT_SETTINGS);
      expect(r.issues).toEqual([]);
    }
  });

  it('올바른 값은 그대로 읽고, 입력을 바꾸지 않는다', () => {
    const raw = { masterVolume: 0.2, worldVolume: 0, taskVolume: 1, muteWorldDuringQuest: true, reducedMotion: true, textSize: 'large', soundRipples: false, showDiscoveries: true };
    const before = JSON.stringify(raw);
    const r = normalizeSettings(raw);
    expect(r.settings).toEqual(raw);
    expect(r.issues).toEqual([]);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('일부만 있으면 나머지는 기본값이다', () => {
    expect(normalizeSettings({ textSize: 'large' }).settings).toEqual({ ...DEFAULT_SETTINGS, textSize: 'large' });
  });

  it('잘못된 칸만 기본값으로 돌리고 이유를 남기며, 나머지는 살린다', () => {
    const r = normalizeSettings({ masterVolume: 1.5, worldVolume: '큼', taskVolume: Number.NaN, muteWorldDuringQuest: 'yes', reducedMotion: true, textSize: 'huge', soundRipples: 1 });
    expect(r.settings).toEqual({ ...DEFAULT_SETTINGS, reducedMotion: true });
    expect(r.issues).toHaveLength(6);
    expect(r.issues[0]).toContain('settings.masterVolume');
    expect(r.issues.join('\n')).toContain('settings.textSize');
  });

  it('객체가 아니면 전부 기본값이다', () => {
    for (const raw of [3, 'x', [1], true]) {
      const r = normalizeSettings(raw);
      expect(r.settings).toEqual(DEFAULT_SETTINGS);
      expect(r.issues).toHaveLength(1);
    }
  });

  it('경계값 0과 1은 올바르다', () => {
    expect(normalizeSettings({ masterVolume: 0, taskVolume: 1 }).issues).toEqual([]);
  });
});

describe('normalizePreferences', () => {
  it('기본값, 올바른 값, 잘못된 값', () => {
    expect(normalizePreferences(undefined).preferences).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences({ language: 'ko', introSeen: true }).preferences).toEqual({ language: 'ko', introSeen: true });
    const bad = normalizePreferences({ language: 'en', introSeen: 'yes' });
    expect(bad.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(bad.issues).toHaveLength(2);
    expect(normalizePreferences(7).issues).toHaveLength(1);
  });
});
