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


/**
 * Arguments passed via the command line (argv).
 */
var args = {};
(function () {
    var arg, name, value;
    for (var i = 2; i < process.argv.length; i++) {
        arg = process.argv[i];
        if (arg.indexOf("=") != -1) {
            name = arg.substring(0, arg.indexOf("="));
            value = arg.substring(arg.indexOf("=") + 1);
        } else {
            name = arg;
            value = true;
        }
        args[name] = value;
    }
})();

/**
 * SerGIS Server configuration.
 * @todo Move to external file.
 */
var config = {
    /** Default server port */
    PORT: process.env.PORT || 3000,
    
    /** MongoDB server */
    MONGO_SERVER: "mongodb://localhost:27017/sergis-server",
    
    // ARGUMENT-OVERRIDDEN CONFIG
    
    /** Whether to start the HTTP server */
    ENABLE_HTTP_SERVER: !!args["start-http-server"],
    
    /** Whether to start the WebSockets (socket.io) server */
    ENABLE_SOCKET_SERVER: !!args["start-socket-server"],
    
    /** Origin for the HTTP server (only set if running separately as the socket.io server) */
    HTTP_ORIGIN: args["http-server-origin"] || "",
    
    /** Origin for the socket.io server (set to empty string if same as http server) */
    SOCKET_ORIGIN: args["socket-server-origin"] || "",
    
    /** The prefix to the path (i.e. if someone is serving us at /my-web-game/..., this would be "/my-web-game") */
    HTTP_PREFIX: args["http-server-prefix"] || "",
    
    /** Templates directory */
    TEMPLATES_DIR: path.join(__dirname, "templates"),
    
    /** Web resources directory (mapped to http://this-nodejs-server/lib/...) */
    RESOURCES_DIR: path.join(__dirname, "sergis-client", "lib"),
    
    /** Path to the index.html file for sergis-client */
    GAME_INDEX: path.join(__dirname, "sergis-client", "index.html"),

    /** Username regex */
    USERNAME_REGEX: /^[A-Za-z0-9~$"':;,.-_]+/,

    /** Username in URL regex (i.e. "/" + USERNAME_REGEX + "/"?) */
    USERNAME_URL_REGEX: /^\/([A-Za-z0-9~$"':;,.-_]*)\/?/
};


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
    var argdata = [
        ["start-http-server", "Start the HTTP server."],
        ["start-socket-server", "Start the socket server."],
        ["http-server-origin=http://hostname:post", "Origin for the HTTP server (if separate from the socket server)"],
        ["socket-server-origin=http://hostname:port", "Origin for the socket server (if separate from the HTTP server)"],
        ["http-server-prefix=/path/prefix/by/server", "Prefix to the path added by a forwarding server"]
    ];
    var max = Math.max.apply(Math, argdata.map(function (arginfo) {
        return arginfo[0].length;
    }));
    argdata.forEach(function (arginfo) {
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
                app.use(pathDescrip, require("./modules/" + HTTP_SERVERS[pathDescrip])(config, db));
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
                io.of(pathDescrip).use(require("./modules/" + SOCKET_SERVERS[pathDescrip])(config, db, io));
            }
        }
    }
    
    // Get ready for more
    console.log("");
}
