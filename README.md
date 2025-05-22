# pmc-website
This is the website for The Pure Math, Applied Math, Combinatorics &amp; Optimization Club under the Mathematics Society of the Waterloo Undergraduate Student Association at the University of Waterloo (PMC for short), hosted at [puremath.club](https://puremath.club).

## Stack
The website runs a lightweight stack, with only a few packages on top of Express with Node.js (mostly for MySQL database connections and Markdown rendering). The client's experience is JavaScript-free, except for MathJax for rendering LaTeX.

Pug (formerly Jade) is used as the templating engine for all pages. Events, POTWs (problem of the week), and more are stored in a MySQL database. The website provides a simple CMS for club executives to manage content and configure some aspects of the website.

## Accessing the website
The website is served via a Node server hosted on a virtual machine named `sacred-shoe` on CSC Cloud (`172.19.134.46`), and auto-starts via the `pm2` daemon on the `pmclub` account. The MySQL database should also be accessed from this machine (it can be accessed passwordless from the `pmclub` and `root` accounts).

### Logging In
To get access to the `pmclub` account as a club executive, ask someone else with access to add your SSH public key. Once this is done, SSH in, and the website files are in `~/www` (symlink to `/mnt/www`).

### Webserver Session
The website's Node process is managed through `pm2`. It should start automatically whenever the machine starts. Relevant commands include `pm2 start`, `pm2 stop pmc-website`, `pm2 restart pmc-website`, and so on.

Note that the website listens on port 3000, but UFW has been set up to forward requests on port 80 to port 3000. If you need to modify the UFW rules, be *very* careful not to disallow connections to port 22, otherwise you will be unable to connect to the server via SSH.

### Updating
The `~/www` directory contains this Git directory. Please push any changes you make to files, and make sure to pull changes and restart the Node instance if changes are made.
