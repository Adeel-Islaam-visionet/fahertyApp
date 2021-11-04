const appConfig = require('../../config/appConfig');

module.exports = (p) => {
    return appConfig.STATUS_CODES[p];
};