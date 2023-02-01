import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import replace from "@rollup/plugin-replace";
import builtins from "@joseph184/rollup-plugin-node-builtins";

const input = "./src/lib/worker/worker.ts";
// const minifyExtension = (pathToFile) => pathToFile.replace(/\.js$/, ".min.js");

export default [
  {
    input,
    output: {
      file: "src/worker/worker.build.js",
      format: "cjs",
    },
    plugins: [
      builtins(),
      resolve(),
      commonjs(),
      typescript(),
      replace({
        "process.env.NODE_ENV": JSON.stringify("production"),
        "process.browser": true,
      }),
    ],
  },
];
