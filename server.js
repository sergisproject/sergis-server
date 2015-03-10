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
// NOTE: express, http, socket.io, cookie-parser, coffee-script/register,
// and indie-set are require'd below if needed.
var MongoClient = require("mongodb").MongoClient;

// our modules
var config = require("./config");


/**
 * The different modules for the different sections of the HTTP server.
 * The keys are the Express paths, and the values are the filenames of the
 * modules in `modules/`.
 */
var HTTP_SERVERS = {
    "/game": "gameHandler",
    "/admin": "adminHandler",
    // This one catches everything else
    "/": "homepageHandler"
};


/**
 * The different modules for the different sections of the Socket.IO WebSockets
 * server. The keys are the socket namespaces, and the values are the filenames
 * of the modules in `modules/`.
 */
var SOCKET_SERVERS = {
    "/game": "gameSocketHandler"
};


/**
 * Functions to call right before exiting.
 * @type Array.<Function>
 */
var exitHandlers = [];

/**
 * Initialize the exit handlers.
 */
function initExitHandlers() {
    // So that the server will not close instantly when Ctrl+C is pressed, etc.
    process.stdin.resume();

    // Catch app closing
    process.on("beforeExit", runExitHandlers);

    // Catch exit signals (NOTE: Ctrl+C == SIGINT)
    process.on("SIGINT", runExitHandlers.bind(this, "caught SIGINT"));
    process.on("SIGTERM", runExitHandlers.bind(this, "caught SIGTERM"));
    process.on("SIGHUP", runExitHandlers.bind(this, "caught SIGHUP"));
    
    // Catch uncaught exceptions
    process.on("uncaughtException", function (err) {
        console.log("");
        console.error("UNCAUGHT EXCEPTION: ", err.stack);
        runExitHandlers();
    });
}

/**
 * Run all the exit handlers.
 *
 * @param {string} reason - The reason that we're exiting.
 */
function runExitHandlers(reason) {
    console.log("");
    console.log("Running exit handlers" + (reason ? " (" + reason + ")" : "") + "...");
    // Start from the end and run each exit handler
    while (exitHandlers.length) {
        try {
            exitHandlers.pop()();
        } catch (err) {
            console.error("Error running exit handler: ", err.stack);
        }
    }
    console.log("Exiting server...");
    process.exit();
}


////////////////////////////////////////////////////////////////////////////////
var db;
// Make sure we're starting something and, if so, set up exit handling and init
if (config.ENABLE_HTTP_SERVER || config.ENABLE_SOCKET_SERVER) {
    // Connect to database
    MongoClient.connect(config.MONGO_SERVER, function (err, _db) {
        if (err) {
            console.error("Error connecting to MongoDB server: ", err);
        } else {
            console.log("Connected to MongoDB server: " + config.MONGO_SERVER);
            db = _db;
            
            // Set up exit handler system
            initExitHandlers();
            
            // Set up exit handler for database
            exitHandlers.push(function () {
                // Close the database
                if (db) {
                    console.log("Closing MongoDB database");
                    db.close();
                }
            });
            
            // Initialize the rest of the server
            init();
        }
    });
} else {
    // Nope, nothing to do
    console.error("Neither HTTP nor socket server enabled!");
    console.log("\nUsage: " + process.argv[0] + " " + process.argv[1] + " [OPTIONS]");
    console.log("\nOptions:");
    var max = Math.max.apply(Math, config.argdata.map(function (arginfo) {
        return arginfo[0].length;
    }));
    config.argdata.forEach(function (arginfo) {
        var msg = "    " + arginfo[0];
        for (var i = 0; i < (max - arginfo[0].length); i++) {
            msg += " ";
        }
        msg += " : " + arginfo[1];
        console.log(msg);
    });
}




var app, server, io;
/** Set up the HTTP and/or socket server. */
function init() {
    // Start HTTP server (if enabled)
    if (config.ENABLE_HTTP_SERVER) {
        console.log("Starting SerGIS HTTP server on port " + config.PORT);

        // Create Express server instance
        var express = require("express"),
            cookieParser = require("cookie-parser");
        
        app = express();
        server = require("http").Server(app);

        // Listen with the HTTP server on our port
        server.listen(config.PORT);

        // Create handler for serving "/static"
        app.use("/lib", express.static(config.RESOURCES_DIR));
        
        // Set up cookie processing
        app.use(cookieParser(config.COOKIE_SIGNING_KEY || undefined));
        
        // Set up templating for HTML files
        require("coffee-script/register");
        app.engine("html", require("indie-set").__express);

        // Create handlers for our other page servers (see HTTP_SERVERS above)
        for (var pathDescrip in HTTP_SERVERS) {
            if (HTTP_SERVERS.hasOwnProperty(pathDescrip)) {
                app.use(pathDescrip, require("./modules/" + HTTP_SERVERS[pathDescrip])(db));
            }
        }
    }

    // Start socket server (if enabled)
    if (config.ENABLE_SOCKET_SERVER) {
        // Check if we already have the Express HTTP server
        if (app) {
            console.log("Starting SerGIS socket server with HTTP server");
            // Use the same server instance for the socket.io server
            io = require("socket.io")(server);
        } else {
            console.log("Starting SerGIS socket server on port " + config.PORT);
            // There's no HTTP server yet; make socket.io listen all by its lonesomes
            io = require("socket.io").listen(config.PORT);
        }
        if (config.SOCKET_ORIGIN) {
            console.log("Setting socket to allow origin " + config.HTTP_ORIGIN);
            io.origins(config.HTTP_ORIGIN);
        }

        // Create handlers for all our socket servers (see SOCKET_SERVERS above)
        for (var pathDescrip in SOCKET_SERVERS) {
            if (SOCKET_SERVERS.hasOwnProperty(pathDescrip)) {
                //io.of(pathDescrip).on("connection", require("./modules/socketServers/" + SOCKET_SERVERS[pathDescrip]));
                io.of(pathDescrip).use(require("./modules/" + SOCKET_SERVERS[pathDescrip])(db));
            }
        }
    }
    
    // Get ready for more
    console.log("");
}
