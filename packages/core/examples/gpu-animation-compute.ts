/**
 * GPU Animation Compute Example
 *
 * Demonstrates Motion's WebGPU compute infrastructure for GPU-accelerated
 * animation interpolation.
 */

import { ComputeBatchProcessor, type BatchEntity, type BatchKeyframe } from '../src/webgpu';

// Simple example: Set up batch processing
console.log('🚀 WebGPU Compute Example');
console.log('================================\n');

// Create batch processor
const processor = new ComputeBatchProcessor();

// Create batch entities (100 animations)
const entities: BatchEntity[] = Array.from({ length: 100 }, (_, i) => ({
  id: i,
  startTime: i * 0.1,
  currentTime: i * 0.1 + 0.5,
  playbackRate: 1.0,
  status: 1, // Running
}));

// Create batch
const batchId = 'animations-batch-1';
processor.createBatch(batchId, entities);
console.log(`✅ Created batch with ${entities.length} entities`);

// Add keyframes
const keyframes: BatchKeyframe[] = Array.from({ length: 500 }, (_, i) => ({
  entityId: i % 100,
  startTime: Math.floor(i / 100) * 0.2,
  duration: 0.2,
  startValue: Math.floor(i / 100),
  endValue: Math.floor(i / 100) + 1,
  easingId: 0, // Linear
}));

processor.addKeyframes(batchId, keyframes);
console.log(`✅ Added ${keyframes.length} keyframes`);

// Validate batch
const validation = processor.validateBatch(batchId);
console.log(`✅ Batch validation: ${validation.valid ? 'passed' : 'failed'}`);

// Get buffer data (ready for GPU upload)
const entityBuffer = processor.getEntityBufferData(batchId);
const keyframeBuffer = processor.getKeyframeBufferData(batchId);

if (entityBuffer && keyframeBuffer) {
  console.log(`✅ Entity buffer: ${entityBuffer.byteLength} bytes`);
  console.log(`✅ Keyframe buffer: ${keyframeBuffer.byteLength} bytes`);
  console.log(`✅ Total data: ${(entityBuffer.byteLength + keyframeBuffer.byteLength) / 1024}KB`);
}

// Get statistics
const stats = processor.getStats();
console.log(`\n📊 Statistics`);
console.log(`   - Total batches: ${stats.totalBatches}`);
console.log(`   - Total entities: ${stats.totalEntitiesProcessed}`);
console.log(`   - Average batch size: ${stats.averageBatchSize.toFixed(0)}`);

console.log('\n✨ Example complete! Ready for GPU compute dispatch.\n');
