export const CSSVarComponent = {
  schema: {
    name: 'string', // The variable name, e.g., --my-var
    value: 'float32', // The numeric value
    unit: 'string', // e.g., 'px', '%', ''
  },
} as const;
