import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { VENDOR_YAML_DIR, VERSION_FILE, validateVendor } from "./vendor.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("validateVendor: the vendored yaml tree matches VERSION.json", () => {
  assert.deepEqual(validateVendor(repoRoot), []);
});

test("validateVendor: a checksum mismatch is reported", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vendor-"));
  try {
    const dir = join(root, VENDOR_YAML_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "LICENSE"), "ISC\n");
    writeFileSync(
      join(dir, VERSION_FILE),
      `${JSON.stringify(
        {
          version: "2.9.1",
          tarball: "https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz",
          files: { LICENSE: "0".repeat(64) },
        },
        null,
        2,
      )}\n`,
    );
    const errors = validateVendor(root);
    assert.ok(errors.some((error) => /LICENSE/.test(error) && /sha256/.test(error)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("validateVendor: an extra file is reported", () => {
  const root = mkdtempSync(join(tmpdir(), "nerdway-vendor-extra-"));
  try {
    const dir = join(root, VENDOR_YAML_DIR);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "LICENSE"), "ISC\n");
    writeFileSync(join(dir, "extra.js"), "export {}\n");
    writeFileSync(
      join(dir, VERSION_FILE),
      `${JSON.stringify(
        {
          version: "2.9.1",
          tarball: "https://registry.npmjs.org/yaml/-/yaml-2.9.1.tgz",
          files: { LICENSE: "0".repeat(64) },
        },
        null,
        2,
      )}\n`,
    );
    const errors = validateVendor(root);
    assert.ok(errors.some((error) => /extra\.js/.test(error)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
