require('dotenv').config();
const express = require('express');
const cors = require('cors');

// create express app
const app = express();
app.use(cors());

require('./bootstrapApplication').bootstrap(app);

// listen for requests
var port = helper.env('PORT', 9011);
app.listen(port, () => {
    console.log(`--- Hi! Server is listening on port ${port} ---`);
});