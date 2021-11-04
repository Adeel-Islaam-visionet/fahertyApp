const express = require('express');
const router = express.Router();

const appController = require('../controllers/appController');

router.route('/authenticate').get(appController.authenticate);

module.exports = {
    router: router,
    basePath: 'request'
};