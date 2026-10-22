const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const pageFiles = fs.readdirSync(root).filter((file) => file.endsWith('.html'));

function removeEntry(target) {
  if (!fs.existsSync(target)) return;
  if (fs.lstatSync(target).isDirectory() && !fs.lstatSync(target).isSymbolicLink()) {
    for (const entry of fs.readdirSync(target)) removeEntry(path.join(target, entry));
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}

removeEntry(output);
fs.mkdirSync(output, { recursive: true });

for (const file of [...pageFiles, 'styles.css', 'app.js', 'social.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Copied ${pageFiles.length} pages and storefront assets to dist/.`);
