/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with login, account permissions,
// and other shared functionality.

// our modules
var config = require("../config"),
    db = require("./db");


////////////////////////////////////////////////////////////////////////////////
// Handlers for different required permissions, etc.
var accounts = module.exports = {
    /**
     * Populate req.user if a user is logged in.
     *
     * Preconditions:
     *     The user ID of a logged-in user is in req.session.user_id if a user
     *     is logged in.
     *
     * Postconditions:
     *     req.user is set to the User if a user is logged in.
     */
    checkUser: function (req, res, next) {
        if (req.session && req.session.user_id) {
            db.models.User.findById(req.session.user_id)
                          .populate("organization")
                          .exec().then(function (user) {
                if (!user) return Promise.reject("Invalid user ID in session.");
                
                // All good; store the user with the request.
                req.user = user;
                // And, continue on our merry way
                return next();
            }).then(null, function (err) {
                // Bad username in session!
                // Destroy the session
                req.session.destroy(function (err) {
                    if (err){
                        console.error("ERROR DESTROYING SESSION: ", err.stack);
                    }
                    // Now, we can just continue, since the login page will show if needed
                    return next();
                });
            });
        } else {
            // No user
            return next();
        }
    },
    
    /**
     * Make sure that we're logged in.
     *
     * Preconditions:
     *     If we are already logged in, req.user is set. (You can use checkUser
     *     to accomplish this.)
     *
     * Postconditions:
     *     A user is logged in.
     */
    requireLogin: function (req, res, next) {
        // Test admin account, if we don't have any accounts in the database yet
        if (config.ASSUME_ADMIN) {
            // WARNING: EVERYONE IS AN ADMIN! EXTREMELY UNSAFE!!
            console.log("WARNING: ASSUMING ADMIN FOR EVERYBODY!\nSet ASSUME_ADMIN to false in config.js");
            req.user = {
                username: "TempAdmin",
                username_lowercase: "tempadmin",
                encryptedPassword: "",
                name: "WARNING: Set ASSUME_ADMIN to false in config.js",
                isFullAdmin: true
            };
        }

        // Is it a login request?
        if (req.method == "POST" && req.body.login == "account-login") {
            // Pass control to loginPost
            return pageHandlers.loginPost(req, res, next);
        } else if (!req.user) {
            // No user session!!
            // Store any POST data coming to this page before we show the login page
            if (req.method == "POST") {
                var postData = [];
                if (req.body) {
                    for (var item in req.body) {
                        if (req.body.hasOwnProperty(item)) {
                            postData.push([item, req.body[item]]);
                        }
                    }
                }
                req.session.preLoginPostData = postData;
            }
            // Serve login page
            pageHandlers.loginGet(req, res, next);
        } else {
            // Everything's good; just continue on our merry way!
            return next();
        }
    },
    
    /**
     * Get the account in question for an account URL, and make sure that the
     * user has permission to access.
     *
     * Preconditions:
     *     Requires that a user is already logged in (use `requireLogin` for
     *     this) and requires that req.params.username contains the username of
     *     the other account.
     *
     * Postconditions:
     *     req.otherUser is set to the other user.
     */
    requireOtherAccountAccess: function (req, res, next) {
        var otherUsername = req.params.username;
        // Let's get the data on the account that we're trying to open
        db.models.User.findOne({username_lowercase: otherUsername.toLowerCase()})
                      .populate("organization")
                      .exec().then(function (otherUser) {
            if (!otherUser) {
                // The other user doesn't exist!
                // Send a 404 if we're admin, 403 otherwise.
                req.error = {number: user.isFullAdmin ? 404 : 403};
                return next("route");
            }
            
            // Alrighty, now, do we have permission to access him?
            if (!req.user.canModifyUser(otherUser)) {
                // Not allowed Send along a good ol' 403
                req.error = {number: 403};
                return next("route");
            }
            
            // Alrighty, finally, yes, we do have permission to access this guy, no matter who he is
            req.otherUser = otherUser;
            return next();
        }).then(null, function (err) {
            return next(err);
        });
    },
    
    /**
     * Create a new game.
     *
     * If jsondata is not provided, we will look in req.files.jsondata.
     */
    createGame: function (req, res, next, user, gameName, access, jsondata, nostyle) {
        // First, make sure everything's here and good
        if (!gameName) {
            return res.render("error-back.hbs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Game name is missing.",
                nostyle: nostyle
            });
        }
        if (!config.URL_SAFE_REGEX.test(gameName)) {
            return res.render("error-back.hbs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid game name. Game names may consist of any letters, digits, and the following characters: " + config.URL_SAFE_REGEX_CHARS,
                nostyle: nostyle
            });
        }
        if (!access || ["public", "organization", "private"].indexOf(access) == -1) {
            return res.render("error-back.hbs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "Invalid access level.",
                nostyle: nostyle
            });
        }
        if (!jsondata && !req.files.jsonfile) {
            return res.render("error-back.hbs", {
                title: "SerGIS Account - " + user.username,
                subtitle: "Error Creating Game",
                details: "No SerGIS JSON Game Data file has been provided.",
                nostyle: nostyle
            });
        }
        
        // Now, check the JSON game data
        if (!jsondata) {
            var jsonerr;
            try {
                jsondata = JSON.parse(req.files.jsonfile.buffer.toString());
            } catch (err) {
                jsondata = null;
                jsonerr = err;
            }
            if (!jsondata) {
                return res.render("error-back.hbs", {
                    title: "SerGIS Account - " + user.username,
                    subtitle: "Error Creating Game",
                    details: "Invalid SerGIS JSON Game Data file.\n\n" + (jsonerr ? jsonerr.name + ": " + jsonerr.message : ""),
                    nostyle: nostyle
                });
            }
        }

        // Next, try to make the game
        var newGame = new db.models.Game({
            name: gameName,
            name_lowercase: gameName.toLowerCase(),
            owner: user,
            access: access,
            jsondata: jsondata
        });
        newGame.save().then(function () {
            // Hooray, all done!
            req.statusMessages = [gameName + " created successfully!"];
            return next();
        }, function (err) {
            // Check the error that we gotst
            if (err && err.name == "ValidationError") {
                // Ahh! ValidationError!
                return res.render("error-back.hbs", {
                    title: "SerGIS Account - " + user.username,
                    subtitle: "Error Creating Game",
                    details: "Error creating game \"" + gameName + "\". Game names must be unique.",
                    nostyle: nostyle
                });
            } else {
                // Some other error; bubble up
                return next(err);
            }
        });
    },
    
    /**
     * Delete a user and all their associated games.
     *
     * @param {User} user - The user to remove.
     *
     * @return {Promise}
     */
    deleteUser: function (user) {
        // Make sure the user isn't a full admin
        if (user.isFullAdmin) {
            // AHH!
            return Promise.reject("User is a Full Admin.");
        }
        
        // First, delete any games owned by this user
        return Promise.resolve(db.models.Game.remove({owner: user._id}).exec()).then(function () {
            // Next, delete the user
            return user.remove();
        });
    }
};


var pageHandlers = {
    /**
     * Handle GET requests to the login page.
     */
    loginGet: function (req, res, next, loginErrorMsg) {
        res.render("account-login.hbs", {
            title: "SerGIS Login",
            loginPage: true,
            error: loginErrorMsg
        });
    },
    
    /**
     * Handle POST requests to the login page.
     */
    loginPost: function (req, res, next) {
        if (req.body.login != "account-login") {
            req.error = {number: 400};
            return next("route");
        }
        
        // Kill any previous account that the user might have been logged in to
        req.session.user_id = undefined;
        req.user = undefined;
        // See if it's valid
        db.models.User.checkLoginInfo(req.body.username, req.body.password).then(function (user) {
            if (!user) {
                // Bad username/password
                pageHandlers.loginGet(req, res, next, "Username or password incorrect.");
                return;
            }
            
            // Yay, all correct!
            // Store the user ID in the session
            req.session.user_id = user._id;
            
            // Store the user with the request
            req.user = user;
            
            // Check if it was a POST request before
            var postData = req.session.preLoginPostData;
            if (postData) {
                // Re-add any pre-login POST data
                for (var i = 0; i < postData.length; i++) {
                    req.body[postData[i][0]] = postData[i][1];
                }
                req.session.preLoginPostData = undefined;

                // Continue on our merry way (no redirecting, since we need it to be POST anyway)
                return next();
            }

            // Redirect to wherever we were before login
            res.redirect(req.baseUrl + req.path);
        }).then(null, function (err) {
            next(err);
        });
    }
};
