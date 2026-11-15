import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { VENDOR_YAML_DIR, readVendorManifest, validateVendor } from "./types/vendor.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = validateVendor(repoRoot);

if (errors.length > 0) {
  console.error("vendor validation failed:");
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const loaded = readVendorManifest(repoRoot);
if ("errors" in loaded) {
  console.error("vendor validation failed:");
  for (const error of loaded.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const count = Object.keys(loaded.manifest.files).length;
console.log(`OK: ${VENDOR_YAML_DIR} yaml ${loaded.manifest.version} (${count} files) matches ${VENDOR_YAML_DIR}/VERSION.json`);
