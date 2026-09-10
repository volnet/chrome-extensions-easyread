import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { URL } from "node:url";
import { setTimeout } from "node:timers";

const source = readFileSync(new URL("../src/scripts/diagnostics.js", import.meta.url), "utf8");
function environment(enabled) {
  const data = {};
  const listeners = {};
  const context = vm.createContext({
    console: { log() {}, error() {} }, navigator: { userAgent: "test" }, location: { href: "chrome-extension://test/background.js" },
    chrome: { i18n: { getMessage: key => key }, runtime: { id: "test", getManifest: () => ({ version: "2.0.0" }), onMessage: { addListener() {} } },
      storage: { local: { get: async () => data, set: async value => Object.assign(data, value) } } },
    addEventListener: (name, handler) => { listeners[name] = handler; }
  });
  vm.runInContext(enabled ? source.replace("const DEVELOPMENT_DIAGNOSTICS = false;", "const DEVELOPMENT_DIAGNOSTICS = true;") : source, context);
  return { context, data, listeners };
}
test("release diagnostics do not install listeners, storage or download APIs", () => {
  const { context, listeners, data } = environment(false);
  assert.equal(context.EasyReadDiagnostics, undefined);
  assert.deepEqual(listeners, {});
  assert.deepEqual(data, {});
});
test("development diagnostics preserve original stacks, causes and circular details locally", async () => {
  const { context, data } = environment(true);
  vm.runInContext(`const cause = new Error("underlying"); const failure = new Error("capture failed", { cause }); failure.details = { password: "secret" }; failure.details.self = failure.details; EasyReadDiagnostics.stage({ stage: "cloning" }); EasyReadDiagnostics.record(failure, { operation: "html" });`, context);
  await new Promise(resolve => setTimeout(resolve, 0));
  const report = data.easyreadDevelopmentErrors[0];
  assert.match(report.error.stack, /capture failed/);
  assert.match(report.error.cause.stack, /underlying/);
  assert.equal(report.error.details.password, "[Redacted]");
  assert.equal(report.error.details.self, "[Circular]");
  assert.equal(report.stages[0].stage, "cloning");
});
