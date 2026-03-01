import { TRANSFORM_TYPED_KEYS } from './constants';

export type TransformTypedBuffers = Record<
  string,
  Float32Array | Float64Array | Int32Array | undefined
>;

type TypedBufferGetter = (
  component: string,
  field: string,
) => Float32Array | Float64Array | Int32Array | undefined;

export function buildTransformTypedBuffers(
  getTypedBuffer: TypedBufferGetter,
  keys: readonly string[] = TRANSFORM_TYPED_KEYS,
): TransformTypedBuffers {
  const buffers: TransformTypedBuffers = {};
  for (const key of keys) {
    buffers[key] = getTypedBuffer('Transform', key);
  }
  return buffers;
}
