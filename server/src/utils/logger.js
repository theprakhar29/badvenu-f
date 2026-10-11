const COLORS = {
  auth: "\x1b[36m", // cyan
  event: "\x1b[35m", // magenta
  booking: "\x1b[33m", // yellow
  payment: "\x1b[32m", // green
  scanner: "\x1b[34m", // blue
  scan: "\x1b[92m", // bright green
  sync: "\x1b[94m", // bright blue
  notify: "\x1b[90m", // gray
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
};

function timestamp() {
  return new Date().toISOString();
}

function write(category, message, data) {
  const color = COLORS[category] || "";
  const reset = COLORS.reset;
  const label = category.toUpperCase().padEnd(8);
  const line = `${color}[${timestamp()}] [${label}]${reset} ${message}`;
  if (data !== undefined) {
    console.log(line, data);
  } else {
    console.log(line);
  }
}

export const logger = {
  auth: (message, data) => write("auth", message, data),
  event: (message, data) => write("event", message, data),
  booking: (message, data) => write("booking", message, data),
  payment: (message, data) => write("payment", message, data),
  scanner: (message, data) => write("scanner", message, data),
  scan: (message, data) => write("scan", message, data),
  sync: (message, data) => write("sync", message, data),
  notify: (message, data) => write("notify", message, data),
  error: (message, data) => write("error", message, data),
};
