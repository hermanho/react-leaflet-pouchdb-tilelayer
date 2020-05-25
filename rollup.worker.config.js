import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";
import builtins from "@joseph184/rollup-plugin-node-builtins";

const input = "./src/worker/worker.ts";
// const minifyExtension = (pathToFile) => pathToFile.replace(/\.js$/, ".min.js");

export default [
  {
    input,
    output: {
      file: "src/worker/workerified.js",
      format: "umd",
      intro: "var global = typeof self !== undefined ? self : this;",
    },
    plugins: [
      builtins(),
      resolve(),
      commonjs(),
      typescript({
        typescript: require("typescript"),
        tsconfigOverride: {
          compilerOptions: {
            declaration: false,
            removeComments: false,
          },
        },
      }),
      replace({
        "process.env.NODE_ENV": JSON.stringify("production"),
        "process.browser": true,
      }),
    ],
  },
];
