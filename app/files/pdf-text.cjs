// Child-process helper that prints the text of a PDF or DOCX.
const fs = require('node:fs');
const file = process.argv[2];
if (file.toLowerCase().endsWith('.docx')) {
  try {
    process.stdout.write(require('./docx.cjs').docxText(fs.readFileSync(file)));
  } catch {
    process.exitCode = 1;
  }
} else
  require('pdf-parse/lib/pdf-parse.js')(fs.readFileSync(file), { max: 150 })
    .then((r) => process.stdout.write(r.text.slice(0, 900000)))
    .catch(() => (process.exitCode = 1));
