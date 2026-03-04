import { describe, expect, it, vi, beforeEach } from 'vitest';

type CapturedPlay = {
  target: unknown;
  mark: Record<string, unknown>;
  option: Record<string, unknown>;
  play: Record<string, unknown>;
  control: FakeAnimationControl;
};

const captured: CapturedPlay[] = [];
let entitySeed = 1;

class FakeAnimationControl {
  readonly finished: Promise<void>;
  private entityIds: number[];
  private controls: FakeAnimationControl[];
  pauseCount = 0;
  playCount = 0;
  stopCount = 0;
  reverseCount = 0;

  constructor(entityId: number | number[], controls?: FakeAnimationControl[], isBatch = false) {
    this.entityIds = Array.isArray(entityId) ? entityId : [entityId];
    this.controls = controls ?? [];

    if (isBatch && this.controls.length > 0) {
      this.finished = Promise.all(this.controls.map((c) => c.finished)).then(() => undefined);
    } else {
      this.finished = Promise.resolve();
    }
  }

  getEntityIds(): number[] {
    return [...this.entityIds];
  }

  pause(): void {
    this.pauseCount++;
    for (const c of this.controls) c.pause();
  }

  play(): void {
    this.playCount++;
    for (const c of this.controls) c.play();
  }

  stop(): void {
    this.stopCount++;
    for (const c of this.controls) c.stop();
  }

  reverse(): void {
    this.reverseCount++;
    for (const c of this.controls) c.reverse();
  }

  static registerOnComplete(control: FakeAnimationControl, onComplete?: () => void): void {
    if (!onComplete) return;
    void control.finished.then(() => onComplete());
  }
}

vi.mock('../src/index', () => ({
  motion: (target: unknown) => {
    let markArg: Record<string, unknown> = {};
    let optionArg: Record<string, unknown> = {};

    return {
      mark(mark: Record<string, unknown>) {
        markArg = mark;
        return this;
      },
      option(option: Record<string, unknown>) {
        optionArg = option;
        return this;
      },
      play(play: Record<string, unknown> = {}) {
        const control = new FakeAnimationControl(entitySeed++);
        captured.push({ target, mark: markArg, option: optionArg, play, control });
        return control;
      },
    };
  },
}));

vi.mock('../src/api/control', () => ({
  AnimationControl: FakeAnimationControl,
}));

import { timeline } from '../src/api/timeline-api';

describe('timeline api', () => {
  beforeEach(() => {
    captured.length = 0;
    entitySeed = 1;
  });

  it('runs sequential segments by default', () => {
    timeline([
      ['a', { opacity: 1 }, { duration: 100 }],
      ['b', { opacity: 0 }, { duration: 200 }],
      ['c', { opacity: 0.5 }, { duration: 300 }],
    ]);

    expect(captured).toHaveLength(3);
    expect(captured[0].option.delay).toBe(0);
    expect(captured[1].option.delay).toBe(100);
    expect(captured[2].option.delay).toBe(300);
  });

  it("supports parallel start with at '<'", () => {
    timeline([
      ['a', { opacity: 1 }, { duration: 100 }],
      ['b', { opacity: 0 }, { duration: 200, at: '<' }],
    ]);

    expect(captured[0].option.delay).toBe(0);
    expect(captured[1].option.delay).toBe(0);
  });

  it("supports relative offsets '+100' and '-50'", () => {
    timeline([
      ['a', { opacity: 1 }, { duration: 200 }],
      ['b', { opacity: 0 }, { duration: 200, at: '+100' }],
      ['c', { opacity: 0.5 }, { duration: 100, at: '-50' }],
    ]);

    expect(captured[0].option.delay).toBe(0);
    expect(captured[1].option.delay).toBe(300);
    expect(captured[2].option.delay).toBe(450);
  });

  it('supports absolute at in milliseconds', () => {
    timeline([
      ['a', { opacity: 1 }, { duration: 100, at: 500 }],
    ]);

    expect(captured[0].option.delay).toBe(500);
  });

  it('inherits defaults for segment options', () => {
    timeline(
      [['a', { opacity: 1 }]],
      {
        defaults: {
          duration: 250,
          ease: 'linear',
          delay: 20,
        },
      },
    );

    expect(captured[0].mark.duration).toBe(250);
    expect(captured[0].mark.ease).toBe('linear');
    expect(captured[0].option.delay).toBe(20);
  });

  it('pause/play affects all segment controls', () => {
    const control = timeline(
      [
        ['a', { opacity: 1 }, { duration: 100 }],
        ['b', { opacity: 0 }, { duration: 100 }],
      ],
      { paused: true },
    );

    expect(captured[0].control.pauseCount).toBe(1);
    expect(captured[1].control.pauseCount).toBe(1);

    control.play();

    expect(captured[0].control.playCount).toBe(1);
    expect(captured[1].control.playCount).toBe(1);
  });

  it('resolves timeline finished promise', async () => {
    const control = timeline([
      ['a', { opacity: 1 }, { duration: 100 }],
      ['b', { opacity: 0 }, { duration: 100 }],
    ]);

    await expect(control.finished).resolves.toBeUndefined();
  });
});
