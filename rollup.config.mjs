import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import external from "rollup-plugin-peer-deps-external";
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import pkg from "./package.json" assert { type: "json" };

const input = "./src/lib/index.ts";
const minifyExtension = (pathToFile) => pathToFile.replace(/\.js$/, ".min.js");
const extensions = [".js", ".jsx", ".ts", ".tsx"];

export default [
  // CommonJS
  {
    input,
    output: {
      file: pkg.main,
      format: "cjs",
      sourcemap: true,
    },
    plugins: [
      typescript(),
      external(),
      resolve(),
      commonjs(),
    ],
    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ],
  },
  {
    input,
    output: {
      file: minifyExtension(pkg.main),
      format: "cjs",
      sourcemap: true,
    },
    plugins: [
      typescript(),
      external(),
      resolve(),
      commonjs(),
      terser(),
    ],
    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ],
  },
  // ES
  {
    input,
    output: {
      file: pkg.module,
      format: "es",
      sourcemap: true,
      exports: "named",
    },
    plugins: [
      typescript(),
      external(),
      resolve(),
      commonjs(),
    ],
    external: [
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
    ],
  },
  {
    input,
    output: {
      file: minifyExtension(pkg.module),
      format: "es",
      sourcemap: true,
      exports: "named",
    },
    plugins: [
      typescript(),
      external(),
      resolve(),
      commonjs(),
      terser(),
    ],
  },
];
