const http = require('http');
const { performance } = require('perf_hooks');
const b64 = require('./b64'); // Imports the huge string

// Helper to capture logs
let logBuffer = "";
function log(msg) {
    console.log(msg);
    logBuffer += msg + "\n";
}

async function runBenchmark() {
    logBuffer = ""; // Clear previous logs
    log("--- Starting Benchmark on Render (Node.js) ---");
    
    try {
        // 1. Decode Base64
        const wasmBytes = Buffer.from(b64, 'base64');

        // 2. Setup Memory
        let wasmMemory = null;
        let heapU8 = null;
        let heapView = null;
        const decoder = new TextDecoder("utf-8");

        function printWasmString(iov, iovcnt) {
            let str = "";
            for (let i = 0; i < iovcnt; i++) {
                const ptr = heapView.getUint32(iov + (i * 8), true);
                const len = heapView.getUint32(iov + (i * 8) + 4, true);
                if (len > 0) {
                    const bytes = heapU8.subarray(ptr, ptr + len);
                    str += decoder.decode(bytes);
                }
            }
            if (str.trim()) log(str);
            return str.length;
        }

        // 3. Imports
        const importObject = {
            a: {
                a: () => { throw new Error("WASM Throw"); },
                b: (fd, iov, iovcnt, pnum) => {
                    const numBytes = printWasmString(iov, iovcnt);
                    heapView.setUint32(pnum, numBytes, true);
                    return 0;
                },
                c: (pcount, pbufsize) => {
                    heapView.setUint32(pcount, 0, true);
                    heapView.setUint32(pbufsize, 0, true);
                    return 0;
                },
                d: () => { throw new Error("Abort"); },
                e: () => 0, f: () => 0, g: () => 0,
                h: (id, precision, out) => {
                    const now = BigInt(Math.floor(performance.now() * 1000000));
                    heapView.setBigUint64(out, now, true);
                    return 0;
                },
                i: (size) => {
                    try {
                        const pages = (size - wasmMemory.buffer.byteLength + 65535) / 65536;
                        wasmMemory.grow(pages);
                        heapU8 = new Uint8Array(wasmMemory.buffer);
                        heapView = new DataView(wasmMemory.buffer);
                        return 1;
                    } catch (e) {
                        log("Memory Grow Error: " + e);
                        return 0;
                    }
                },
                j: () => 2147483648, k: () => 0, l: () => 0
            }
        };

        // 4. Run
        const result = await WebAssembly.instantiate(wasmBytes, importObject);
        const exports = result.instance.exports;

        wasmMemory = exports.m;
        heapU8 = new Uint8Array(wasmMemory.buffer);
        heapView = new DataView(wasmMemory.buffer);

        if (exports.n) exports.n();
        if (exports.o) {
            try { exports.o(0, 0); } 
            catch (e) {
                if (e.message && (e.message.includes("unreachable") || e.message.includes("Aborted"))) {
                    log("Benchmark Finished.");
                } else {
                    log("Runtime Error: " + e);
                }
            }
        }

    } catch (e) {
        log("Critical Error: " + e);
    }
    
    return logBuffer;
}

// Create Web Server for Render
const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') return res.end();

    // Run the benchmark whenever the page is loaded
    const result = await runBenchmark();

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(result);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
