const fs = require('fs');

exports.bootstrap = _ => {
    global['helper'] = [];

    fs.readdirSync(__dirname).forEach(file => {
        if (file === 'index.js') {
            return;
        }

        const broken = file.split('.');
        const helperName = `${broken[0]}`;

        global['helper'][helperName] = require(`${__dirname}/${file}`);
    })
};