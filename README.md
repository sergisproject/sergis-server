# SerGIS Server

The Node.js-based server for interaction with the SerGIS Web Client for [the SerGIS Project](http://sergisproject.github.io/)

## Pre-reqs

The server must have a recent version of [node.js](http://www.nodejs.org/) and [npm](https://npmjs.org/) (usually installed with node.js).

SerGIS Server has a few node.js dependencies; to install these, run `npm install` in a terminal in the root directory of the codebase. Also, make sure the submodules in `sergis-author` and `sergis-client` are there (if you cloned the git repo, run `git submodule init` and/or `git submodule update`).

Also, SerGIS Server requires a running [MongoDB](https://www.mongodb.org/) server.

## TODOs

- Add ability to sort the tables of games, users, etc.
- As Full Admin, on the Admin page, add ability to filter users by organization.
- Combine all of the repeated code in local.js (sergis-client) and gameSocketHandler.js (sergis-server), based more on the sergis-server version. Put it in a single "shared" file somewhere in sergis-client. (Also, with this, make config.js vars regarding the location of stuff in sergis-client just point to the sergis-client dir and we can figure out its subdirs from there.)
- Add ability to change the name of existing games (if either we own the game, or we're an admin)
- Add ability to edit existing games (if either we own the game, or if we're an admin)
- For the "Publish" page (that's shown in the Author), give the user 2 radio button choices:
      [*]  Create new game: ____________
      [ ]  Overwrite existing game: [--dropdown-w/-existing-games--]

## License

    Copyright (c) 2015, SerGIS Project Contributors. All rights reserved.
    Use of this source code is governed by the MIT License, which can be found
    in the LICENSE.txt file.

For more, see `LICENSE.txt` and `CONTRIBUTORS.txt`.
