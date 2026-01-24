## ADDED Requirements
### Requirement: Device-Scoped Pipeline Cache
The system SHALL store and retrieve GPU pipelines in a cache scoped to the GPU device that created them.

#### Scenario: Multi-device pipeline isolation
- **WHEN** two distinct GPU devices request the same pipeline cache key
- **THEN** each device receives a pipeline created for its own device

#### Scenario: Device context switch
- **WHEN** the active GPU device changes
- **THEN** pipeline retrieval uses the cache partition for the active device

### Requirement: Device Lifecycle Cleanup
The system SHALL clear all pipeline cache entries for a device when the device is destroyed or reported lost.

#### Scenario: Device lost cleanup
- **WHEN** a GPU device is reported lost
- **THEN** all cached pipelines associated with that device are removed

#### Scenario: Device destroy cleanup
- **WHEN** a GPU device is disposed
- **THEN** all cached pipelines associated with that device are removed

### Requirement: Device Parameter Enforcement
The system SHALL require a GPU device parameter when creating or retrieving pipelines.

#### Scenario: Pipeline creation requires device
- **WHEN** a pipeline is created through a factory function
- **THEN** a valid device is provided and bound to the created pipeline

#### Scenario: Pipeline retrieval requires device
- **WHEN** a pipeline is requested from cache
- **THEN** the request supplies a device to select the correct cache partition
