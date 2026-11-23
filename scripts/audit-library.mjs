import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {shelf,discoverBooks,buildBook,findBookRoot,neighbour} = require('../extensions/paper-writing/book-index.js');

const [directory, output] = process.argv.slice(2);
if (!directory || !fs.statSync(directory,{throwIfNoEntry:false})?.isDirectory()) {
  console.error('Usage: node scripts/audit-library.mjs <library-folder> [report.json]');
  process.exit(1);
}
const library = path.resolve(directory), started = Date.now();
const books = shelf([library]), collections = [], errors = [], warnings = [];
const containers = [...new Set(books.map(b=>b.collection))];
for (const container of containers) {
  const discovery = discoverBooks(container);
  if (discovery.truncated) warnings.push({folder:container,reason:'Discovery limit reached; original boundary retained.'});
  if (discovery.split) collections.push({folder:container,books:discovery.books.map(b=>({root:b.root,title:b.title,reason:b.reason}))});
}
const audited = books.map(item=>{
  const book = buildBook(item.root,{separateBooks:true});
  for (const chapter of book.chapters) {
    if (findBookRoot(chapter.file,[library]) !== item.root) errors.push({book:item.root,file:chapter.file,reason:'Chapter resolves to a different book.'});
  }
  if (book.truncated) warnings.push({folder:item.root,reason:'Chapter scan limit reached.'});
  if (book.chapters.length && neighbour(book,book.chapters.at(-1).file,1)) errors.push({book:item.root,reason:'Last chapter has a next chapter.'});
  return {...item,chapters:book.chapters.length};
});
const directories = fs.readdirSync(library,{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>path.join(library,e.name));
const report = {
  generatedAt:new Date().toISOString(),library,
  summary:{topLevelDirectories:directories.length,readingContainers:containers.length,collections:collections.length,books:audited.length,chapterEntries:audited.reduce((n,b)=>n+b.chapters,0),errors:errors.length,warnings:warnings.length,elapsedMs:Date.now()-started},
  collections,books:audited,unlistedDirectories:directories.filter(d=>!containers.includes(d)),errors,warnings
};
if (output) fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary,null,2));
for (const collection of collections) console.log(`${path.relative(library,collection.folder)}: ${collection.books.length} books`);
if (output) console.log(`Report: ${path.resolve(output)}`);
if (errors.length) process.exitCode=1;
