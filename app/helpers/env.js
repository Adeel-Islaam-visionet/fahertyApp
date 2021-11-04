module.exports = (key, defaultValue) => {
    return process.env[key] || defaultValue;
};