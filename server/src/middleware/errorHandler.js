export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  console.error(err);

  if (err.code === 11000) {
    // Mongo duplicate key error
    return res.status(409).json({
      error: { code: "DUPLICATE", message: "That value is already in use." },
    });
  }

  if (err.name === "MulterError" || /image/i.test(err.message || "")) {
    // File-too-large, wrong-field-name, or our custom fileFilter rejection
    return res.status(400).json({
      error: { code: "UPLOAD_ERROR", message: err.message || "Upload failed." },
    });
  }

  const status = err.status || 500;
  res.status(status).json({
    error: {
      code: err.code || "INTERNAL_ERROR",
      message: err.message || "Something went wrong.",
    },
  });
}
