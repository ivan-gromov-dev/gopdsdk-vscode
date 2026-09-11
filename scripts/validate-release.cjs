"use strict";

const manifest = require("../package.json");
const channel = process.argv[2];
if (channel !== "pre-release" && channel !== "stable") {
  throw new Error(`invalid release channel: ${channel}`);
}
const [major, minor, patch] = manifest.version.split(".").map(Number);
if (![major, minor, patch].every(Number.isInteger)) throw new Error(`invalid Marketplace version: ${manifest.version}`);
if (channel === "pre-release" && (minor % 2 !== 1 || manifest.preview !== true)) {
  throw new Error("pre-release publication requires an odd minor version and preview: true");
}
if (channel === "stable" && (minor % 2 !== 0 || manifest.preview !== false)) {
  throw new Error("stable publication requires an even minor version and preview: false");
}
console.log(`${channel} manifest ${manifest.publisher}.${manifest.name}@${manifest.version} is valid`);
