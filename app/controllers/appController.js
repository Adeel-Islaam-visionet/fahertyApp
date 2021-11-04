const appService = require('../services/appService');

const error = new Error();
error.status = 'NOT_FOUND';
error.message = null;

const appController = {
    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    authenticate: async (req, res) => {
        try {
            let email = req.query.email;
            let request = await appService.authenticate(email);
            return helper.apiResponse(res, false, "Customer data found successfully", request);
        }
        catch (error) {
            const statusCode = error.status || "INTERNAL_SERVER_ERROR";
            return helper.apiResponse(res, true, error.message, null, statusCode);
        }
    }
}

module.exports = appController;