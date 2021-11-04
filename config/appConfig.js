const dotenv = require('dotenv').config();

module.exports = {
    STATUS_CODES: {
        INTERNAL_SERVER_ERROR: 500,
        OK: 200,
        BAD_REQUEST: 400,
        NOT_FOUND: 404,
        FORBIDEDEN: 403,
        UNAUTHORIZED: 401,
        CREATED: 201,
        VALIDATION_ERR: 422
    }
};