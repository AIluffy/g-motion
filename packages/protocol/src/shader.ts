export interface ShaderBindingDef {
  name: string;
  type: 'storage' | 'uniform' | 'sampler' | 'texture';
  access?: 'read' | 'write' | 'read_write';
}

export interface ShaderDef {
  name: string;
  code: string;
  entryPoint?: string;
  bindings?: ShaderBindingDef[];
}
