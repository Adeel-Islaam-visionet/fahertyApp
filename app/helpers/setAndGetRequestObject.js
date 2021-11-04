let requestObject = null;

module.exports.setRequest = (req) => {
    requestObject = req;
};

module.exports.getRequest = () => {
    return requestObject;
};