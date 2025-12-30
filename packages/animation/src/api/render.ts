import { World, getRendererCode } from '@g-motion/core';
import { TargetType } from './mark';
import type { VisualTarget } from './visualTarget';
import { getOrCreateVisualTarget } from './visualTarget';

export function buildRenderComponent(
  target: any,
  targetType: TargetType,
  world: World,
  onUpdate?: (val: any) => void,
): { Render?: any; Transform?: any } {
  if (targetType === TargetType.DOM) {
    const visualTarget: VisualTarget = getOrCreateVisualTarget(target, targetType);
    const hasTransform = world.registry.get('Transform');
    const result: { Render: any; Transform?: any } = {
      Render: {
        rendererId: 'dom',
        rendererCode: getRendererCode('dom'),
        target: visualTarget,
        onUpdate,
        version: 0,
        renderedVersion: -1,
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
        rendererCode: getRendererCode('callback'),
        target: { onUpdate },
        version: 0,
        renderedVersion: -1,
      },
    };
  }

  switch (targetType) {
    case TargetType.Primitive:
      return {
        Render: {
          rendererId: 'primitive',
          rendererCode: getRendererCode('primitive'),
          target: {
            value: target,
            onUpdate,
          },
          version: 0,
          renderedVersion: -1,
        },
      };
    case TargetType.Object: {
      const visualTarget: VisualTarget = getOrCreateVisualTarget(target, targetType);
      return {
        Render: {
          rendererId: 'object',
          rendererCode: getRendererCode('object'),
          target: visualTarget,
          version: 0,
          renderedVersion: -1,
        },
      };
    }
    default:
      return {};
  }
}
