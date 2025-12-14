import { World } from '@g-motion/core';
import { TargetType } from './mark';

export function buildRenderComponent(
  target: any,
  targetType: TargetType,
  world: World,
  onUpdate?: (val: any) => void,
): { Render?: any; Transform?: any } {
  if (targetType === TargetType.DOM) {
    const hasTransform = world.registry.get('Transform');
    const result: { Render: any; Transform?: any } = {
      Render: {
        rendererId: 'dom',
        target,
        onUpdate,
      },
    };
    if (hasTransform) {
      result.Transform = {
        x: 0,
        y: 0,
        z: 0,
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
        rotate: 0,
        rotateX: 0,
        rotateY: 0,
        rotateZ: 0,
        perspective: 0,
      };
    }
    return result;
  }

  if (onUpdate) {
    return {
      Render: {
        rendererId: 'callback',
        target: { onUpdate },
      },
    };
  }

  switch (targetType) {
    case TargetType.Primitive:
      return {
        Render: {
          rendererId: 'primitive',
          target: {
            value: target,
            onUpdate,
          },
        },
      };
    case TargetType.Object:
      return {
        Render: {
          rendererId: 'object',
          target,
        },
      };
    default:
      return {};
  }
}
