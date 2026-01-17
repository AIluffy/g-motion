## ADDED Requirements

### Requirement: Plugin Autonomy Boundary
The system SHALL allow a plugin to be implemented as a self-contained unit containing its own types, components, systems, GPU resources, registration logic, and tests, without requiring core to include plugin-specific logic.

#### Scenario: Add a new physics plugin without modifying core
- **WHEN** a new plugin package is added and imported by the application
- **THEN** the engine can run the plugin behavior without any changes to core source code

### Requirement: Auto-Discovery Registration
The system SHALL support plugin auto-discovery by allowing a plugin to register itself to a global plugin registry at module import time.

#### Scenario: Import triggers registration
- **WHEN** the application imports a plugin entry module
- **THEN** the plugin is registered in the global registry and becomes eligible for engine injection

#### Scenario: No runtime scanning
- **WHEN** the application does not import a plugin entry module
- **THEN** the engine does not discover or register the plugin implicitly

### Requirement: Automatic Injection on Engine Initialization
The system SHALL automatically apply all registered auto-plugins during engine initialization, injecting their systems/components/renderers/kernels as needed.

#### Scenario: Animation package does not call setup
- **WHEN** an animation is created and played without the animation package importing any plugin code
- **THEN** plugin-provided systems are already present if the plugin was imported by the application

### Requirement: Deterministic Test Isolation Controls
The system SHALL provide a way to prevent auto-plugins from affecting tests that do not opt-in.

#### Scenario: Disable auto-plugins for a test suite
- **WHEN** a test suite disables auto-plugin injection via configuration
- **THEN** no auto-plugin systems/components are injected unless explicitly enabled

### Requirement: Resettable Plugin Registry (Test Support)
The system SHALL provide a mechanism to reset the auto-plugin registry for test isolation.

#### Scenario: Reset removes previous registrations
- **WHEN** a test calls the registry reset API between test cases
- **THEN** previously registered plugins do not affect subsequent test cases

### Requirement: Idempotent Plugin Application
The system SHALL ensure applying the same plugin multiple times does not result in duplicated registration side-effects.

#### Scenario: Multiple imports or multiple engine instances
- **WHEN** the same plugin is applied more than once
- **THEN** systems/components/renderers/kernels are not duplicated and behavior remains correct

## MODIFIED Requirements

### Requirement: Plugin Setup Contract
The existing plugin setup contract SHALL remain supported, but auto-discovery SHALL be the preferred integration path.

#### Scenario: Existing manual setup continues to work
- **WHEN** a plugin is manually applied via the existing setup/use mechanism
- **THEN** the plugin behavior is enabled and does not conflict with auto-discovery mechanisms
