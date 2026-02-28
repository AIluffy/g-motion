import { ComponentDef } from '../../plugin';

export const TimelineComponent: ComponentDef = {
  schema: {
    tracks: 'object',
    duration: 'float64',
    loop: 'int32',
    repeat: 'int32',
    version: 'int32',
    rovingApplied: 'int32',
  },
};
