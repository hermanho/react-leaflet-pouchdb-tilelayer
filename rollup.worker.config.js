import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";
import builtins from "@joseph184/rollup-plugin-node-builtins";

const input = "./src/lib/worker/worker.ts";
// const minifyExtension = (pathToFile) => pathToFile.replace(/\.js$/, ".min.js");

export default [
  {
    input,
    output: {
      file: "src/worker/worker.build.js",
      format: "umd",
    },
    plugins: [
      builtins(),
      resolve(),
      commonjs(),
      typescript({
        typescript: require("typescript"),
        useTsconfigDeclarationDir: true,
        // tsconfigOverride: {
        //   compilerOptions: {
        //     allowSyntheticDefaultImports: true,
        //     declaration: false,
        //     removeComments: false,
        //   },
        // },
      }),
      replace({
        "process.env.NODE_ENV": JSON.stringify("production"),
        "process.browser": true,
      }),
    ],
  },
];
