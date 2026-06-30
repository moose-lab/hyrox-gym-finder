#!/usr/bin/env node

import { copyFile, cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const distDir = resolve(rootDir, "dist");

await rm(distDir, { force: true, recursive: true });
await mkdir(distDir, { recursive: true });
await copyFile(resolve(rootDir, "index.html"), resolve(distDir, "index.html"));
await cp(resolve(rootDir, "src"), resolve(distDir, "src"), { recursive: true });
