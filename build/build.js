// Regenerate index.html: inline the HotUKDeals snapshot into build/src.html
const fs=require('fs'),D=require('path').resolve(__dirname,'..')+'/';
const x=fs.readFileSync(D+'build/hukd_sample.xml','utf8').replace(/<\/script/gi,'<\\/script');
fs.writeFileSync(D+'index.html',fs.readFileSync(D+'build/src.html','utf8').replace('%%HUKD%%',()=>x));console.log('built index.html');
