/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// node modules
var path = require("path"),
    url_module = require("url");

// required modules
var app = require("express")(),
    server = require("http").Server(app),
    io = require("socket.io")(server);
var finalhandler = require("finalhandler"),
    serveStatic = require("serve-static");

// our modules
var staticserve = require("./modules/staticserve");

/**
 * SerGIS Server configuration.
 *
 * @todo Move to external file.
 */
var config = {
    /** Default server port */
    PORT: process.env.PORT || 3000,
    
    /** Web resources directory (mapped to http://this-nodejs-server/lib/...) */
    RESOURCES_DIR: path.join(__dirname, "sergis-client", "lib"),
    
    /** Homepage file (mapped to http://this-nodejs-server/ */
    HOMEPAGE_FILE: path.join(__dirname, "sergis-client", "index.html")
};

// Start listening
console.log("Starting SerGIS server on port " + config.PORT);
server.listen(config.PORT);

// Create handler for serving "/lib"
app.use("/lib", serveStatic(config.RESOURCES_DIR, {}));

app.get("/", function (req, res) {
    staticserve.servePage(req, res, config.HOMEPAGE_FILE);
});
