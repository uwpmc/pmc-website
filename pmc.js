const pug = require('pug');

console.log(pug.renderFile('public/index.pug', { name: 'Tim' }));
