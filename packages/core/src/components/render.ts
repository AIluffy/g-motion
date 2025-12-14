import { ComponentDef } from '../plugin';

export const RenderComponent: ComponentDef = {
  schema: {
    rendererId: 'string',
    target: 'object',
    props: 'object', // Record<string, number> - Current interpolated values
  },
};
