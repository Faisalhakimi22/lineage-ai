import { Router, type IRouter } from "express";
import multer from "multer";
import { AnalyzeTextBody } from "@workspace/api-zod";
import { runAnalysis } from "../lib/analyze";
import { extractTextFromImage } from "../lib/ocr";
import { ApiError, sendError } from "../lib/errors";
import { positiveIntegerEnv, rateLimit } from "../lib/rate-limit";
import { optionalAuth } from "../middlewares/auth";
import { historyRepository } from "../domain/history";
import { logger } from "../lib/logger";
import { buildImageEvidence } from "../lib/provenance/image-evidence";

const router: IRouter = Router();

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Declared MIME is attacker-controlled, so this is a first gate only. The
    // real protection is that the bytes are handed to an OCR engine and never
    // written to disk, executed, or served back.
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      cb(
        new ApiError(
          "UNSUPPORTED_MEDIA_TYPE",
          "That file type isn't supported. Upload a PNG, JPEG, WebP, BMP or TIFF screenshot.",
        ),
      );
      return;
    }
    cb(null, true);
  },
});

/**
 * Analysis is the expensive path (OCR, optional model calls), so it stays
 * bounded. The limiter keys on IP, which means an entire venue behind one NAT
 * shares a single budget - at a demo booth several people trying claims in
 * succession would collide, so the default is set well above realistic
 * individual use rather than at the tightest plausible value.
 *
 * Overridable so tests can exercise the routes without tripping it; the
 * production default applies whenever the variable is unset.
 */
const analyzeLimiter = rateLimit({
  name: "analyze",
  windowMs: 60_000,
  max: positiveIntegerEnv(
    process.env["ANALYZE_RATE_LIMIT_PER_MIN"],
    60,
    "ANALYZE_RATE_LIMIT_PER_MIN",
  ),
});

router.post("/analyze", analyzeLimiter, optionalAuth, async (req, res) => {
  try {
    const parsed = AnalyzeTextBody.safeParse(req.body);

    if (!parsed.success) {
      const tooLong = typeof req.body?.text === "string" && req.body.text.length > 5000;
      throw new ApiError(
        tooLong ? "INPUT_TOO_LONG" : "EMPTY_INPUT",
        tooLong
          ? "That message is longer than 5000 characters. Paste the part containing the claim."
          : "Paste the message or claim you'd like traced.",
      );
    }

    const result = await runAnalysis(parsed.data.text, "text", {
      occurrence: parsed.data.occurrence ?? null,
    });
    const saved = await historyRepository.saveIfAuthenticated(
      req.user,
      "text",
      parsed.data.text,
      result,
    );

    res.json(saved);
  } catch (err) {
    sendError(res, err);
  }
});

router.post(
  "/analyze/image",
  analyzeLimiter,
  optionalAuth,
  (req, res, next) => {
    upload.single("image")(req, res, (err: unknown) => {
      if (!err) {
        next();
        return;
      }
      if (err instanceof ApiError) {
        sendError(res, err);
        return;
      }
      if (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: string }).code === "LIMIT_FILE_SIZE"
      ) {
        sendError(
          res,
          new ApiError(
            "FILE_TOO_LARGE",
            "That image is larger than 8 MB. Try a screenshot rather than a full-resolution photo.",
          ),
        );
        return;
      }
      sendError(res, err);
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        throw new ApiError("VALIDATION_ERROR", "No image was attached.");
      }

      const text = await extractTextFromImage(req.file.buffer);

      // An empty OCR result is reported plainly rather than being run through
      // the pipeline to produce a confident-looking answer about nothing.
      if (text.trim().length === 0) {
        throw new ApiError(
          "OCR_EMPTY",
          "We couldn't find any readable text in that image. If the text is small, blurry, or part of a graphic, try a clearer screenshot or paste the text directly.",
        );
      }

      const imageEvidence = buildImageEvidence({
        buffer: req.file.buffer,
        extractedText: text,
        mediaType: req.file.mimetype || null,
        originalFilename: req.file.originalname || null,
      });
      const result = await runAnalysis(text, "image", { imageEvidence });
      const saved = await historyRepository.saveIfAuthenticated(
        req.user,
        "image",
        text,
        result,
      );

      res.json(saved);
    } catch (err) {
      if (!(err instanceof ApiError)) {
        logger.error({ err }, "image analysis failed");
      }
      sendError(res, err);
    }
  },
);

export default router;
