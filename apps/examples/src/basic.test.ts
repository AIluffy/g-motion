// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  PlayerController,
  coerceFiniteNumber,
  coercePositiveNumber,
  computeLoopAdjustment,
} from './components/player-controller';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('examples app loads successfully', () => {
  // This is a placeholder test to ensure examples can be tested
  expect(true).toBe(true);
});

describe('player-controller core helpers', () => {
  test('coerceFiniteNumber handles invalid inputs', () => {
    expect(coerceFiniteNumber('12', 0)).toBe(12);
    expect(coerceFiniteNumber('NaN', 7)).toBe(7);
  });

  test('coercePositiveNumber enforces >0', () => {
    expect(coercePositiveNumber(24, 60)).toBe(24);
    expect(coercePositiveNumber(0, 60)).toBe(60);
    expect(coercePositiveNumber(-1, 60)).toBe(60);
  });

  test('computeLoopAdjustment: loop wraps at end', () => {
    expect(
      computeLoopAdjustment({
        loopMode: 'loop',
        timeMs: 1000,
        durationMs: 1000,
        playbackRate: 1,
      }),
    ).toEqual({ nextTimeMs: 0, nextPlaybackRate: 1 });
  });

  test('computeLoopAdjustment: pingpong flips direction at end', () => {
    expect(
      computeLoopAdjustment({
        loopMode: 'pingpong',
        timeMs: 1000,
        durationMs: 1000,
        playbackRate: 1.25,
      }),
    ).toEqual({ nextTimeMs: 1000, nextPlaybackRate: -1.25 });
  });

  test('computeLoopAdjustment: loop wraps at start when reversed', () => {
    expect(
      computeLoopAdjustment({
        loopMode: 'loop',
        timeMs: 0,
        durationMs: 1000,
        playbackRate: -2,
      }),
    ).toEqual({ nextTimeMs: 1000, nextPlaybackRate: -2 });
  });
});

describe('PlayerController component', () => {
  test('wires play/pause/stop/seek to control', async () => {
    const onStateChange = vi.fn();
    const controllerRef = React.createRef<any>();

    const control = {
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      seek: vi.fn(),
      seekFrame: vi.fn(),
      setPlaybackRate: vi.fn(),
      getDuration: vi.fn(() => 2000),
      getCurrentTime: vi.fn(() => 0),
      getPlaybackRate: vi.fn(() => 1),
    } as any;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(React.createElement(PlayerController, { control, onStateChange, ref: controllerRef }));

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(control.setPlaybackRate).toHaveBeenCalledWith(1);
    expect(control.play).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(control.pause).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(control.stop).toHaveBeenCalled();
    expect(control.seek).toHaveBeenCalledWith(0);

    const seekInput = screen.getAllByRole('spinbutton')[2] as HTMLInputElement;
    fireEvent.change(seekInput, { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(control.seek).toHaveBeenCalledWith(500);

    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }));
    expect(control.setPlaybackRate).toHaveBeenCalledWith(-1);

    controllerRef.current?.seekFrame(30);
    expect(control.seekFrame).toHaveBeenCalledWith(30, 60);
  });

  test('disables controls when control is missing', () => {
    render(React.createElement(PlayerController, { control: null }));
    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Pause' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Stop' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AnimationControllerDemo route', () => {
  test('renders and triggers basic controls without crashing', async () => {
    vi.resetModules();

    vi.doMock('@tanstack/react-router', () => {
      const Link = (props: any) => {
        const href = typeof props.to === 'string' ? props.to : '';
        return React.createElement('a', { href, className: props.className }, props.children);
      };
      const createFileRoute = () => (opts: any) => ({ options: opts });
      return { Link, createFileRoute };
    });

    const engineMock = {
      getSpeed: vi.fn(() => 1),
      getFps: vi.fn(() => 60),
      getSamplingMode: vi.fn(() => 'time'),
      getSamplingFps: vi.fn(() => 60),
      setSpeed: vi.fn(),
      setFps: vi.fn(),
      setSamplingFps: vi.fn(),
    };

    const createdControls: any[] = [];
    const motionMock = vi.fn(() => {
      const control: any = {
        play: vi.fn(),
        pause: vi.fn(),
        stop: vi.fn(),
        seek: vi.fn(),
        setPlaybackRate: vi.fn(),
        getDuration: vi.fn(() => 2400),
        getCurrentTime: vi.fn(() => 0),
        getPlaybackRate: vi.fn(() => 1),
      };
      createdControls.push(control);

      const builder: any = {
        mark: vi.fn(() => builder),
        option: vi.fn(() => builder),
        play: vi.fn(() => control),
      };

      return builder;
    });

    vi.doMock('@g-motion/animation', async () => {
      const actual = await vi.importActual<any>('@g-motion/animation');
      return { ...actual, engine: engineMock, motion: motionMock };
    });

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const { AnimationControllerDemo } = await import('./routes/animation-controller-demo');

    render(React.createElement(AnimationControllerDemo));

    expect(screen.getByText('Animation controller demo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Start (basic)' }));

    await waitFor(() => {
      expect(engineMock.setSpeed).toHaveBeenCalled();
      expect(engineMock.setFps).toHaveBeenCalled();
      expect(engineMock.setSamplingFps).toHaveBeenCalled();
      expect(motionMock).toHaveBeenCalled();
      expect(createdControls[0]?.setPlaybackRate).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Toggle reverse' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle reverse' }));
    expect(createdControls[0]?.setPlaybackRate).toHaveBeenCalledWith(-1);

    fireEvent.click(screen.getAllByRole('button', { name: 'Ping-pong' })[0]);
    expect(createdControls[1]?.seek).toHaveBeenCalledWith(2400);
    expect(createdControls[1]?.setPlaybackRate).toHaveBeenCalledWith(-1);
  });
});
