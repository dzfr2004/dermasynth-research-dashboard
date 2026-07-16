import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { searchLocations } from "../lib/environment.mjs";

const results = [];

async function evaluate(name, callback) {
  try {
    await callback();
    results.push({ name, status: "passed" });
  } catch (error) {
    results.push({ name, status: "failed", detail: error instanceof Error ? error.message : "Unknown failure" });
  }
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error("Could not reserve a local test port.");
  return port;
}

async function startDemoServer() {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH || "",
      PORT: String(port),
      LIVE_SERVICES_ENABLED: "false",
      OPENAI_API_KEY: "",
      OPENWEATHER_API_KEY: "",
      IQAIR_API_KEY: "",
      PINECONE_API_KEY: "",
      PINECONE_INDEX: "",
      PINECONE_INDEX_HOST: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out starting isolated test server. ${output}`)), 5_000);
    child.once("error", (error) => { clearTimeout(timeout); reject(error); });
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`Isolated test server exited early (${code}). ${output}`)); });
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes(`:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });

  return { child, baseUrl: `http://127.0.0.1:${port}` };
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode) return;
  child.kill("SIGINT");
  await once(child, "exit");
}

await evaluate("location adapter sanitises candidates and uses its cache", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url) => {
    calls += 1;
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.openweathermap.org");
    assert.equal(parsed.pathname, "/geo/1.0/direct");
    assert.equal(parsed.searchParams.get("q"), "Mock Harbour, MY");
    assert.equal(parsed.searchParams.get("limit"), "5");
    return new Response(JSON.stringify([
      { name: "Mock Harbour", state: "Selangor", country: "MY", lat: 3.123456, lon: 101.654321 },
      { name: "Out of range", country: "MY", lat: 99, lon: 101 },
    ]), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const config = {
      liveServicesEnabled: true,
      openWeather: { apiKey: "test-key" },
      locationSearchCacheSeconds: 60,
      requestTimeoutMs: 1_000,
    };
    const [first, concurrent] = await Promise.all([
      searchLocations(config, "Mock Harbour, MY"),
      searchLocations(config, "Mock Harbour, MY"),
    ]);
    const second = await searchLocations(config, "Mock Harbour, MY");
    assert.equal(calls, 1);
    assert.equal(first.cached, false);
    assert.equal(concurrent.cached, false);
    assert.equal(second.cached, true);
    assert.deepEqual(first.locations, [{
      name: "Mock Harbour",
      state: "Selangor",
      country: "MY",
      label: "Mock Harbour, Selangor, MY",
      lat: 3.1235,
      lon: 101.6543,
    }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await evaluate("location adapter labels disabled and unavailable states", async () => {
  const disabled = await searchLocations({ liveServicesEnabled: false, openWeather: { apiKey: "" } }, "Kuala Lumpur");
  assert.equal(disabled.mode, "disabled");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network unavailable"); };
  try {
    const unavailable = await searchLocations({
      liveServicesEnabled: true,
      openWeather: { apiKey: "test-key" },
      locationSearchCacheSeconds: 60,
      requestTimeoutMs: 1_000,
    }, "Unavailable Harbour");
    assert.equal(unavailable.mode, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await evaluate("location routes validate coordinates, propagate custom location, and throttle lookups", async () => {
  const { child, baseUrl } = await startDemoServer();
  try {
    const disabledLookup = await fetch(`${baseUrl}/api/locations?q=Kuala%20Lumpur`);
    assert.equal(disabledLookup.status, 200);
    assert.equal((await disabledLookup.json()).mode, "disabled");

    const malformed = await fetch(`${baseUrl}/api/environment?lat=&lon=&location=Empty`);
    assert.equal(malformed.status, 400);

    const routineResponse = await fetch(`${baseUrl}/api/routine`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "combination",
        concern: "acne",
        location: { name: "Penang Island, Penang, MY", lat: 5.4141, lon: 100.3288 },
      }),
    });
    assert.equal(routineResponse.status, 200);
    const routine = await routineResponse.json();
    assert.equal(routine.environment?.location?.name, "Penang Island, Penang, MY");

    for (let index = 0; index < 19; index += 1) {
      const response = await fetch(`${baseUrl}/api/locations?q=Rate%20Test`);
      assert.equal(response.status, 200);
    }
    const throttled = await fetch(`${baseUrl}/api/locations?q=Rate%20Test`);
    assert.equal(throttled.status, 429);
  } finally {
    await stopServer(child);
  }
});

const failed = results.filter((result) => result.status === "failed");
console.log(JSON.stringify({
  suite: "location-regression",
  scope: "Mocked geocoding plus an isolated demo server; no live provider calls.",
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2));

if (failed.length) process.exitCode = 1;
