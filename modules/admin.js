/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving administrative pages
// for sergis-server.

// node modules
var fs = require("fs"),
    path = require("path");

// required modules
var bodyParser = require("body-parser");

var app, io, db, config;

/**
 * Render the admin page.
 *
 * @param res - The Express response object.
 * @param vars - The variables for the template.
 */
function renderAdmin(res, vars) {
    res.render(path.join(config.TEMPLATES_DIR, "admin.html"), vars);
}

/**
 * Set up handlers and such.
 *
 * @param _app - The express app.
 * @param _io - The socket.io instance.
 * @param _db - The MongoDB database.
 * @param _config - The sergis-server configuration.
 */
function init(_app, _io, _db, _config) {
    app = _app; io = _io; db = _db; config = _config;
    
    // Admin homepage
    app.get("/" + config.ADMIN_PAGE_NAME, function (req, res) {
        db.collection("sergis-games").find({}).toArray(function (err, games) {
            if (err) {
                console.error("Error finding all in sergis-games database: ", err);
                res.status(500);
                renderAdmin(res, {
                    error: {
                        title: "Database Error",
                        text: "See console."
                    }
                });
            } else {
                var gamesList = [];
                for (var i = 0; i < games.length; i++) {
                    gamesList.push({
                        username: games[i].username,
                        password: games[i].password,
                        jsondata: JSON.stringify(games[i].jsondata),
                        url: req.protocol + "://" + req.hostname + ((req.protocol == "http" && config.PORT == 80) || (req.protocol == "https" && config.PORT == 443) ? "" : ":" + config.PORT) + "/" + games[i].username
                    });
                }
                renderAdmin(res, {
                    noerror: true,
                    games: gamesList,
                    yesgames: gamesList.length > 0,
                    nogames: gamesList.length == 0
                });
            }
        });
    });

    app.use("/admin", bodyParser.urlencoded({extended: true}));

    app.post("/admin", function (req, res) {
        var games = db.collection("sergis-games");
        if (req.body.delete) {
            // Delete game (by username)
            games.remove({username: req.body.delete}, function (err, result) {
                if (err) {
                    console.error("Error removing from sergis-games database: ", err);
                    res.status(500);
                    renderAdmin(res, {
                        error: {
                            title: "Database Error",
                            text: "See console."
                        }
                    });
                } else {
                    console.log("Removed document from sergis-games database: ", result);
                    res.redirect("/admin");
                }
            });
        } else if (req.body.jsondata && req.body.username) {
            // Check username
            if (config.USERNAME_REGEX.test(req.body.username) == false ||
                // We can't have the same name as the admin page...
                req.body.username.toLowerCase() == config.ADMIN_PAGE_NAME.toLowerCase() ||
                // We can't have the same name as the static files directory...
                req.body.username.toLowerCase() == "lib") {
                
                renderAdmin(res, {
                    error: {
                        text: "Invalid username."
                    }
                });
                return;
            }
            
            // Check JSON data
            try {
                var jsondata = JSON.parse(req.body.jsondata);
            } catch (err) {}
            if (!jsondata) {
                renderAdmin(res, {
                    error: {
                        text: "Invalid JSON data."
                    }
                });
                return;
            }
            
            // Check username existance
            var username = req.body.username.toLowerCase(),
                password = req.body.password;
            games.find({username: username}).toArray(function (err, games) {
                // Check for database error
                if (err) {
                    console.error("Error checking sergis-games database: ", err);
                    res.status(500);
                    renderAdmin(res, {
                        error: {
                            title: "Database Error",
                            text: "See console."
                        }
                    });
                    return;
                }
                
                // Check username existance
                if (games.length > 0) {
                    renderAdmin(res, {
                        error: {
                            text: "Username has already been used."
                        }
                    });
                    return;
                }
                
                // Add game to database
                var game = {
                    jsondata: jsondata,
                    username: username,
                    password: password
                };
                db.collection("sergis-games").insert(game, function (err, result) {
                    // Check for database error
                    if (err) {
                        console.error("Error inserting into sergis-games database: ", err);
                        res.status(500);
                        renderAdmin(res, {
                            error: {
                                title: "Database Error",
                                text: "See console."
                            }
                        });
                        return;
                    }
                    
                    // We're good!
                    console.log("Inserted document into sergis-games database: ", result);
                    res.redirect("/admin");
                });
            });
        } else {
            // Neither deletion nor insertion... (or missing data)
            renderAdmin(res, {
                error: {
                    text: "Please enter data for all required fields."
                }
            });
        }
    });
}

exports.init = init;
