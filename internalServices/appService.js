const fetch = require('node-fetch');

module.exports = {
    saveAPIUsageLog: async (body) => {
        let _URL = helper.env(process.env.NODE_ENV == 'production' ? 'AUDITLOG_SERVICE_URL_PRODUCTION' : process.env.NODE_ENV == 'staging' ? 'AUDITLOG_SERVICE_URL_STAGING' : 'AUDITLOG_SERVICE_URL') + 'saveAPIUsageLogs';
        return await ((await fetch(_URL, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'executionType': 'internal',
            },
        })).json());
    },
};