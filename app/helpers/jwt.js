const jwt = require('jsonwebtoken');

const verifyJWT = async (token) => {
    return jwt.verify(token, helper.env('SECRET', 'secret'));
};
module.exports = {
    verifyJWT
};