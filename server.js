/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */


/*****************************************************************************/
// mongod --dbpath=\mongodata --port 27017
// mongod --dbpath=/var/mongod
/*****************************************************************************/



// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var express = require("express"),
    app = express(),
    server = require("http").Server(app),
    io = require("socket.io")(server);
require("coffee-script/register");
var set = require("indie-set");
var MongoClient = require("mongodb").MongoClient;


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
    
    /** Templates directory */
    TEMPLATES_DIR: path.join(__dirname, "templates"),
    
    /** Web resources directory (mapped to http://this-nodejs-server/lib/...) */
    RESOURCES_DIR: path.join(__dirname, "sergis-client", "lib"),
    
    /** Homepage file (mapped to http://this-nodejs-server/ */
    HOMEPAGE_FILE: path.join(__dirname, "sergis-client", "index.html")
};

///////////////////////////////////////////////////////////////////////////////
// Set up cleanup on exit
function setupCleanup() {
    // So that the program will not close instantly when Ctrl+C is pressed, etc.
    process.stdin.resume();

    // Catch app closing
    process.on("exit", function () {
        console.log("Exiting...");
        exitHandlers.forEach(function (item) {
            try {
                item();
            } catch (err) {
                console.error("Error running exit handler: ", err);
            }
        });
        return true;
    });

    // Catch Ctrl+C event
    process.on("SIGINT", function () {
        console.log("Caught SIGINT...");
        process.exit(2);
    });
}

///////////////////////////////////////////////////////////////////////////////
// Connect to database and start HTTP server
MongoClient.connect(config.MONGO_SERVER, function (err, db) {
    if (err) {
        console.error("Error connecting to MongoDB server: ", err);
    } else {
        console.log("Connected to MongoDB server: " + config.MONGO_SERVER);
        exitHandlers.push(function () {
            // Close the database
            if (db) {
                console.log("Closing MongoDB database");
                db.close();
            }
        });

        // Start listening
        console.log("Starting SerGIS server on port " + config.PORT);
        server.listen(config.PORT);

        // Create handler for serving "/lib"
        app.use("/lib", express.static(config.RESOURCES_DIR));

        // Set up templating for HTML files
        app.engine("html", set.__express);

        // Create handler for serving the homepage
        require("./modules/client").init(app, io, db, config);

        // Create handler for serving the administrative interface
        require("./modules/admin").init(app, io, db, config);
        
        // Set up cleanup
        setupCleanup();
    }
});
