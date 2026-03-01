export interface TransformProperties {
  x?: number;
  y?: number;
  z?: number;
  translateX?: number;
  translateY?: number;
  translateZ?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  rotate?: number;
  scaleX?: number;
  scaleY?: number;
  scaleZ?: number;
  scale?: number;
  skewX?: number;
  skewY?: number;
  perspective?: number;
  transformOrigin?: TransformOrigin;
  perspectiveOrigin?: TransformOrigin;
  rotate3d?: Rotate3D;
}

export interface TransformOrigin {
  x: number | string;
  y: number | string;
  z?: number;
}

export interface Rotate3D {
  x: number;
  y: number;
  z: number;
  angle: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}
