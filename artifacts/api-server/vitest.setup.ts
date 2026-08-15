// The analyze rate limiter keys on IP, and the whole suite shares one.
// Raised here so tests exercise the routes rather than the limiter; the
// limiter itself keeps its production default outside tests.
process.env.ANALYZE_RATE_LIMIT_PER_MIN = "10000";

import { installProcessGuards } from "./src/lib/process-guards";

// Registered so tests run under the same protection as production.
installProcessGuards();
