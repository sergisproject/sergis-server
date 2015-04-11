/*
    The SerGIS Project - sergis-server

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.
 */

// This file handles everything having to do with serving the socket for
// sergis-client

// our modules
var config = require("../../config"),
    db = require("../db");


/**
 * Initialize the handler for connections to the "/game" socket.
 * This is called each time a new connection is made to the "/game" socket.
 *
 * @param socket - The Socket instance.
 * @param {Function} next - The function to call once we have initialized
 *        the socket on our end.
 */
module.exports = function (socket, next) {
    // logIn handler
    socket.on("logIn", function (gameOwner, gameName, username, password, callback) {
        db.games.makeAuthenticatedGameToken(gameOwner, gameName, username, password, function (err, userObject, authToken) {
            if (err) return callback();
            callback(userObject, authToken);
        });
    });

    // getUser handler
    socket.on("getUser", function (gameOwner, gameName, sessionID, callback) {
        if (!gameOwner || !gameName) {
            return callback();
        }
        
        function last_resort() {
            // Try logging in without authentication, if possible
            db.games.makeAnonymousGameToken(gameOwner, gameName, function (err, userObject, authToken) {
                if (err) return callback();
                callback(userObject, authToken);
            });
        };
        
        if (!sessionID) {
            return last_resort();
        }
        
        // Since we have a session ID, try looking up username from that
        db.getSessionByID(sessionID, function (err, session) {
            if (err || !session || !session.username) {
                // No session
                return last_resort();
            }
            
            // We should be good!
            db.games.makeGameToken(gameOwner, gameName, session.username, function (err, userObject, authToken) {
                if (err) return callback();
                callback(userObject, authToken);
            });
        });
    });

    // game function handler
    socket.on("game", function (token, func, args, callback) {
        if (gameFunctions.hasOwnProperty(func) && typeof gameFunctions[func] == "function") {
            db.games.getGameAndTokenData(token, function (err, game, tokenData) {
                if (err) {
                    return callback(false, "Server error");
                }
                
                if (!game || !tokenData) {
                    return callback(false, "Invalid token");
                }

                var state = tokenData.state;
                gameFunctions[func].apply(game, [
                    // jsondata
                    game.jsondata,
                    // state
                    state,
                    // updateState
                    function (shouldDeleteSession, callback) {
                        if (shouldDeleteSession) {
                            db.games.deleteGameToken(token, function (err, result) {
                                callback(err);
                            });
                        } else {
                            db.games.updateGameTokenData(tokenData.token, {state: state}, function (err, success) {
                                // Yay! (hopefully)
                            });
                        }
                    },
                    // resolve
                    function (data) { callback(true, data); },
                    // reject
                    function (data) { callback(false, data); }
                ].concat(args));
            });
        } else {
            return callback(false, func + " does not exist.");
        }
    });


    // Everything's initialized for us; move on!
    return next();
};



///////////////////////////////////////////////////////////////////////////////
// Game functions
// (NOTE: These are heavily related to sergis-client/lib/backends/local.js)
var gameFunctions = {
    getPreviousMapActions: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList) {
            return reject("Invalid JSON Game Data.");
        }
        
        var actions = [],
            nonMapActions = ["explain", "endGame", "goto"];

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
        return resolve(actions);
    },

    getPromptCount: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList || !jsondata.promptList.length) {
            return reject("Invalid JSON Game Data.");
        }
        
        return resolve(jsondata.promptList.length);
    },

    getPrompt: function (jsondata, state, updateState, resolve, reject, promptIndex) {
        if (!jsondata || !jsondata.promptList) {
            return reject("Invalid JSON Game Data.");
        }
        
        // Make sure the promptIndex exists
        if (promptIndex < 0 || promptIndex >= jsondata.promptList.length) {
            // BAD!!
            return reject("Invalid promptIndex.");
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
                    return reject("Jumping back not allowed!");
                }
            } else if (promptIndex > state.currentPromptIndex + 1) {
                // Jumping forwards!
                if (!jsondata.jumpingForwardAllowed) {
                    // BAD!!
                    return reject("Jumping forward not allowed!");
                }
            } // else: Either same promptIndex, or the next one (always allowed)
        }
        
        // If we're jumping backwards, check onJumpBack (this is also checked in getPreviousMapActions)
        if (promptIndex < state.currentPromptIndex) {
            if (jsondata.onJumpBack == "reset") {
                // Get rid of the user's "future" choices
                state.userChoices.splice(promptIndex, state.userChoices.length - promptIndex);
                updateState();
            }
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
        return resolve(jsondata.promptList[promptIndex].prompt);
    },

    getActions: function (jsondata, state, updateState, resolve, reject, promptIndex, choiceIndex) {
        if (!jsondata || !jsondata.promptList) {
            return reject("Invalid JSON Game Data.");
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
        return resolve(actions);
    },

    getGameOverContent: function (jsondata, state, updateState, resolve, reject) {
        if (!jsondata || !jsondata.promptList) {
            return reject("Invalid JSON Game Data.");
        }
        
        var breakdown = "<table><thead><tr>" +
            "<th>Question</th><th>Your Score</th><th>Possible Points</th>" +
            "</tr></thead><tbody>";
        var i, j, score, best, worst, pointValue, title, totalScore = 0;
        for (i = 0; i < jsondata.promptList.length; i++) {
            // Just skip over this if there aren't any actions at all
            if (jsondata.promptList[i].actionList && jsondata.promptList[i].actionList.length) {
                // Calculate score for this prompt
                score = 0;
                if (typeof state.userChoices[i] == "number") {
                    score += jsondata.promptList[i].actionList[state.userChoices[i]].pointValue || 0;
                }
                totalScore += score;
                // Calculate best score for this prompt
                best = 0;
                worst = 0;
                for (j = 0; j < jsondata.promptList[i].actionList.length; j++) {
                    pointValue = jsondata.promptList[i].actionList[j].pointValue;
                    if (pointValue && pointValue > best) best = pointValue;
                    if (pointValue && pointValue < worst) worst = pointValue;
                }
                // Make sure that at least one of the choices has a point value
                // (Otherwise, it's not really important)
                if (best != 0 || worst != 0) {
                    title = jsondata.promptList[i].prompt.title || "";
                    if (title) title = " (" + title + ")";
                    title = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
                    breakdown += "<tr><td>" + (i + 1) + title + "</td>";
                    breakdown += "<td>" + score + "</td>";
                    breakdown += "<td>" + best + "</td>";
                    breakdown += "</tr>";
                }
            }
        }
        breakdown += "</tbody></table>";
        
        // We're done, so delete the game token
        updateState(true, function (err) {
            if (err) return reject();
            
            return resolve([
                {"type": "html", "value": "<h3>Congratulations!</h3>"},
                {"type": "text", "value": "You have completed SerGIS."},
                {"type": "html", "value": "Your total score was: <b>" + totalScore + "</b>"},
                {"type": "text", "value": "Scoring breakdown:"},
                {"type": "html", "value": breakdown}
            ]);
        });
    }
};
