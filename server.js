/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */


/*****************************************************************************/
var MONGODB_SERVER_ENABLED = true;
/*****************************************************************************/



// node modules
var path = require("path"),
    url_module = require("url");

// required modules
var app = require("express")(),
    server = require("http").Server(app),
    io = require("socket.io")(server);
var finalhandler = require("finalhandler"),
    serveStatic = require("serve-static");
var MongoClient = require("mongodb").MongoClient;

// our modules
var staticserve = require("./modules/staticserve");


/** MongoDB database */
var db;

/**
 * Functions to call right before exiting.
 * @type Array.<Function>
 */
var exitHandlers = [];

/**
 * SerGIS Server configuration.
 * @todo Move to external file.
 */
var config = {
    /** Default server port */
    PORT: process.env.PORT || 3000,
    
    /** MongoDB server */
    MONGO_SERVER: "mongodb://localhost:27017/sergis-server",
    
    /** Web resources directory (mapped to http://this-nodejs-server/lib/...) */
    RESOURCES_DIR: path.join(__dirname, "sergis-client", "lib"),
    
    /** Homepage file (mapped to http://this-nodejs-server/ */
    HOMEPAGE_FILE: path.join(__dirname, "sergis-client", "index.html")
};

///////////////////////////////////////////////////////////////////////////////
// Set up cleanup on exit
(function () {
    function exitHandler() {
        exitHandlers.forEach(function (item) {
            try {
                item();
            } catch (err) {
                console.error("Error running exit handler: ", err);
            }
        });
    }

    // So that the program will not close instantly when Ctrl+C is pressed, etc.
    process.stdin.resume();

    // Catch app closing
    process.on("exit", exitHandler);

    // Catch Ctrl+C event
    process.on("SIGINT", exitHandler);
})();

///////////////////////////////////////////////////////////////////////////////
// Connect to database and start HTTP server
(function () {
    if (MONGODB_SERVER_ENABLED) {
        // Use connect method to connect to the Server
        MongoClient.connect(config.MONGO_SERVER, function (err, _db) {
            if (err) {
                console.error("Error connecting to MongoDB server: ", err);
            } else {
                console.log("Connected to MongoDB server: " + config.MONGO_SERVER);
                db = _db;
                exitHandlers.push(function () {
                    // Close the database
                    if (db) {
                        console.log("Closing MongoDB database");
                        db.close();
                    }
                });
                startHttpServer();
                //db.close();
            }
        });
    } else {
        startHttpServer();
    }
    
    function startHttpServer() {
        // Start listening
        console.log("Starting SerGIS server on port " + config.PORT);
        server.listen(config.PORT);

        // Create handler for serving "/lib"
        app.use("/lib", serveStatic(config.RESOURCES_DIR, {}));

        // Create handler for serving the homepage
        app.get("/", function (req, res) {
            staticserve.servePage(req, res, config.HOMEPAGE_FILE);
        });
        
        // Create handler for serving the administrative interface
        app.get("/admin", function (req, res) {
            res.writeHead(200);
            res.end("<h1>Admin Page</h1>");
        });
    }
})();
