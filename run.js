const fs = require('fs');
const path = require('path');

async function loadWasmBytes() {
  const wasmPath = path.resolve(__dirname, 'wasm.wasm');
  if (fs.existsSync(wasmPath)) {
    console.log("Loading wasm.wasm from project folder...");
    return fs.readFileSync(wasmPath);
  }
  throw new Error("Missing wasm.wasm!");
}

function createImports() {
  let wasmMemory = null;
  let heapU8 = null;
  let heapView = null;

  function setMemory(mem) {
    wasmMemory = mem;
    heapU8 = new Uint8Array(mem.buffer);
    heapView = new DataView(mem.buffer);
  }

  const textDecoder = new TextDecoder();

  function printWasmString(iov, iovcnt) {
    let str = "";
    for (let i = 0; i < iovcnt; i++) {
      const ptr = heapView.getUint32(iov + i * 8, true);
      const len = heapView.getUint32(iov + i * 8 + 4, true);
      const bytes = heapU8.subarray(ptr, ptr + len);
      str += textDecoder.decode(bytes);
    }
    console.log(str);
    return str.length;
  }

  return {
    importObject: {
      a: {
        a: () => { throw new Error("WASM error"); },
        b: (fd, iov, iovcnt, pnum) => {
          const n = printWasmString(iov, iovcnt);
          heapView.setUint32(pnum, n, true);
          return 0;
        },
        c: (pcount, pbufsize) => {
          heapView.setUint32(pcount, 0, true);
          heapView.setUint32(pbufsize, 0, true);
          return 0;
        },
        d: () => { throw new Error("Abort called"); },
        e: () => 0,
        f: () => 0,
        g: () => 0,

        h: (id, precision, out) => {
          const now = BigInt(Date.now()) * 1000000n;
          heapView.setBigUint64(out, now, true);
          return 0;
        },

        i: (size) => {
          const neededPages = Math.ceil(
            (size - wasmMemory.buffer.byteLength) / 65536
          );
          if (neededPages > 0) wasmMemory.grow(neededPages);
          heapU8 = new Uint8Array(wasmMemory.buffer);
          heapView = new DataView(wasmMemory.buffer);
          return 1;
        },
        j: () => 2147483648,
        k: () => 0,
        l: () => 0
      }
    },
    setMemory
  };
}

async function run() {
  const wasmBytes = await loadWasmBytes();
  const { importObject, setMemory } = createImports();

  const result = await WebAssembly.instantiate(wasmBytes, importObject);
  const exports = result.instance.exports;

  const memory = exports.m || exports.memory;
  setMemory(memory);

  console.log("--- Running WASM Benchmark ---");

  if (exports.n) exports.n();
  if (exports.o) exports.o(0, 0);

  console.log("--- Benchmark Finished ---");
}

run();
