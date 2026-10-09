// Builds the WebAssembly module and writes it, as base64, into wasm.js, so that
// index.js runs anywhere without fetching or locating a file. Also brings the
// licence and notice in from the repository's root, for the published package.
//   node build.mjs      (needs: rustup target add wasm32-unknown-unknown)
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url);
execFileSync("cargo", ["build", "--release", "--locked", "--target", "wasm32-unknown-unknown"], { cwd: here, stdio: "inherit" });
const built = readFileSync(new URL("target/wasm32-unknown-unknown/release/taktus_wasm.wasm", here));
writeFileSync(new URL("wasm.js", here), `export const wasm = "${built.toString("base64")}";\n`);
for (const file of ["LICENSE", "NOTICE"]) copyFileSync(new URL(`../${file}`, here), new URL(file, here));
console.log(`wasm.js: ${built.length} bytes of WebAssembly`);
