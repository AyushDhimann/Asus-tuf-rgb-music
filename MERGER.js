const fs = require('fs');
const path = require('path');

// List of directories to search
const directories = [
  'Disco/'
];

// Output file path
const outputFilePath = 'all.txt';

// List of blacklisted files and directories
const blacklist = [];

// Function to check if a file or directory is blacklisted
function isBlacklisted(filePath) {
  return blacklist.some(blacklistedPath => path.resolve(filePath) === path.resolve(blacklistedPath));
}

// Function to read files from a directory and append their contents to the output file
function appendFilesFromDirectory(directory) {
  const files = fs.readdirSync(directory);

  files.forEach(file => {
    const filePath = path.join(directory, file);
    const fileStats = fs.statSync(filePath);

    if (isBlacklisted(filePath)) {
      console.log(`Skipping blacklisted file or directory: ${filePath}`);
      return;
    }

    if (fileStats.isFile()) {
      const fileContents = fs.readFileSync(filePath, 'utf-8');
      fs.appendFileSync(outputFilePath, `\n\n--- ${filePath} ---\n\n`);
      fs.appendFileSync(outputFilePath, fileContents);
    } else if (fileStats.isDirectory()) {
      appendFilesFromDirectory(filePath); // Recursively process subdirectories
    }
  });
}

// Clear the output file before appending new content
fs.writeFileSync(outputFilePath, '');

// Process each directory
directories.forEach(directory => {
  appendFilesFromDirectory(directory);
});

console.log('Files have been successfully copied to the output file.');
