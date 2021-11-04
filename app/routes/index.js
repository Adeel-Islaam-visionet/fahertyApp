const fs = require('fs');

exports.bootstrap = app => {
    fs.readdirSync(__dirname).forEach(file => {
        if (file === 'index.js') {
            return;
        }

        const route = require(`${__dirname}/${file}`);

        if (!route || !route.router) {
            return;
        }

        app.use(`/${route.basePath ? `${route.basePath}` : ''}`, route.router);

    });
};