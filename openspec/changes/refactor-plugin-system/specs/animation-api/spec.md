## MODIFIED Requirements

### Requirement: Extensible Mark Options
The animation API SHALL expose MarkOptions as an extendable interface to allow plugins to add typed fields without the animation package depending on plugin types.

#### Scenario: Plugin augments MarkOptions types
- **WHEN** a plugin declares module augmentation to add a field (e.g. spring)
- **THEN** TypeScript users can author `.mark({ spring: ... })` with plugin-provided types

### Requirement: Keyframe Plugin Data Container
The timeline/keyframe schema SHALL support storing plugin-specific data via a generic extension container, without core declaring plugin-specific fields.

#### Scenario: Keyframe carries plugin payload
- **WHEN** a mark includes a plugin field
- **THEN** the resulting keyframe stores that payload in a generic extensions container accessible to the plugin

