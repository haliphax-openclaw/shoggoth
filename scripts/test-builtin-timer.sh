#!/usr/bin/env ts-node
// This script allows development of builtins using local node modules.
//
// $1: The directory containing the builtins to test/run. (e.g., './builtins')
// $2: The module name to import and execute. (e.g., 'builtin-timer')
// Exit 0 on success, non-zero otherwise.

const { execSync } = require('child_process');
const path = require('path');

const builtinsDir = process.argv[2];
const builtinName = process.argv[3];

if (!builtinsDir || !builtinName) {
  console.error('Usage: ts-node <builtinsDir> <builtinName>');
  process.exit(1);
}

try {
  // Use Babel/ts-node to execute the module
  execSync(`ts-node ${path.join(builtinsDir, `${builtinName}.ts`)}`, { stdio: 'inherit' });
} catch (console.error('Error executing builtins. Error from the module:', ex));
