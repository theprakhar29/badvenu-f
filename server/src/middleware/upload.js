import multer from "multer";
// import path from "node:path";
// import fs from "node:fs";
// import crypto from "node:crypto";

// const UPLOAD_DIR = path.resolve("uploads", "banners");
// fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, or WEBP images are allowed."));
  }
  cb(null, true);
}

export const uploadBannerMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single("banner");

// export { UPLOAD_DIR };
