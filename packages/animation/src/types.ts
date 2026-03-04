export type CSSTransformProps = {
  x?: number;
  y?: number;
  z?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  perspective?: number;
};

export type CSSNumericProps = {
  opacity?: number;
  width?: number;
  height?: number;
};

export type MotionTarget =
  | string
  | Element
  | number
  | Record<string, number>
  | MotionTarget[];

export type MotionTargetValue<T> = T extends (infer U)[] ? U : T;

export type AnimatableProps<T> = T extends (infer U)[]
  ? AnimatableProps<U>
  : T extends Element | string
    ? Partial<CSSTransformProps & CSSNumericProps>
    : T extends Record<infer K, number>
      ? Partial<Record<K, number>>
      : T extends number
        ? number
        : Record<string, number>;

export type StaggerValue = number | ((index: number) => number);
