const fetch = require('node-fetch');
const { authenticate } = require('../controllers/appController');

const appService = {
    /**
     * @param req
     * @param res
     * @returns {Promise<*>}
     */
    authenticate: async (email) => {
        let _URL = `https://a.klaviyo.com/api/v2/people/search?api_key=pk_563bc4ef199f0690a3c18a16ec39367c25&email=${email}`;
        let data = await ((await fetch(_URL, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        })).json());
        
        if(data.id) {
            let _klavyioUrl = `https://a.klaviyo.com/api/v1/person/${data.id}?api_key=pk_563bc4ef199f0690a3c18a16ec39367c25`;
            return await ((await fetch(_klavyioUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            })).json());
        }
        else {
            return data;
        }
    }
}

module.exports = appService;