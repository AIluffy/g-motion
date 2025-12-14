# Data Model: Motion Engine Core

## Entities

### `AnimationEntity`
Represents a single active animation context (e.g., one DOM element or one object being animated).

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `number` | Unique Entity ID (auto-increment). |
| `target` | `any` | Reference to the actual target (DOM Element, Object). |
| `tags` | `Set<string>` | Tags for querying (e.g., 'dom', 'particle'). |

## Components

Components are stored in SoA (Structure of Arrays) format within Archetypes.

### `TransformComponent`
Stores spatial properties.
- `x`: `float32`
- `y`: `float32`
- `scaleX`: `float32`
- `scaleY`: `float32`
- `rotate`: `float32`

### `MotionStateComponent`
Tracks the progress of the animation.
- `startTime`: `float64` (ms)
- `currentTime`: `float64` (ms)
- `playbackRate`: `float32`
- `status`: `enum` (Idle, Running, Paused, Finished)

### `TimelineComponent`
Stores the sequence of animation keyframes.
- `tracks`: `Map<property, Track>`
  - `Track`: `Array<Keyframe>`
    - `startTime`: `float32`
    - `duration`: `float32`
    - `startValue`: `float32`
    - `endValue`: `float32`
    - `easing`: `function_id` (int)

### `RenderComponent`
Links the entity to a specific renderer.
- `rendererId`: `string` (e.g., 'dom', 'webgl')
- `targetRef`: `object` (reference to specific target if different from entity root)

## Systems

- **`TimeSystem`**: Updates global time and `MotionStateComponent` for all active entities.
- **`TimelineSystem`**: Queries `TimelineComponent`, finds active keyframe based on `currentTime`, computes normalized progress (0-1).
- **`InterpolationSystem`**: Takes normalized progress, applies easing, LERPs `startValue` -> `endValue`, updates specific property components (e.g., `TransformComponent`).
- **`RenderSystem`**: Queries updated components (e.g., `TransformComponent`) and `RenderComponent`, dispatches to registered Renderer plugins.
