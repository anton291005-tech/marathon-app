const fs = require('fs');

if (!fs.existsSync('./dist/index.html')) {
  console.error('Build output missing dist/index.html. Run npm run build (BUILD_PATH=dist / CRA).');
  process.exit(1);
}

console.log('✅ dist/index.html exists');
