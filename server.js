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
var path = require("path");

// required modules
// NOTE: require'd below if needed:
// express, express-sessions, connect-mongo, http, socket.io, cookie-parser,
// coffee-script/register, indie-set, ejs
var MongoClient = require("mongodb").MongoClient;

// our modules
var config = require("./config"),
    db = require("./modules/db");


/**
 * The different plain static file directories.
 * The keys are the Express paths, and the values are directories.
 */
var STATIC_DIRECTORIES = {
    "/client-lib": config.CLIENT_RESOURCES_DIR,
    "/author-lib": config.AUTHOR_RESOURCES_DIR
};


/**
 * The different modules for the different sections of the HTTP server.
 * The keys are the Express paths, and the values are the filenames of the
 * modules in `modules/pageServers/`.
 */
var HTTP_SERVERS = {
    "/static": "staticHandler",
    "/games": "gamesHandler",
    "/account": "accountHandler",
    // This one catches everything else
    "/": "homepageHandler"
};


/**
 * The different modules for the different sections of the Socket.IO WebSockets
 * server. The keys are the socket namespaces, and the values are the filenames
 * of the modules in `modules/socketServers/`.
 */
var SOCKET_SERVERS = {
    "/game": "gameSocketHandler",
    "/author": "authorSocketHandler"
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
    try {
        process.stdin.resume();
    } catch (err) {
        console.error("Error listening on stdin: ", err.stack);
    }

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
var mdb;  // (Mongo Database)
// Make sure we're starting something and, if so, set up exit handling and init
if (config.ENABLE_HTTP_SERVER || config.ENABLE_SOCKET_SERVER) {
    // Connect to database
    MongoClient.connect(config.MONGO_SERVER, function (err, _db) {
        if (err) {
            console.error("Error connecting to MongoDB server: ", err);
        } else {
            console.log("Connected to MongoDB server: " + config.MONGO_SERVER);
            mdb = _db;
            
            // Set up exit handler system
            initExitHandlers();
            
            // Set up exit handler for database
            exitHandlers.push(function () {
                // Close the database
                if (mdb) {
                    console.log("Closing MongoDB database");
                    mdb.close();
                }
            });
            
            // Initialize the db module
            db.init(mdb);
            
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
        console.log("Starting SerGIS HTTP server on port " + config.PORT + "...");

        // Require more stuff
        require("coffee-script/register");  // for indie-set
        var express = require("express"),
            session = require("express-session"),
            MongoStore = require("connect-mongo")(session),
            cookieParser = require("cookie-parser"),
            indieSet = require("indie-set"),
            ejs = require("ejs");
        
        // Create Express server instance
        app = express();
        server = require("http").Server(app);

        // Listen with the HTTP server on our port
        server.listen(config.PORT);

        // Set up static directories
        for (var pathDescrip in STATIC_DIRECTORIES) {
            if (STATIC_DIRECTORIES.hasOwnProperty(pathDescrip)) {
                app.use(config.HTTP_PREFIX + pathDescrip, express.static(STATIC_DIRECTORIES[pathDescrip]));
            }
        }
        
        // Set up cookie processing
        app.use(cookieParser(config.COOKIE_SIGNING_KEY || undefined));
        
        // Set up sessions
        app.use(session({
            secret: config.SESSION_SECRET,
            // whether to automatically save the session
            resave: false,
            // whether to save the session before anything has been written to it
            saveUninitialized: false,
            // use mongoDB to store the sessions
            store: new MongoStore({
                db: mdb
            })
        }));
        
        // Set up templating for HTML files
        app.set("views", config.TEMPLATES_DIR);
        app.engine("html", function (path, data, callback) {
            if (!data) data = {};
            if (!data.__set) data.__set = {};
            data["style-simple.css"] = (config.HTTP_PREFIX || "") + "/client-lib/style-simple.css";
            data.__set.renderStatic = true;
            return indieSet.__express(path, data, function (err, data) {
                if (err) return callback(err);
                // Make sure that there's a doctype
                if (data && data.substring(0, data.indexOf("\n")).toLowerCase().indexOf("doctype") == -1) {
                    data = "<!DOCTYPE html>\n" + data;
                }
                callback(err, data);
            });
        });
        app.engine("ejs", function (path, data, callback) {
            if (!data) data = {};
            data["httpPrefix"] = (config.HTTP_PREFIX || "");
            return ejs.renderFile(path, data, callback);
        });
        
        // Set up automatic creation of req.user
        app.use(function (req, res, next) {
            if (req.session && req.session.username) {
                db.users.get(req.session.username, function (err, user) {
                    if (err || !user) {
                        // Bad username in session!
                        // Destroy the session
                        req.session.destroy(function (err) {
                            if (err){
                                console.error("ERROR DESTROYING SESSION: ", err.stack);
                            }
                            // Now, we can just continue, since the login page will show if needed
                            return next();
                        });
                    }
                    // All good; store the user with the request.
                    req.user = user;
                    // And, continue on our merry way
                    return next();
                });
            } else {
                // No user
                return next();
            }
        });

        // Create handlers for our other page servers (see HTTP_SERVERS above)
        for (var pathDescrip in HTTP_SERVERS) {
            if (HTTP_SERVERS.hasOwnProperty(pathDescrip)) {
                app.use((config.HTTP_PREFIX || "") + pathDescrip, require("./modules/pageServers/" + HTTP_SERVERS[pathDescrip]));
            }
        }
        
        // Set up error handling
        app.use(function (err, req, res, next) {
            // NOTE: It probably wouldn't be beneficial to cause any errors here.
            console.error("--------------------------------------------------------------------------------");
            console.error("SerGIS Server ERROR at " + (new Date()) + ":\n" + err.stack + "\n\n");
            res.status(500);
            res.render("error.ejs", {
                me: req.user,
                number: 500,
                title: "Internal Server Error",
                details: "See error console on server, or contact the site administrator with the exact date and time that this error occurred."
            });
        });
    }

    // Start socket server (if enabled)
    if (config.ENABLE_SOCKET_SERVER) {
        // Decide on the socket.io path
        var socketPath = undefined;
        if (config.SOCKET_PREFIX) {
            console.log("Setting socket path to " + config.SOCKET_PREFIX + "/socket.io");
            socketPath = config.SOCKET_PREFIX + "/socket.io";
        }
        
        // Check if we already have the Express HTTP server
        if (app) {
            console.log("Starting SerGIS socket server with HTTP server...");
            // Use the same server instance for the socket.io server
            io = require("socket.io")(server, {
                path: socketPath
            });
        } else {
            console.log("Starting SerGIS socket server on port " + config.PORT + "...");
            // There's no HTTP server yet; make socket.io listen all by its lonesomes
            io = require("socket.io").listen(config.PORT, {
                path: socketPath
            });
        }
        
        if (config.SOCKET_ORIGIN) {
            console.log("Setting socket to allow origin " + config.HTTP_ORIGIN);
            io.origins(config.HTTP_ORIGIN);
        }

        // Create handlers for all our socket servers (see SOCKET_SERVERS above)
        for (var pathDescrip in SOCKET_SERVERS) {
            if (SOCKET_SERVERS.hasOwnProperty(pathDescrip)) {
                io.of(pathDescrip).use(require("./modules/socketServers/" + SOCKET_SERVERS[pathDescrip]));
            }
        }
    }
    
    // Always ready for more
    console.log("Ready\n");
}
