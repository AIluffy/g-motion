<!--
Sync Impact Report:
- Version change: 1.5.0 → 1.5.1
- List of modified principles:
  - Refined wording across all principles for clarity and professional tone.
  - Principle I: Clarified `animate` entry point requirements.
  - Principle III: Smoothed architectural references.
  - Principle VII: Strengthened plugin isolation language.
- Added sections: None
- Removed sections: None
- Templates requiring updates: ✅ plan-template.md, ✅ spec-template.md, ✅ tasks-template.md (All compatible with wording refinements)
- Follow-up TODOs: None
-->
# G-Motion Constitution

## Core Principles

### I. Easy to Use & Unified API
The API must be user-friendly, approachable for beginners, and powerful for experts. We prioritize developer ergonomics and intuitive design over internal complexity.

### II. Production Ready
Code must be written in strict TypeScript with extensive test coverage and high performance. "Production Ready" implies zero tolerance for flaky tests, strict type safety, and optimization for real-world workloads. Experimental features must be explicitly flagged and isolated.

### III. Performance First
Performance is a primary feature, not an afterthought. We utilize **Data-Oriented Design** via an **Archetype ECS architecture** (inspired by Bevy/Flecs).
- **Compute-Driven**: Numerical animation calculations MUST support WebGPU Compute Shaders (WGSL) and PREFER to offload to GPU for large batches. The CPU MAY be used for scheduling, orchestration, fallback execution, or small batch operations.
- **Memory Efficiency**: Must implement **SoA (Structure of Arrays)** storage for maximum cache coherence.
- **Parallelism**: Must support **Fast Queries** and multi-threaded **System Scheduling**.

### IV. Developer Experience (DX)
We provide actionable feedback, not just errors. The system MUST emit meaningful logs, constructive debugging hints, and access to runtime performance metrics. The tool empowers users to understand and debug their animations efficiently.

### V. Modular Monorepo Architecture
Strict adherence to the `pnpm` + `turbo` monorepo structure is required.
- **apps/**:
  - `web`: Official landing page and showcase.
  - `docs`: Comprehensive documentation and API references.
  - `examples`: Practical usage scenarios and demos.
- **packages/**:
  - `core`: The ECS runtime and scheduler (no high-level logic).
  - `utils`: Shared helpers and data structures.
  - `animation`: The high-level `animate` API and interpolation logic.
  - `plugins`: sub packages for Official systems (e.g., Physics, Input, Renderers).
Modules must maintain **Single Responsibility**, **High Cohesion**, and **Low Coupling**. Circular dependencies are strictly prohibited.

### VI. Cross-Platform Rendering
Simulation is strictly decoupled from presentation. A unified **RenderSystem** interprets computed component data and applies it to diverse backends:
- **DOM**: CSS style and variable updates.
- **SVG**: Attribute and path data updates.
- **Canvas**: 2D Context drawing commands.
- **WebGL/WebGPU**: Buffer and Uniform updates.

### VII. ECS Plugin Architecture
The ECS Core remains pristine, data-driven, and minimal. All feature extensions MUST occur through the **Plugin Architecture**.
- Plugins interact via **System Registration**, **Event Hooks**, or **Component Interfaces**.
- Plugins **MUST NOT** alter internal ECS memory layout (Archetypes/Tables) directly, ensuring upgrade safety and performance stability.

## Tech Stack & Standards

- **Language**: TypeScript (Strict Mode).
- **Architecture**: Archetype ECS (Data-Oriented).
  - SoA Storage.
  - Query System & Parallel Scheduler.
  - Dynamic Entity/Component Lifecycle.
  - Modular Plugin System.
- **Compute**: WebGPU Compute Shaders (WGSL).
- **Rendering**: Backend-Agnostic RenderSystem (DOM/SVG/Canvas/WebGL).
- **Build System**: pnpm workspaces + Turbo.
- **Bundler**: rslib (libraries), Vite (apps).
- **Testing**: Vitest (Unit & Integration).
- **Linting**: Strict adherence to `oxlint.json` and `.editorconfig`.

## Development Workflow

1.  **Plan**: Define API surface and analyze performance impact (Compute/Memory).
2.  **Test**: Implement Vitest specifications for logic and rendering correctness.
3.  **Implement**: specific logic in focused, single-purpose modules.
4.  **Verify**: Execute `turbo test` and `turbo build` to validate monorepo integrity.
5.  **Document**: Maintain up-to-date READMEs and live examples in `apps/examples`.

## Governance

This constitution governs all contributions to G-Motion.
- **Amendments**: Changes require a PR with rationale, subject to maintainer ratification.
- **Compliance**: CI/CD pipelines enforce linting and testing standards. Code reviews MUST block violations of "Easy to Use" or "Performance First" principles.
- **Versioning**: Semantic Versioning (SemVer) is strictly enforced.
  - **MAJOR**: Breaking API or architectural changes.
  - **MINOR**: New features (e.g., new renderer, physics plugin).
  - **PATCH**: Bug fixes, performance tuning, and docs.

**Version**: 1.5.2 | **Ratified**: 2025-12-05 | **Last Amended**: 2025-12-05
