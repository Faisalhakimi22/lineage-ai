import path from "node:path";
import { config as loadEnv } from "dotenv";
import app from "./app";
import { installProcessGuards } from "./lib/process-guards";
import { logger } from "./lib/logger";

// Local development uses the workspace-root .env documented in the README.
// Existing process variables win, which keeps hosting-platform configuration
// authoritative and prevents a checked-out local file overriding deployment.
loadEnv({ path: path.resolve(import.meta.dirname, "../../../.env") });

installProcessGuards();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
