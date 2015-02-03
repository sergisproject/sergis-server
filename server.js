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

/*
function handler(req, res) {
    var url = url_module.parse(req.url, true);
    
    // Assuming a form resembling /dir/file
    // "/file"            --> dir=="file" and file==""
    // "/dir/file"        --> dir=="dir"  and file=="file"
    // "/dir/subdir/file" --> dir=="dir"  and file=="subdir/file"
    var dir = url.pathname.substring(1);
    if (dir.indexOf("/") != -1) dir = dir.substring(0, dir.indexOf("/"));
    var file = url.pathname.substring(dir.length + 2);
    
    // The home page
    if (dir == "") {
        staticserve.servePage(req, res, config.HOMEPAGE_FILE);
    // The /lib stuff (static resources)
    } else if (dir == "lib") {
        staticserve.serveResource(req, res, path.join(config.RESOURCES_DIR, file));
    // The /admin stuff (TODO: future)
    } else if (dir == "admin" && file == "") {
        //serveAdmin(url, req, res);
    // Anything else
    } else {
        staticserve.serveError(req, res, 404);
    }
}
*/

app.get("/", function (req, res) {
    staticserve.servePage(req, res, config.HOMEPAGE_FILE);
});
