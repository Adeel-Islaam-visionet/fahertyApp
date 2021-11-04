const path = require('path');

exports.bootstrap = app => {

    require('./app/helpers').bootstrap();

    require('./app/routes').bootstrap(app);

    //require('./config/connectDatabase').bootstrap();

};