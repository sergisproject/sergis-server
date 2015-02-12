/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving sergis-client

// node modules
var fs = require("fs"),
    path = require("path");

var app, io, db, config;

// Valid username in URL

/**
 * Set up handlers and such.
 *
 * @param _app - The express app.
 * @param _io - The socket.io instance.
 * @param _db - The MongoDB database.
 * @param _config - The sergis-server configuration.
 */
exports.init = function (_app, _io, _db, _config) {
    app = _app; io = _io; db = _db; config = _config;
    
    // Homepage handler
    app.get(config.USERNAME_URL_REGEX, function (req, res) {
        var username = config.USERNAME_URL_REGEX.exec(req.path)[1] || "";
        // See if username exists
        db.collection("sergis-games").find({username: username}).toArray(function (err, games) {
            if (err || games.length == 0) username = "";
            // Render page
            res.render(config.HOMEPAGE_FILE, {
                "socket-io-script-src": "/socket.io/socket.io.js",
                "backend-script-src": "lib/backends/sergis-server.js",
                "backend-script-username": username
            });
        });
    });
    
    // Initialize socket
    io.of("/client").on("connection", function (socket) {
        // logIn handler
        socket.on("logIn", function (username, password, callback) {
            makeToken(callback, username, password);
        });
        
        // logOut handler
        socket.on("logOut", function (token, callback) {
            deleteToken(callback, token);
        });
        
        // getUser handler
        socket.on("getUser", function (username, callback) {
            // Try logging in with only a username, if available
            if (!username) {
                callback();
            } else {
                makeToken(callback, username);
            }
        });
        
        // game function handler
        socket.on("game", function (token, func, args, callback) {
            if (game.hasOwnProperty(func) && typeof game[func] == "function") {
                var sergisTokens = db.collection("sergis-tokens");
                sergisTokens.find({token: token}).toArray(function (err, tokens) {
                    if (err) {
                        console.error("Error checking sergis-tokens database: ", err);
                        callback(false, "Database error");
                        return;
                    }
                    
                    if (tokens.length == 0) {
                        callback(false, "Invalid token");
                        return;
                    }
                    
                    db.collection("sergis-games").find({username: tokens[0].username}).toArray(function (err, games) {
                        if (err) {
                            console.error("Error checking sergis-games database: ", err);
                            callback(false, "Database error");
                            return;
                        }
                        
                        if (games.length == 0) {
                            callback(false, "Invalid token session");
                            return;
                        }
                        
                        var state = tokens[0].state;
                        game[func].apply(game, [
                            games[0].jsondata,
                            state,
                            function () {
                                sergisTokens.update({token: tokens[0].token},
                                                    {$set: {state: state}},
                                                    function (err, result) {
                                    if (err) {
                                        console.error("Error updating sergis-tokens database: ", err);
                                    }
                                });
                            },
                            function (data) { callback(true, data); },
                            function (data) { callback(false, data); }
                        ].concat(args));
                    });
                });
            } else {
                callback(false, func + " does not exist.");
            }
        });
    });
};

///////////////////////////////////////////////////////////////////////////////
// Game functions
// (NOTE: These are heavily related to sergis-client/lib/backends/local.js)
var game = {
    getPreviousMapActions: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList) {
            reject("Invalid JSON Game Data.");
            return;
        }
        
        var actions = [],
            nonMapActions = ["explain", "goto", "logout"];

        var pushActions = function (promptIndex) {
            // If onJumpBack=="hide", make sure that we don't show "future" happenings (and make sure a choice exists)
            if ((promptIndex < state.currentPromptIndex || jsondata.onJumpBack != "hide") && typeof state.userChoices[promptIndex] == "number") {
                var actionList = jsondata.promptList[promptIndex].actionList[state.userChoices[promptIndex]],
                    i, action;
                if (actionList.actions) {
                    for (i = 0; i < actionList.actions.length; i++) {
                        action = actionList.actions[i];
                        if (action && action.name && nonMapActions.indexOf(action.name) == -1) {
                            actions.push(action);
                        }
                    }
                }
            }
        };

        if (jsondata.showActionsInUserOrder) {
            // Return the actions in the order that the user chose them
            for (var promptIndex, i = 0; i < state.userChoiceOrder.length; promptIndex = state.userChoiceOrder[++i]) {
                pushActions(promptIndex);
            }
        } else {
            // Return the actions in the order of the prompts
            for (var promptIndex = 0; promptIndex < state.userChoices.length; promptIndex++) {
                pushActions(promptIndex);
            }
        }
        resolve(actions);
    },

    getPromptCount: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList) {
            reject("Invalid JSON Game Data.");
            return;
        }
        
        resolve(jsondata.promptList.length);
    },

    getPrompt: function (jsondata, state, updateState, resolve, reject, promptIndex) {
        if (!jsondata || !jsondata.promptList) {
            reject("Invalid JSON Game Data.");
            return;
        }
        
        // Check if promptIndex is equal to where we're expecting to go
        if (promptIndex == state.nextAllowedPromptIndex) {
            // We're good... we're expecting the user to go to this prompt
            state.nextAllowedPromptIndex = null;
            updateState();
        } else {
            // We're not sure if the user can go to this prompt index, let's check...
            if (promptIndex < state.currentPromptIndex) {
                // Jumping backwards!
                if (!jsondata.jumpingBackAllowed) {
                    // BAD!!
                    reject("Jumping back not allowed!");
                    return;
                } else {
                    // Check onJumpBack (this is also checked in getPreviousMapActions)
                    if (jsondata.onJumpBack == "reset") {
                        // Get rid of the user's "future" choices
                        state.userChoices.splice(promptIndex, state.userChoices.length - promptIndex);
                        updateState();
                    }

                }
            } else if (promptIndex > state.currentPromptIndex + 1) {
                // Jumping forwards!
                if (!jsondata.jumpingForwardAllowed) {
                    // BAD!!
                    reject("Jumping forward not allowed!");
                    return;
                }
            } // else: Either same promptIndex, or the next one (always allowed)
        }

        // If we're here, then everything's good to continue
        state.currentPromptIndex = promptIndex;
        // Clear out any possible history of responses to this question
        if (typeof state.userChoices[promptIndex] == "number") {
            delete state.userChoices[promptIndex];
        }
        if (state.userChoiceOrder.indexOf(promptIndex) != -1) {
            state.userChoiceOrder.splice(state.userChoiceOrder.indexOf(promptIndex), 1);
        }
        updateState();
        // Finally, resolve with the prompt
        resolve(jsondata.promptList[promptIndex].prompt);
    },

    getActions: function (jsondata, state, updateState, resolve, reject, promptIndex, choiceIndex) {
        if (!jsondata || !jsondata.promptList) {
            reject("Invalid JSON Game Data.");
            return;
        }
        
        // Store the user's choice (so we can access it later using getPreviousMapActions)
        state.userChoices[promptIndex] = choiceIndex;
        // Store the order
        if (state.userChoiceOrder.indexOf(promptIndex) != -1) {
            state.userChoiceOrder.splice(state.userChoiceOrder.indexOf(promptIndex), 1);
        }
        state.userChoiceOrder.push(promptIndex);
        updateState();
        
        // Get the actions (if there are any)
        var actions = (jsondata.promptList[promptIndex].actionList &&
                       jsondata.promptList[promptIndex].actionList[choiceIndex] &&
                       jsondata.promptList[promptIndex].actionList[choiceIndex].actions) || [];
        var last = actions[actions.length - 1];
        // Check if there is a "goto" that would affect the question sequence
        // (to make sure that, if jumping is disabled, it doesn't yell at the user for going in a non-sequential order)
        if (last && last.name && last.name == "goto" && last.data && last.data.length) {
            state.nextAllowedPromptIndex = last.data[0];
        } else {
            state.nextAllowedPromptIndex = null;
        }
        updateState();
        
        // Finally, resolve with the actions
        resolve(actions);
    },

    getGameOverContent: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList) {
            reject("Invalid JSON Game Data.");
            return;
        }
        
        var breakdown = "<table><thead><tr>" +
            "<th>Question</th><th>Your Score</th><th>Possible Points</th>" +
            "</tr></thead><tbody>";
        var i, j, score, best, pointValue, totalScore = 0;
        for (i = 0; i < jsondata.promptList.length; i++) {
            // Just skip over this if there aren't any actions at all
            if (jsondata.promptList[i].actionList && jsondata.promptList[i].actionList.length) {
                breakdown += "<tr><td>" + (i + 1) + "</td>";
                // Calculate score for this prompt
                score = 0;
                if (typeof state.userChoices[i] == "number") {
                    score += jsondata.promptList[i].actionList[state.userChoices[i]].pointValue || 0;
                }
                totalScore += score;
                breakdown += "<td>" + score + "</td>";
                // Calculate best score for this prompt
                best = 0
                for (j = 0; j < jsondata.promptList[i].actionList.length; j++) {
                    pointValue = jsondata.promptList[i].actionList[j].pointValue;
                    if (pointValue && pointValue > best) {
                        best = pointValue;
                    }
                }
                breakdown += "<td>" + best + "</td>";
                breakdown += "</tr>";
            }
        }
        breakdown += "</tbody></table>";
        resolve([
            {"type": "html", "value": "<h3>Congratulations!</h3>"},
            {"type": "text", "value": "You have completed SerGIS."},
            {"type": "html", "value": "Your total score was: <b>" + totalScore + "</b>"},
            {"type": "text", "value": "Scoring breakdown:"},
            {"type": "html", "value": breakdown}
        ]);
    }
};


/**
 * Make a quick and dirty random integer.
 *
 * @param {number} d - The number of digits in the number.
 */
function randInt(d) {
    return Math.floor((Math.random() * 9 + 1) * Math.pow(10, d-1));
}

/**
 * Get user info and create an auth token.
 *
 * @param {Function} callback - Called with (userObject, authToken).
 * @param {string} username - The username.
 * @param {string} [password] - The password.
 */
function makeToken(callback, username, password) {
    db.collection("sergis-games").find({username: username}).toArray(function (err, games) {
        if (err) {
            console.error("Error accessing user in sergis-games database: ", err);
            callback();
        } else if (games.length > 0) {
            if ((!games[0].password || games[0].password === password)) {
                // All good, make a token!
                var token = Number(randInt(10) + "" + (new Date()).getTime() + "" + randInt(10)).toString(36);
                db.collection("sergis-tokens").insert({
                    token: token,
                    username: username,
                    state: {
                        // Default state
                        currentPromptIndex: null,
                        nextAllowedPromptIndex: null,
                        userChoices: [],
                        userChoiceOrder: []
                    }
                }, function (err, result) {
                    if (err) {
                        console.error("Error inserting into sergis-tokens database: ", err);
                        callback(false);
                        return;
                    }
                    callback({
                        displayName: games[0].username,
                        jumpingBackAllowed: !!games[0].jsondata.jumpingBackAllowed,
                        jumpingForwardAllowed: !!games[0].jsondata.jumpingForwardAllowed
                    }, token);
                });
            } else {
                // Good username, bas password
                callback(false);
            }
        } else {
            // Bad username
            callback();
        }
    });
}

/**
 * Delete an auth token (i.e., log a user out).
 *
 * @param {Function} callback - Called with true if successful, or false
 *                   otherwise.
 * @param {string} token - The auth token.
 */
function deleteToken(callback, token) {
    db.collection("sergis-tokens").remove({token: token}, function (err, result) {
        if (err) {
            console.error("Error removing from sergis-tokens database: ", err);
            callback(false);
        } else {
            callback(true);
        }
    });
}
