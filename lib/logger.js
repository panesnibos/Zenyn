const isTTY = !!process.stdout.isTTY && process.env.NO_COLOR == null;

const paint = (code, text) => (isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);

const c = {
  red: (s) => paint(31, s),
  green: (s) => paint(32, s),
  yellow: (s) => paint(33, s),
  blue: (s) => paint(34, s),
  magenta: (s) => paint(35, s),
  cyan: (s) => paint(36, s),
  gray: (s) => paint(90, s),
  bold: (s) => paint(1, s),
};

const pad = (n) => String(n).padStart(2, "0");

const clock = () => {
  const d = new Date();
  return c.gray(`[${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`);
};

const formatArgs = (args) =>
  args
    .map((a) => {
      if (a instanceof Error) return `${a.message}${a.stack ? `\n${c.gray(a.stack)}` : ""}`;
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");

const line = (label, color, args) => console.log(`${clock()} ${color(label.padEnd(5))} ${formatArgs(args)}`);

const logger = {
  info: (...a) => line("INFO", c.blue, a),
  ok: (...a) => line("OK", c.green, a),
  warn: (...a) => line("WARN", c.yellow, a),
  error: (...a) => line("ERR", c.red, a),
  cmd: (...a) => line("CMD", c.magenta, a),
  msg: (...a) => line("MSG", c.cyan, a),
  debug: (...a) => line("DBG", c.gray, a),

  divider: (len = 42) => console.log(c.gray("─".repeat(len))),

  banner: (title, subtitle) => {
    const width = 42;
    const top = "╭" + "─".repeat(width) + "╮";
    const bottom = "╰" + "─".repeat(width) + "╯";
    const row = (text) => `${c.gray("│")} ${c.bold(text.padEnd(width - 1))}${c.gray("│")}`;

    console.log("");
    console.log(c.cyan(top));
    console.log(row(title));
    if (subtitle) console.log(row(subtitle));
    console.log(c.cyan(bottom));
    console.log("");
  },

  kv: (key, value) => console.log(`   ${c.gray(key.padEnd(10))}: ${c.bold(String(value))}`),

  section: (title) => {
    console.log("");
    console.log(c.cyan(`◆ ${title}`));
  },
};

module.exports = logger;
