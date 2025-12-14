# Checklist: Motion Engine Core

**Feature**: Motion Engine Core
**Branch**: `001-motion-engine`
**Spec**: [specs/001-motion-engine/spec.md](spec.md)

## Phase 1: Setup

- [x] Project structure created (packages: core, animation, plugins, utils)
- [x] TypeScript strict mode configured
- [x] Vitest configured
- [x] Build scripts (rslib) configured

## Phase 2: Foundational (ECS Core)

- [x] ComponentRegistry implemented
- [x] EntityManager implemented
- [x] Archetype storage (SoA) implemented
- [x] SystemScheduler implemented
- [x] MotionPlugin interface defined
- [x] TransformComponent defined
- [x] MotionStateComponent defined

## Phase 3: Simple Number Animation (MVP)

- [x] TimelineComponent defined
- [x] motion() factory and Builder implemented
- [x] TimelineSystem implemented
- [x] InterpolationSystem implemented
- [x] AnimationControl implemented
- [x] TimeSystem wired up
- [x] Integration test passed: Number interpolation

## Phase 4: DOM Animation

- [x] RenderComponent defined
- [x] DOMRenderer plugin implemented
- [x] RenderSystem implemented
- [x] motion() supports DOM targets
- [x] Integration test passed: DOM transform update

## Phase 5: Chained Animation

- [x] MotionBuilder supports .mark() chaining
- [x] TimelineSystem handles multi-keyframe sequences
- [x] Delay/Repeat logic implemented
- [x] Test passed: Sequential animation

## Phase 6: WebGPU Animation

- [x] WebGPUComputePlugin skeleton created
- [x] BatchSamplingSystem implemented
- [x] WGSL shader implemented
- [x] Buffer sync implemented
- [x] Fallback logic implemented
- [x] Benchmark passed: 5000 entities

## Phase 7: Custom System

- [x] registerSystem API implemented
- [x] System scheduling validation
- [x] Example SpringPhysicsSystem created
- [x] Test passed: Custom system execution

## Phase 8: Polish

- [x] Documentation updated
- [x] JSDoc added
- [ ] Performance validation