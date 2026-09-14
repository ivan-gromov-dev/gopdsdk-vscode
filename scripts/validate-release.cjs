"use strict";

const manifest = require("../package.json");
const channel = process.argv[2];
if (channel !== "pre-release" && channel !== "stable") {
  throw new Error(`invalid release channel: ${channel}`);
}
const [major, minor, patch] = manifest.version.split(".").map(Number);
if (![major, minor, patch].every(Number.isInteger)) throw new Error(`invalid Marketplace version: ${manifest.version}`);
if (channel === "pre-release" && manifest.preview !== true) {
  throw new Error("pre-release publication requires preview: true");
}
if (channel === "stable" && manifest.preview !== false) {
  throw new Error("stable publication requires preview: false");
}
console.log(`${channel} manifest ${manifest.publisher}.${manifest.name}@${manifest.version} is valid`);
