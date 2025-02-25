import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json'

export default {
  input: 'src/trias.mjs',
  output: {
    file: 'dist/trias.cjs',
    format: 'cjs'
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json(),
    babel({
      babelHelpers: 'bundled'
    })
  ]
};
