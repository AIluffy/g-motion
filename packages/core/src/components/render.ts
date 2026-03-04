import { ComponentDef } from '../runtime/plugin';

export const RenderComponent: ComponentDef = {
  schema: {
    rendererId: 'string',
    rendererCode: 'int32',
    target: 'object',
    props: 'object', // Record<string, number> - Current interpolated values
    version: 'int32',
    renderedVersion: 'int32',
  },
};
