const fs = require("fs");

const btoa = (s) => Buffer.from(s).toString("base64");

function createEmbeddedWorkerFromBundle(workerBundleFile, workerEmbeddedFile) {
  const workerScript = String(fs.readFileSync(workerBundleFile));

  // const workerDataUrl =
  //   "data:application/javascript;base64," + btoa(workerScript);
  const workerDataUrl = JSON.stringify(workerScript);

  fs.writeFileSync(
    workerEmbeddedFile,
    "module.exports = " + workerDataUrl + ";\n"
  );
}

function create() {
  const WORKER_FILE = "./src/lib/worker/workerified.js";
  const WORKER_EMBEDDED_FILE = "./src/lib/worker.embedded.js";

  createEmbeddedWorkerFromBundle(WORKER_FILE, WORKER_EMBEDDED_FILE);
  console.log("\nCreated embedded worker " + WORKER_EMBEDDED_FILE);
}
create();
