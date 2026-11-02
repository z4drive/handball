import { readFileSync, existsSync } from "fs";
import path from "path";

const STATIC_FALLBACK_VERSION = "2026.11.02-" + Date.now().toString(36);
const STATIC_FALLBACK_TIME = new Date().toISOString();

export default function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  let version = STATIC_FALLBACK_VERSION;
  let buildTime = STATIC_FALLBACK_TIME;

  try {
    const versionPath = path.join(process.cwd(), "public", "version.json");
    if (existsSync(versionPath)) {
      const data = JSON.parse(readFileSync(versionPath, "utf-8"));
      if (data.version) version = data.version;
      if (data.buildTime) buildTime = data.buildTime;
    }
  } catch (e) {
    // fallback to dynamic version
  }

  return res.status(200).json({
    version,
    buildTime,
    timestamp: Date.now()
  });
}
